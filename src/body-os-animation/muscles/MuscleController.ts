import * as THREE from 'three';
import type { CanonicalMuscleId, MuscleActivation, MuscleSide } from '../core/types.js';
import { normalizeMuscleId } from './MuscleRegistry.js';
import { MuscleMaterialController } from './MuscleMaterialController.js';
import { MuscleRegionResolver, type ResolvedMuscleTarget } from './MuscleRegionResolver.js';

export class MuscleController {
  private characterId = 'male-athletic';
  private characterRoot: THREE.Object3D | null = null;
  private materialController: MuscleMaterialController;
  private regionResolver: MuscleRegionResolver;
  private resolvedTargets: Map<CanonicalMuscleId, ResolvedMuscleTarget> = new Map();
  private manualMuscleMeshes: Map<string, THREE.Mesh[]> = new Map();
  private currentActivation: MuscleActivation = { primary: [], secondary: [] };
  private isVisible = false;

  constructor() {
    this.materialController = new MuscleMaterialController();
    this.regionResolver = new MuscleRegionResolver();
  }

  /**
   * Binds to a live character scene root using the CharacterMuscleMap abstraction.
   */
  bindCharacter(characterId: string, characterRoot: THREE.Object3D): void {
    this.characterId = characterId;
    this.characterRoot = characterRoot;
    this.resolvedTargets = this.regionResolver.resolveAll(characterId, characterRoot);
    this.applyActivation(this.currentActivation);
  }

  /**
   * Backwards-compatible scanAndBind for existing call sites.
   */
  scanAndBind(root: THREE.Object3D, characterId: string = 'male-athletic'): void {
    this.bindCharacter(characterId, root);
  }

  /**
   * Registers a manual muscle mesh target (e.g. for procedural or fallback test rigs)
   */
  registerMuscleMesh(muscleId: string, mesh: THREE.Mesh): void {
    const key = normalizeMuscleId(muscleId);
    if (!this.manualMuscleMeshes.has(key)) {
      this.manualMuscleMeshes.set(key, []);
    }
    this.manualMuscleMeshes.get(key)!.push(mesh);
    mesh.material = this.materialController.getInactiveMaterial();
    mesh.visible = false;
  }

  setActivation(activation: MuscleActivation): void {
    this.currentActivation = activation;
    this.applyActivation(activation);
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.applyActivation(this.currentActivation);
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  getCurrentActivation(): MuscleActivation {
    return this.currentActivation;
  }

  /**
   * Stage 5.1 (Phase F): honest production-VRM muscle-mode status.
   * Visual QA confirmed Production V1 muscle mode shows no meaningful
   * activation. Root cause: the production VRM carries NO separate
   * `muscle_*` overlay meshes — muscles exist only as `bodyos.region.*`
   * vertex groups on the single Body mesh (see ProductionMuscleMap /
   * manifests/muscle-map.json). The overlay-mesh pipeline therefore
   * resolves zero targets on production and correctly shows nothing.
   * A vertex-group mask visualization requires a larger shader/material
   * architecture change (custom onBeforeCompile / shader chunk keyed by
   * region_index + strength attributes). Until that lands, this method
   * reports `supported: false` on production so the UI never pretends
   * muscle mode works there. Fallback rig (muscle_* meshes) stays `true`.
   */
  getProductionMuscleStatus(): {
    supported: boolean;
    mode: 'overlay-meshes' | 'vertex-groups-pending-shader';
    resolvedOverlayCount: number;
    productionBodyDetected: boolean;
    detail: string;
  } {
    const productionBody = this.regionResolver.getLastProductionBody();
    const resolvedOverlayCount = [...this.resolvedTargets.values()].reduce(
      (n, t) => n + t.meshes.length,
      0
    );
    if (productionBody && resolvedOverlayCount === 0) {
      return {
        supported: false,
        mode: 'vertex-groups-pending-shader',
        resolvedOverlayCount,
        productionBodyDetected: true,
        detail:
          'Production V1 body detected (bodyos.region.* vertex groups registered); ' +
          'overlay-mesh highlighting unavailable — vertex-mask shader architecture required. ' +
          'Stage 5.1 remains blocked on muscle visualization, not pretending it works.',
      };
    }
    return {
      supported: resolvedOverlayCount > 0,
      mode: 'overlay-meshes',
      resolvedOverlayCount,
      productionBodyDetected: productionBody !== null,
      detail:
        resolvedOverlayCount > 0
          ? `Overlay-mesh muscle visualization active (${resolvedOverlayCount} meshes).`
          : 'No muscle targets resolved for this character.',
    };
  }

  /**
   * Highlights specific muscle group with optional side filtering
   */
  highlightMuscle(muscleId: string, side: MuscleSide = 'bilateral', role: 'primary' | 'secondary' = 'primary'): void {
    const canonicalId = normalizeMuscleId(muscleId);
    const target = this.resolvedTargets.get(canonicalId);
    if (!target) return;

    const meshes = this.regionResolver.filterBySide(target, side);
    const material = role === 'primary'
      ? this.materialController.getPrimaryMaterial()
      : this.materialController.getSecondaryMaterial();

    for (const mesh of meshes) {
      mesh.material = material;
      mesh.visible = this.isVisible;
    }
  }

  private applyActivation(activation: MuscleActivation): void {
    const primaryNormalized = (activation.primary || []).map(normalizeMuscleId);
    const secondaryNormalized = (activation.secondary || []).map(normalizeMuscleId);
    const primaryMat = this.materialController.getPrimaryMaterial();
    const secondaryMat = this.materialController.getSecondaryMaterial();
    const inactiveMat = this.materialController.getInactiveMaterial();

    // 1. Process resolved targets through CharacterMuscleMap
    for (const [muscleId, target] of this.resolvedTargets.entries()) {
      const isPrimary = this.isVisible && primaryNormalized.includes(muscleId);
      const isSecondary = this.isVisible && !isPrimary && secondaryNormalized.includes(muscleId);

      for (const mesh of target.meshes) {
        if (isPrimary) {
          mesh.material = primaryMat;
          mesh.visible = true;
        } else if (isSecondary) {
          mesh.material = secondaryMat;
          mesh.visible = true;
        } else {
          mesh.material = inactiveMat;
          mesh.visible = false;
        }
      }
    }

    // 2. Process manual/fallback registered meshes
    for (const [muscleId, meshes] of this.manualMuscleMeshes.entries()) {
      const isPrimary = this.isVisible && primaryNormalized.includes(muscleId as CanonicalMuscleId);
      const isSecondary = this.isVisible && !isPrimary && secondaryNormalized.includes(muscleId as CanonicalMuscleId);

      for (const mesh of meshes) {
        if (isPrimary) {
          mesh.material = primaryMat;
          mesh.visible = true;
        } else if (isSecondary) {
          mesh.material = secondaryMat;
          mesh.visible = true;
        } else {
          mesh.material = inactiveMat;
          mesh.visible = false;
        }
      }
    }
  }

  dispose(): void {
    this.materialController.dispose();
    this.resolvedTargets.clear();
    this.manualMuscleMeshes.clear();
    this.characterRoot = null;
  }
}
