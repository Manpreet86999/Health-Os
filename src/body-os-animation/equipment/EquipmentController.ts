import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { EquipmentAttachmentPoint, HumanoidBoneName } from '../core/types.js';
import { AttachmentSystem, type CharacterSkeletonProvider, type AttachmentRecord } from './AttachmentSystem.js';
import { EQUIPMENT_REGISTRY, type ExtendedEquipmentDefinition } from './EquipmentRegistry.js';
import { resolveEquipmentAnchor, selectProductionRoot } from './ProductionAnchors.js';

/**
 * Async function that loads a production GLB URL into a Three.js scene.
 * Injectable for hermetic tests (defaults to Three.js GLTFLoader).
 */
export type ProductionGlbLoader = (glbUrl: string) => Promise<THREE.Object3D>;

/**
 * Health OS Equipment Controller — Phase 4: Equipment & Interaction System
 * Stage 4: Production V1 GLB loading with procedural fallback.
 *
 * Responsibilities:
 * - Production GLB loading via Three.js GLTFLoader (cached base asset,
 *   independent cloned instances, no repeated network loads)
 * - Procedural generation of high-fidelity Health OS equipment meshes
 *   (retained as fallback when a production GLB fails to load)
 * - Intelligent attachment: automatically selects parent / two-hand / world-static mode
 * - Per-frame update loop for constraint solving (two-hand barbell)
 * - Memory management: proper disposal on controller disposal
 * - Equipment cache with clone-per-instance pattern
 */
export class EquipmentController {
  private attachmentSystem: AttachmentSystem = new AttachmentSystem();
  private equipmentCache: Map<string, THREE.Object3D> = new Map();
  private activeInstances: THREE.Object3D[] = [];
  private gltfLoader: GLTFLoader = new GLTFLoader();
  private modelLoaderOverride: ProductionGlbLoader | null = null;
  /** In-flight GLB loads, keyed by GLB URL — prevents repeated network loads. */
  private loadPromises: Map<string, Promise<THREE.Object3D | null>> = new Map();
  /** Equipment IDs whose cached base came from a production GLB. */
  private productionBacked: Set<string> = new Set<string>();
  /**
   * Upper bound for a single production GLB fetch. Guarantees exercise
   * loading always settles (procedural fallback) even when the underlying
   * loader neither resolves nor rejects (stalled connection / offline CDN).
   * Overridable via BODY_OS_EQUIPMENT_GLB_TIMEOUT_MS (milliseconds).
   */
  private readonly glbTimeoutMs: number = (() => {
    try {
      // globalThis-typed access keeps this module compiling under DOM-only
      // lib settings (vite/client); Node test/Vite runtimes provide process.
      const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
      const raw = proc?.env?.['BODY_OS_EQUIPMENT_GLB_TIMEOUT_MS'];
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 4000;
    } catch {
      return 4000;
    }
  })();

  setSceneRoot(root: THREE.Object3D): void {
    this.attachmentSystem.setSceneRoot(root);
  }

  /**
   * Loads and attaches all equipment for an exercise definition.
   * Detaches any previously attached equipment first.
   */
  async loadAndAttach(
    attachments: EquipmentAttachmentPoint[],
    character: CharacterSkeletonProvider
  ): Promise<void> {
    this.detachAll();

    // Host instances attached earlier in this same call, keyed by
    // equipment id — used for Stage 5 equipment-mounted attachments
    // (e.g. plates onto the barbell).
    const attachedById = new Map<string, THREE.Object3D>();

    for (const att of attachments) {
      const model = await this.getOrCreateModel(att.id);
      if (!model) continue;

      const instance = model.clone(true);
      instance.name = `equipment_instance_${att.id}_${att.attachToBone}`;
      this.activeInstances.push(instance);

      const equipDef = EQUIPMENT_REGISTRY[att.id];

      if (att.attachToEquipment) {
        // Stage 5: mount onto a sibling equipment instance via its
        // production anchor. Manifests order hosts before mounted items.
        const host = attachedById.get(att.attachToEquipment);
        if (!host) {
          console.warn(
            `[EquipmentController] Mount host "${att.attachToEquipment}" not attached before "${att.id}"; skipping.`
          );
          this.activeInstances.pop();
          continue;
        }
        this.attachmentSystem.attachToEquipment(instance, att, host, att.anchorBodyosId);
        attachedById.set(att.id, instance);
      } else if (equipDef?.constraint?.mode === 'two-hand') {
        // Two-hand constraint: position barbell between two hand bones
        const boneA = (equipDef.constraint.boneA || 'leftHand') as HumanoidBoneName;
        const boneB = (equipDef.constraint.boneB || 'rightHand') as HumanoidBoneName;
        this.attachmentSystem.attachTwoHand(
          instance,
          att,
          character,
          boneA,
          boneB,
          {
            centerOffset: equipDef.constraint.centerOffset,
            rotationOffset: equipDef.constraint.rotationOffset,
            barAxisX: true,
          }
        );
      } else if (equipDef?.constraint?.mode === 'world-static') {
        // World-static: place on the floor at a fixed position
        this.attachmentSystem.attachWorldStatic(
          instance,
          att,
          character,
          equipDef.constraint.worldPosition || att.offset?.position,
          equipDef.constraint.worldRotation || att.offset?.rotation
        );
      } else {
        // Default: parent to bone, anchor-compensated when the production
        // model carries a metadata anchor for this socket.
        const anchorBodyosId = equipDef?.production?.anchors?.[att.socketName];
        this.attachmentSystem.attach(instance, att, character, anchorBodyosId ? { anchorBodyosId } : undefined);
      }
      attachedById.set(att.id, instance);
    }
  }

  /**
   * Per-frame update — must be called in the render loop to solve
   * two-hand constraints (barbell midpoint tracking).
   */
  update(): void {
    this.attachmentSystem.update();
  }

  /**
   * Overrides the production GLB loading function (test hook).
   * Pass null to restore the default Three.js GLTFLoader path.
   */
  setModelLoader(loader: ProductionGlbLoader | null): void {
    this.modelLoaderOverride = loader;
  }

  /** True when the cached base model for `equipmentId` is production-GLB backed. */
  isProductionBacked(equipmentId: string): boolean {
    return this.productionBacked.has(equipmentId);
  }

  /**
   * Resolves a production anchor node against the cached base model for
   * `equipmentId` + `socketName` (via the registry socket → bodyos_id map).
   * Returns null when the equipment is procedurally backed or has no anchor.
   */
  resolveAnchorForEquipment(equipmentId: string, socketName: string): THREE.Object3D | null {
    const base = this.equipmentCache.get(equipmentId);
    const equipDef = EQUIPMENT_REGISTRY[equipmentId];
    const bodyosId = equipDef?.production?.anchors?.[socketName];
    if (!base || !bodyosId) return null;
    return resolveEquipmentAnchor(base, { bodyosId });
  }

  detachAll(): void {
    // NOTE: instances are clones sharing geometry/materials with the cached
    // base models. GPU resources are released only in dispose(); detaching
    // must not dispose shared resources or the cache would serve dead assets.
    this.attachmentSystem.detachWithoutDispose();
    this.activeInstances = [];
  }

  getActiveInstances(): THREE.Object3D[] {
    return [...this.activeInstances];
  }

  getAttachmentRecordCount(): number {
    return this.attachmentSystem.getRecordCount();
  }

  getAttachedRecords(): ReadonlyArray<AttachmentRecord> {
    return this.attachmentSystem.getRecords();
  }

  private defaultGlbLoader = async (glbUrl: string): Promise<THREE.Object3D> => {
    const gltf = await this.gltfLoader.loadAsync(glbUrl);
    return gltf.scene;
  };

  private async loadProductionBase(equipmentId: string, equipDef: ExtendedEquipmentDefinition): Promise<THREE.Object3D | null> {
    const glbUrl = equipDef.production?.glb || equipDef.asset;
    if (!glbUrl || !glbUrl.endsWith('.glb')) return null;

    let inflight = this.loadPromises.get(glbUrl);
    if (!inflight) {
      const load = this.modelLoaderOverride || this.defaultGlbLoader;
      inflight = load(glbUrl)
        .then((scene) => selectProductionRoot(scene, equipDef.production?.runtimeId))
        .catch((err) => {
          console.warn(`[EquipmentController] Production GLB failed for "${equipmentId}" (${glbUrl}); using procedural fallback.`, err);
          return null;
        });
      this.loadPromises.set(glbUrl, inflight);
    }

    // Race the load against a timeout: a loader that never settles must not
    // hang exercise loading forever. The timed-out entry is evicted so a
    // later exercise retries fresh; its eventual settlement is ignored.
    const base = await this.withTimeout(inflight, this.glbTimeoutMs);
    if (!base) {
      // Do not poison the cache with failures; allow retry on next exercise.
      this.loadPromises.delete(glbUrl);
      return null;
    }
    return base;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), ms);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async getOrCreateModel(equipmentId: string): Promise<THREE.Object3D> {
    if (this.equipmentCache.has(equipmentId)) {
      return this.equipmentCache.get(equipmentId)!;
    }

    // Stage 4: prefer the cached production GLB; fall back to procedural.
    const equipDef = EQUIPMENT_REGISTRY[equipmentId];
    if (equipDef) {
      const productionBase = await this.loadProductionBase(equipmentId, equipDef);
      if (productionBase) {
        productionBase.updateMatrixWorld(true);
        this.equipmentCache.set(equipmentId, productionBase);
        this.productionBacked.add(equipmentId);
        return productionBase;
      }
      this.productionBacked.delete(equipmentId);
    }

    let mesh: THREE.Object3D;
    switch (equipmentId) {
      case 'dumbbell':
        mesh = this.createBodyOSDumbbell();
        break;
      case 'barbell':
        mesh = this.createBodyOSBarbell();
        break;
      case 'weight-plate-20kg':
        mesh = this.createBodyOSWeightPlate(0.225, 0.055, 0xcc2233, '20');
        break;
      case 'weight-plate-10kg':
        mesh = this.createBodyOSWeightPlate(0.225, 0.035, 0x0066ff, '10');
        break;
      case 'weight-plate-5kg':
        mesh = this.createBodyOSWeightPlate(0.175, 0.025, 0x22aa55, '5');
        break;
      case 'flat-bench':
        mesh = this.createBodyOSFlatBench();
        break;
      default:
        mesh = new THREE.Group();
        mesh.name = `equipment_unknown_${equipmentId}`;
    }

    this.equipmentCache.set(equipmentId, mesh);
    return mesh;
  }

  // ==========================================================================
  // HEX DUMBBELL — Matte charcoal urethane hex heads, knurled chrome handle,
  //                electric-blue accent rings at the neck
  // ==========================================================================
  private createBodyOSDumbbell(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'equipment_dumbbell';

    const headMat = new THREE.MeshStandardMaterial({
      color: 0x1f242d,
      roughness: 0.8,
      metalness: 0.15,
    });
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      roughness: 0.25,
      metalness: 0.9,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x0066ff,
      emissive: 0x0066ff,
      emissiveIntensity: 0.4,
      roughness: 0.3,
    });

    // Handle — knurled chrome grip cylinder
    const handleGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.14, 16);
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.rotation.z = Math.PI / 2;
    handle.castShadow = true;
    group.add(handle);

    // Hex heads — hexagonal cylinder (6 radial segments)
    const headGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.05, 6);
    const leftHead = new THREE.Mesh(headGeo, headMat);
    leftHead.position.x = -0.095;
    leftHead.rotation.z = Math.PI / 2;
    leftHead.castShadow = true;
    group.add(leftHead);

    const rightHead = new THREE.Mesh(headGeo, headMat);
    rightHead.position.x = 0.095;
    rightHead.rotation.z = Math.PI / 2;
    rightHead.castShadow = true;
    group.add(rightHead);

    // Electric-blue accent rings at neck transitions
    const ringGeo = new THREE.TorusGeometry(0.025, 0.004, 8, 24);
    const ringLeft = new THREE.Mesh(ringGeo, accentMat);
    ringLeft.position.x = -0.068;
    ringLeft.rotation.y = Math.PI / 2;
    group.add(ringLeft);

    const ringRight = new THREE.Mesh(ringGeo, accentMat);
    ringRight.position.x = 0.068;
    ringRight.rotation.y = Math.PI / 2;
    group.add(ringRight);

    // Knurl texture lines on handle (subtle visual detail)
    const knurlMat = new THREE.MeshStandardMaterial({
      color: 0xb0b0b5,
      roughness: 0.4,
      metalness: 0.85,
    });
    for (let i = 0; i < 3; i++) {
      const knurlGeo = new THREE.TorusGeometry(0.017, 0.001, 4, 16);
      const knurl = new THREE.Mesh(knurlGeo, knurlMat);
      knurl.position.x = -0.03 + i * 0.03;
      knurl.rotation.y = Math.PI / 2;
      group.add(knurl);
    }

    return group;
  }

  // ==========================================================================
  // OLYMPIC BARBELL — 2.2m chrome bar, rotating sleeves, electric-blue collars,
  //                   45lb bumper plates (included as integrated mesh)
  // ==========================================================================
  private createBodyOSBarbell(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'equipment_barbell';

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xe4e4e7,
      roughness: 0.2,
      metalness: 0.95,
    });
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.7,
      metalness: 0.1,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x0066ff,
      emissive: 0x0066ff,
      emissiveIntensity: 0.5,
      roughness: 0.3,
    });

    // Central bar shaft (2.2m total, radius 0.014m)
    const barGeo = new THREE.CylinderGeometry(0.014, 0.014, 2.2, 16);
    const bar = new THREE.Mesh(barGeo, steelMat);
    bar.rotation.z = Math.PI / 2;
    bar.castShadow = true;
    group.add(bar);

    // Left & Right rotating sleeves (thicker: radius 0.025, length 0.41m)
    const sleeveGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.41, 16);
    const leftSleeve = new THREE.Mesh(sleeveGeo, steelMat);
    leftSleeve.position.x = -0.88;
    leftSleeve.rotation.z = Math.PI / 2;
    leftSleeve.castShadow = true;
    group.add(leftSleeve);

    const rightSleeve = new THREE.Mesh(sleeveGeo, steelMat);
    rightSleeve.position.x = 0.88;
    rightSleeve.rotation.z = Math.PI / 2;
    rightSleeve.castShadow = true;
    group.add(rightSleeve);

    // Electric-blue inner collars
    const collarGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.03, 16);
    const leftCollar = new THREE.Mesh(collarGeo, accentMat);
    leftCollar.position.x = -0.66;
    leftCollar.rotation.z = Math.PI / 2;
    group.add(leftCollar);

    const rightCollar = new THREE.Mesh(collarGeo, accentMat);
    rightCollar.position.x = 0.66;
    rightCollar.rotation.z = Math.PI / 2;
    group.add(rightCollar);

    // Bumper plates (radius 0.225m, thickness 0.04m)
    const plateGeo = new THREE.CylinderGeometry(0.225, 0.225, 0.04, 32);
    const leftPlate = new THREE.Mesh(plateGeo, plateMat);
    leftPlate.position.x = -0.73;
    leftPlate.rotation.z = Math.PI / 2;
    leftPlate.castShadow = true;
    group.add(leftPlate);

    const rightPlate = new THREE.Mesh(plateGeo, plateMat);
    rightPlate.position.x = 0.73;
    rightPlate.rotation.z = Math.PI / 2;
    rightPlate.castShadow = true;
    group.add(rightPlate);

    // Outer clip collars (safety clips)
    const clipGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.025, 12);
    const leftClip = new THREE.Mesh(clipGeo, accentMat);
    leftClip.position.x = -0.77;
    leftClip.rotation.z = Math.PI / 2;
    group.add(leftClip);

    const rightClip = new THREE.Mesh(clipGeo, accentMat);
    rightClip.position.x = 0.77;
    rightClip.rotation.z = Math.PI / 2;
    group.add(rightClip);

    // Knurl marks on grip area
    const knurlMat = new THREE.MeshStandardMaterial({
      color: 0xb0b0b5,
      roughness: 0.4,
      metalness: 0.85,
    });
    for (let i = 0; i < 5; i++) {
      const knurlGeo = new THREE.TorusGeometry(0.015, 0.001, 4, 16);
      const knurl = new THREE.Mesh(knurlGeo, knurlMat);
      knurl.position.x = -0.12 + i * 0.06;
      knurl.rotation.y = Math.PI / 2;
      group.add(knurl);
    }

    return group;
  }

  // ==========================================================================
  // WEIGHT PLATES — Olympic bumper-style plates with colored rim bands
  // ==========================================================================
  private createBodyOSWeightPlate(
    radius: number,
    thickness: number,
    rimColor: number,
    label: string
  ): THREE.Group {
    const group = new THREE.Group();
    group.name = `equipment_weight_plate_${label}kg`;

    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.75,
      metalness: 0.1,
    });
    const rimMat = new THREE.MeshStandardMaterial({
      color: rimColor,
      emissive: rimColor,
      emissiveIntensity: 0.15,
      roughness: 0.5,
      metalness: 0.2,
    });
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xe4e4e7,
      roughness: 0.3,
      metalness: 0.9,
    });

    // Main plate disc
    const plateGeo = new THREE.CylinderGeometry(radius, radius, thickness, 32);
    const plate = new THREE.Mesh(plateGeo, coreMat);
    plate.rotation.z = Math.PI / 2;
    plate.castShadow = true;
    group.add(plate);

    // Colored rim band
    const rimGeo = new THREE.TorusGeometry(radius - 0.005, thickness / 2, 8, 32);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.y = Math.PI / 2;
    group.add(rim);

    // Center hub (sleeve hole: radius 0.026m for Olympic standard)
    const hubGeo = new THREE.CylinderGeometry(0.035, 0.035, thickness + 0.005, 16);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    group.add(hub);

    return group;
  }

  // ==========================================================================
  // FLAT BENCH — Matte black steel frame, charcoal vinyl pad,
  //              electric-blue edge piping, anti-slip rubber feet
  // ==========================================================================
  private createBodyOSFlatBench(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'equipment_flat_bench';

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x111215,
      roughness: 0.6,
      metalness: 0.8,
    });
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e24,
      roughness: 0.85,
      metalness: 0.05,
    });
    const pipingMat = new THREE.MeshStandardMaterial({
      color: 0x0066ff,
      emissive: 0x0066ff,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });
    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      roughness: 0.95,
      metalness: 0.0,
    });

    // Main bench pad (1.2m long × 0.3m wide × 0.07m thick, at 0.44m height)
    const padGeo = new THREE.BoxGeometry(0.3, 0.07, 1.2);
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(0, 0.44, 0);
    pad.castShadow = true;
    pad.receiveShadow = true;
    group.add(pad);

    // Electric-blue piping around pad perimeter
    const pipingGeo = new THREE.BoxGeometry(0.306, 0.015, 1.206);
    const piping = new THREE.Mesh(pipingGeo, pipingMat);
    piping.position.set(0, 0.42, 0);
    group.add(piping);

    // Pad cushion bevel (rounded edge appearance)
    const bevelGeo = new THREE.BoxGeometry(0.28, 0.005, 1.18);
    const bevelMat = new THREE.MeshStandardMaterial({
      color: 0x222630,
      roughness: 0.8,
      metalness: 0.05,
    });
    const bevel = new THREE.Mesh(bevelGeo, bevelMat);
    bevel.position.set(0, 0.475, 0);
    group.add(bevel);

    // Front & rear vertical steel posts
    const postGeo = new THREE.BoxGeometry(0.07, 0.4, 0.07);
    const frontPost = new THREE.Mesh(postGeo, steelMat);
    frontPost.position.set(0, 0.2, 0.45);
    frontPost.castShadow = true;
    group.add(frontPost);

    const rearPost = new THREE.Mesh(postGeo, steelMat);
    rearPost.position.set(0, 0.2, -0.45);
    rearPost.castShadow = true;
    group.add(rearPost);

    // Cross support beam (structural tube)
    const crossGeo = new THREE.BoxGeometry(0.05, 0.05, 0.82);
    const crossBeam = new THREE.Mesh(crossGeo, steelMat);
    crossBeam.position.set(0, 0.05, 0);
    group.add(crossBeam);

    // Horizontal ground stabilizer feet
    const footGeo = new THREE.BoxGeometry(0.42, 0.04, 0.08);
    const frontFoot = new THREE.Mesh(footGeo, steelMat);
    frontFoot.position.set(0, 0.02, 0.45);
    frontFoot.receiveShadow = true;
    group.add(frontFoot);

    const rearFoot = new THREE.Mesh(footGeo, steelMat);
    rearFoot.position.set(0, 0.02, -0.45);
    rearFoot.receiveShadow = true;
    group.add(rearFoot);

    // Anti-slip rubber pads on feet
    const rubberPadGeo = new THREE.BoxGeometry(0.06, 0.01, 0.06);
    const positions = [
      [-0.17, 0.005, 0.45], [0.17, 0.005, 0.45],
      [-0.17, 0.005, -0.45], [0.17, 0.005, -0.45],
    ];
    for (const pos of positions) {
      const rubberPad = new THREE.Mesh(rubberPadGeo, rubberMat);
      rubberPad.position.set(pos[0], pos[1], pos[2]);
      group.add(rubberPad);
    }

    return group;
  }

  dispose(): void {
    this.detachAll();
    // Dispose cached template models
    for (const [, model] of this.equipmentCache) {
      model.traverse((child) => {
        if ((child as THREE.Mesh).geometry) {
          (child as THREE.Mesh).geometry.dispose();
        }
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat.dispose();
          }
        }
      });
    }
    this.equipmentCache.clear();
    this.productionBacked.clear();
    this.loadPromises.clear();
  }
}
