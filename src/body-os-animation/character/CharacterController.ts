import * as THREE from 'three';
import { VRM, VRMLoaderPlugin, type VRMHumanoid, type VRMPose } from '@pixiv/three-vrm';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HumanoidBoneName } from '../core/types.js';
import type { CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';
import { matchHumanoidBone, VRM_HUMANOID_BONES } from './SkeletonMap.js';
import { applyGripPreset, clearGripPreset, type GripPresetName } from './GripPresets.js';
import { registerProductionMaleAthleticMuscleMap } from './ProductionMuscleMap.js';

export class CharacterController implements CharacterSkeletonProvider {
  private root: THREE.Group = new THREE.Group();
  private boneMap: Map<HumanoidBoneName, THREE.Object3D> = new Map();
  private characterId = 'male-athletic';
  private characterModel: THREE.Object3D | null = null;
  private vrm: VRM | null = null;
  private isVRMActive = false;

  constructor() {
    this.root.name = 'character_root';
  }

  getRoot(): THREE.Object3D {
    return this.root;
  }

  getBone(boneName: HumanoidBoneName): THREE.Object3D | null {
    return this.boneMap.get(boneName) || null;
  }

  getCharacterId(): string {
    return this.characterId;
  }

  getVRM(): VRM | null {
    return this.vrm;
  }

  isProductionVRMLoaded(): boolean {
    return this.isVRMActive;
  }

  // ---------------------------------------------------------------------------
  // Motion V2 normalized ownership API (M1).
  // The normalized humanoid is the Health OS writable pose layer; the raw
  // humanoid is three-vrm owned render output (`VRMHumanoid.update` copies
  // normalized → raw every frame, including hips position and fingers).
  // V2 code must resolve pose targets exclusively through these methods.
  // ---------------------------------------------------------------------------

  /** Live three-vrm humanoid, or null on the fallback rig. */
  getHumanoid(): VRMHumanoid | null {
    return this.vrm?.humanoid ?? null;
  }

  /** Write a rest-relative normalized pose (V2 write path). */
  applyNormalizedPose(pose: VRMPose): void {
    this.vrm?.humanoid.setNormalizedPose(pose);
  }

  /** Return to loader-defined rest (never live-sampled calibration). */
  resetNormalizedPose(): void {
    this.vrm?.humanoid.resetNormalizedPose();
  }

  /** Normalized proxy node for a canonical bone (V2 diagnostics/IK). */
  getNormalizedBoneNode(boneName: HumanoidBoneName): THREE.Object3D | null {
    return this.vrm?.humanoid.getNormalizedBoneNode(boneName as never) ?? null;
  }

  /**
   * Raw rendered bone node. DIAGNOSTICS AND RENDER-OUTPUT INSPECTION ONLY.
   * Never a pose-write target — `vrm.update()` overwrites raw bones from
   * the normalized layer every frame.
   */
  getRawBoneNode(boneName: HumanoidBoneName): THREE.Object3D | null {
    return this.vrm?.humanoid.getRawBoneNode(boneName as never) ?? null;
  }

  update(delta: number): void {
    if (this.vrm) {
      this.vrm.update(delta);
    }
  }

  resetPose(): void {
    if (this.vrm?.humanoid) {
      this.vrm.humanoid.resetNormalizedPose();
    }
  }

  /**
   * Initializes or binds a character model.
   * Prefers production VRM asset at /assets/body-os/characters/${id}.vrm.
   * Completely bypasses procedural placeholder when VRM loads successfully.
   * Procedural rig is only used as a fallback/debug rig.
   */
  async loadCharacter(id: string, externalModel?: THREE.Object3D): Promise<THREE.Object3D> {
    this.characterId = id;
    this.clear();

    if (externalModel) {
      this.characterModel = externalModel;
      this.scanAndMapBones(externalModel);
      this.root.add(this.characterModel);
      return this.root;
    }

    // Attempt production VRM load
    const vrmUrl = `/assets/body-os/characters/${id}.vrm`;
    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(vrmUrl);
      const vrm = gltf.userData.vrm as VRM | undefined;

      if (vrm) {
        this.vrm = vrm;
        this.isVRMActive = true;
        this.characterModel = vrm.scene;
        this.mapVRMBones(vrm);
        this.root.add(this.characterModel);
        if (id === 'male-athletic') {
          // Stage 4: merge Production V1 vertex-group muscle metadata for the
          // frozen character. Idempotent; fallback-rig descriptors preserved.
          registerProductionMaleAthleticMuscleMap();
        }
        console.info(`[BodyOS CharacterController] Production VRM loaded successfully: ${vrmUrl}`);
        return this.root;
      }
    } catch (err) {
      console.warn(`[BodyOS CharacterController] Could not load VRM from ${vrmUrl}. Falling back to procedural rig.`, err);
    }

    // Fallback: build canonical procedural debug rig
    this.isVRMActive = false;
    this.characterModel = this.buildCanonicalAthleticRig();
    this.root.add(this.characterModel);
    return this.root;
  }

  private mapVRMBones(vrm: VRM): void {
    this.boneMap.clear();
    if (!vrm.humanoid) return;

    for (const boneName of VRM_HUMANOID_BONES) {
      const node =
        vrm.humanoid.getNormalizedBoneNode(boneName as any) ||
        vrm.humanoid.getRawBoneNode(boneName as any);
      if (node) {
        this.boneMap.set(boneName, node);
      }
    }

    // Scan any remaining bones or attachment points
    vrm.scene.traverse((child) => {
      const matched = matchHumanoidBone(child.name);
      if (matched && !this.boneMap.has(matched)) {
        this.boneMap.set(matched, child);
      }
    });
  }

  private scanAndMapBones(model: THREE.Object3D): void {
    this.boneMap.clear();
    model.traverse((child) => {
      const boneName = matchHumanoidBone(child.name);
      if (boneName && !this.boneMap.has(boneName)) {
        this.boneMap.set(boneName, child);
      }
    });
  }

  /**
   * Builds the canonical Health OS 3D Humanoid Rig matching the reference sheet:
   * - Proportions: Lean Athletic Male (Height ~1.82m)
   * - V-taper, pectoral definition, rectus abdominis segments
   * - Charcoal training shorts with electric blue side seam accent
   * - Cross-training athletic shoes
   * - Full VRM humanoid bone hierarchy with addressable muscle meshes
   */
  private buildCanonicalAthleticRig(): THREE.Group {
    const characterGroup = new THREE.Group();
    characterGroup.name = 'body_os_male_athletic';
    this.boneMap.clear();

    // Materials based on Health OS Color System
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xdec0aa,
      roughness: 0.65,
      metalness: 0.05,
    });
    const shortsMat = new THREE.MeshStandardMaterial({
      color: 0x16191f, // Deep charcoal
      roughness: 0.8,
      metalness: 0.1,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x0066ff, // Health OS Electric Blue
      emissive: 0x0066ff,
      emissiveIntensity: 0.5,
      roughness: 0.3,
    });
    const shoeMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.7,
      metalness: 0.2,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: 0x221f1d,
      roughness: 0.9,
    });

    // --- HIPS (Root bone at y = 0.98m) ---
    const hips = new THREE.Group();
    hips.name = 'hips';
    hips.position.set(0, 0.98, 0);
    characterGroup.add(hips);
    this.boneMap.set('hips', hips);

    // Pelvis / Shorts mesh
    const pelvisGeo = new THREE.BoxGeometry(0.3, 0.22, 0.2);
    const pelvis = new THREE.Mesh(pelvisGeo, shortsMat);
    pelvis.position.set(0, 0, 0);
    hips.add(pelvis);

    // Glute muscle overlays
    const gluteLeftGeo = new THREE.SphereGeometry(0.08, 12, 12);
    const gluteLeft = new THREE.Mesh(gluteLeftGeo);
    gluteLeft.name = 'muscle_glute_left';
    gluteLeft.position.set(-0.08, -0.04, -0.1);
    gluteLeft.scale.set(1, 1.2, 0.7);
    hips.add(gluteLeft);

    const gluteRight = new THREE.Mesh(gluteLeftGeo);
    gluteRight.name = 'muscle_glute_right';
    gluteRight.position.set(0.08, -0.04, -0.1);
    gluteRight.scale.set(1, 1.2, 0.7);
    hips.add(gluteRight);

    // --- SPINE (y = +0.12 relative to hips) ---
    const spine = new THREE.Group();
    spine.name = 'spine';
    spine.position.set(0, 0.12, 0);
    hips.add(spine);
    this.boneMap.set('spine', spine);

    // Lower abdomen / waist
    const spineMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.14, 16), skinMat);
    spine.add(spineMesh);

    // Rectus abdominis muscle overlay
    const absGeo = new THREE.BoxGeometry(0.14, 0.22, 0.04);
    const absMesh = new THREE.Mesh(absGeo);
    absMesh.name = 'muscle_rectus_abdominis';
    absMesh.position.set(0, 0.06, 0.09);
    spine.add(absMesh);

    // Obliques
    const obliquesL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.06));
    obliquesL.name = 'muscle_obliques_left';
    obliquesL.position.set(-0.12, 0.05, 0.04);
    spine.add(obliquesL);

    const obliquesR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.06));
    obliquesR.name = 'muscle_obliques_right';
    obliquesR.position.set(0.12, 0.05, 0.04);
    spine.add(obliquesR);

    // --- CHEST & UPPER CHEST (y = +0.15 relative to spine) ---
    const chest = new THREE.Group();
    chest.name = 'chest';
    chest.position.set(0, 0.15, 0);
    spine.add(chest);
    this.boneMap.set('chest', chest);

    const upperChest = new THREE.Group();
    upperChest.name = 'upperChest';
    upperChest.position.set(0, 0.12, 0);
    chest.add(upperChest);
    this.boneMap.set('upperChest', upperChest);

    // Torso / V-Taper Ribcage
    const torsoGeo = new THREE.BoxGeometry(0.33, 0.22, 0.21);
    const torso = new THREE.Mesh(torsoGeo, skinMat);
    torso.position.set(0, 0, 0);
    chest.add(torso);

    // Pectorals (Left & Right)
    const pecGeo = new THREE.BoxGeometry(0.14, 0.12, 0.04);
    const pecLeft = new THREE.Mesh(pecGeo);
    pecLeft.name = 'muscle_pectoralis_left';
    pecLeft.position.set(-0.08, 0.04, 0.11);
    upperChest.add(pecLeft);

    const pecRight = new THREE.Mesh(pecGeo);
    pecRight.name = 'muscle_pectoralis_right';
    pecRight.position.set(0.08, 0.04, 0.11);
    upperChest.add(pecRight);

    // Latissimus Dorsi (Lats)
    const latGeo = new THREE.BoxGeometry(0.06, 0.22, 0.12);
    const latLeft = new THREE.Mesh(latGeo);
    latLeft.name = 'muscle_lats_left';
    latLeft.position.set(-0.16, -0.02, -0.04);
    chest.add(latLeft);

    const latRight = new THREE.Mesh(latGeo);
    latRight.name = 'muscle_lats_right';
    latRight.position.set(0.16, -0.02, -0.04);
    chest.add(latRight);

    // Trapezius
    const trapGeo = new THREE.BoxGeometry(0.2, 0.08, 0.12);
    const trapLeft = new THREE.Mesh(trapGeo);
    trapLeft.name = 'muscle_trapezius_left';
    trapLeft.position.set(-0.06, 0.1, -0.06);
    upperChest.add(trapLeft);

    const trapRight = new THREE.Mesh(trapGeo);
    trapRight.name = 'muscle_trapezius_right';
    trapRight.position.set(0.06, 0.1, -0.06);
    upperChest.add(trapRight);

    // --- NECK & HEAD ---
    const neck = new THREE.Group();
    neck.name = 'neck';
    neck.position.set(0, 0.16, 0);
    upperChest.add(neck);
    this.boneMap.set('neck', neck);

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 16), skinMat);
    neck.add(neckMesh);

    const head = new THREE.Group();
    head.name = 'head';
    head.position.set(0, 0.14, 0);
    neck.add(head);
    this.boneMap.set('head', head);

    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 18), skinMat);
    headMesh.scale.set(0.9, 1.15, 1);
    head.add(headMesh);

    // Hair
    const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 16), hairMat);
    hairMesh.position.set(0, 0.04, -0.01);
    hairMesh.scale.set(0.92, 1.1, 1.02);
    head.add(hairMesh);

    // --- LEFT ARM ---
    const leftShoulder = new THREE.Group();
    leftShoulder.name = 'leftShoulder';
    leftShoulder.position.set(-0.18, 0.08, 0);
    upperChest.add(leftShoulder);
    this.boneMap.set('leftShoulder', leftShoulder);

    const leftUpperArm = new THREE.Group();
    leftUpperArm.name = 'leftUpperArm';
    leftUpperArm.position.set(-0.08, 0, 0);
    leftShoulder.add(leftUpperArm);
    this.boneMap.set('leftUpperArm', leftUpperArm);

    // Deltoid
    const deltGeo = new THREE.SphereGeometry(0.075, 14, 14);
    const deltMeshL = new THREE.Mesh(deltGeo);
    deltMeshL.name = 'muscle_deltoid_left';
    deltMeshL.position.set(0, 0, 0);
    leftUpperArm.add(deltMeshL);

    // Bicep & Arm mesh
    const upperArmMeshL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.26, 16), skinMat);
    upperArmMeshL.position.set(0, -0.13, 0);
    leftUpperArm.add(upperArmMeshL);

    const bicepMeshL = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 12));
    bicepMeshL.name = 'muscle_biceps_left';
    bicepMeshL.position.set(0, -0.11, 0.02);
    bicepMeshL.scale.set(0.85, 1.3, 0.85);
    leftUpperArm.add(bicepMeshL);

    const tricepMeshL = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 12));
    tricepMeshL.name = 'muscle_triceps_left';
    tricepMeshL.position.set(0, -0.12, -0.02);
    tricepMeshL.scale.set(0.85, 1.3, 0.85);
    leftUpperArm.add(tricepMeshL);

    const leftLowerArm = new THREE.Group();
    leftLowerArm.name = 'leftLowerArm';
    leftLowerArm.position.set(0, -0.26, 0);
    leftUpperArm.add(leftLowerArm);
    this.boneMap.set('leftLowerArm', leftLowerArm);

    const lowerArmMeshL = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.035, 0.24, 16), skinMat);
    lowerArmMeshL.position.set(0, -0.12, 0);
    leftLowerArm.add(lowerArmMeshL);

    const forearmMeshL = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.037, 0.22, 12));
    forearmMeshL.name = 'muscle_forearms_left';
    forearmMeshL.position.set(0, -0.11, 0);
    leftLowerArm.add(forearmMeshL);

    const leftHand = new THREE.Group();
    leftHand.name = 'leftHand';
    leftHand.position.set(0, -0.24, 0);
    leftLowerArm.add(leftHand);
    this.boneMap.set('leftHand', leftHand);

    const handMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.06), skinMat);
    handMeshL.position.set(0, -0.045, 0);
    leftHand.add(handMeshL);

    // --- RIGHT ARM ---
    const rightShoulder = new THREE.Group();
    rightShoulder.name = 'rightShoulder';
    rightShoulder.position.set(0.18, 0.08, 0);
    upperChest.add(rightShoulder);
    this.boneMap.set('rightShoulder', rightShoulder);

    const rightUpperArm = new THREE.Group();
    rightUpperArm.name = 'rightUpperArm';
    rightUpperArm.position.set(0.08, 0, 0);
    rightShoulder.add(rightUpperArm);
    this.boneMap.set('rightUpperArm', rightUpperArm);

    // Deltoid
    const deltMeshR = new THREE.Mesh(deltGeo);
    deltMeshR.name = 'muscle_deltoid_right';
    deltMeshR.position.set(0, 0, 0);
    rightUpperArm.add(deltMeshR);

    const upperArmMeshR = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.26, 16), skinMat);
    upperArmMeshR.position.set(0, -0.13, 0);
    rightUpperArm.add(upperArmMeshR);

    const bicepMeshR = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 12));
    bicepMeshR.name = 'muscle_biceps_right';
    bicepMeshR.position.set(0, -0.11, 0.02);
    bicepMeshR.scale.set(0.85, 1.3, 0.85);
    rightUpperArm.add(bicepMeshR);

    const tricepMeshR = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 12));
    tricepMeshR.name = 'muscle_triceps_right';
    tricepMeshR.position.set(0, -0.12, -0.02);
    tricepMeshR.scale.set(0.85, 1.3, 0.85);
    rightUpperArm.add(tricepMeshR);

    const rightLowerArm = new THREE.Group();
    rightLowerArm.name = 'rightLowerArm';
    rightLowerArm.position.set(0, -0.26, 0);
    rightUpperArm.add(rightLowerArm);
    this.boneMap.set('rightLowerArm', rightLowerArm);

    const lowerArmMeshR = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.035, 0.24, 16), skinMat);
    lowerArmMeshR.position.set(0, -0.12, 0);
    rightLowerArm.add(lowerArmMeshR);

    const forearmMeshR = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.037, 0.22, 12));
    forearmMeshR.name = 'muscle_forearms_right';
    forearmMeshR.position.set(0, -0.11, 0);
    rightLowerArm.add(forearmMeshR);

    const rightHand = new THREE.Group();
    rightHand.name = 'rightHand';
    rightHand.position.set(0, -0.24, 0);
    rightLowerArm.add(rightHand);
    this.boneMap.set('rightHand', rightHand);

    const handMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.06), skinMat);
    handMeshR.position.set(0, -0.045, 0);
    rightHand.add(handMeshR);

    // --- LEGS (Shorts + Thighs + Calves + Shoes) ---
    // Left Leg
    const leftUpperLeg = new THREE.Group();
    leftUpperLeg.name = 'leftUpperLeg';
    leftUpperLeg.position.set(-0.1, -0.11, 0);
    hips.add(leftUpperLeg);
    this.boneMap.set('leftUpperLeg', leftUpperLeg);

    // Training shorts leg segment with electric blue side stripe
    const shortsLegGeo = new THREE.CylinderGeometry(0.095, 0.088, 0.2, 16);
    const shortsLegL = new THREE.Mesh(shortsLegGeo, shortsMat);
    shortsLegL.position.set(0, -0.08, 0);
    leftUpperLeg.add(shortsLegL);

    const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.19, 0.02), stripeMat);
    stripeL.position.set(-0.09, -0.08, 0);
    leftUpperLeg.add(stripeL);

    // Exposed thigh / quads
    const thighSkinL = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.44, 16), skinMat);
    thighSkinL.position.set(0, -0.22, 0);
    leftUpperLeg.add(thighSkinL);

    // Quads & Hamstrings
    const quadMeshL = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.068, 0.35, 14));
    quadMeshL.name = 'muscle_quads_left';
    quadMeshL.position.set(0, -0.22, 0.02);
    leftUpperLeg.add(quadMeshL);

    const hamstringMeshL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.062, 0.35, 14));
    hamstringMeshL.name = 'muscle_hamstrings_left';
    hamstringMeshL.position.set(0, -0.22, -0.02);
    leftUpperLeg.add(hamstringMeshL);

    // Left Lower Leg (Calf + Shin)
    const leftLowerLeg = new THREE.Group();
    leftLowerLeg.name = 'leftLowerLeg';
    leftLowerLeg.position.set(0, -0.44, 0);
    leftUpperLeg.add(leftLowerLeg);
    this.boneMap.set('leftLowerLeg', leftLowerLeg);

    const calfSkinL = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.045, 0.4, 16), skinMat);
    calfSkinL.position.set(0, -0.2, 0);
    leftLowerLeg.add(calfSkinL);

    const calfMeshL = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.048, 0.3, 14));
    calfMeshL.name = 'muscle_calves_left';
    calfMeshL.position.set(0, -0.16, -0.01);
    leftLowerLeg.add(calfMeshL);

    // Left Foot / Shoe
    const leftFoot = new THREE.Group();
    leftFoot.name = 'leftFoot';
    leftFoot.position.set(0, -0.4, 0);
    leftLowerLeg.add(leftFoot);
    this.boneMap.set('leftFoot', leftFoot);

    const shoeMeshL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.065, 0.22), shoeMat);
    shoeMeshL.position.set(0, -0.03, 0.06);
    leftFoot.add(shoeMeshL);

    // Right Leg
    const rightUpperLeg = new THREE.Group();
    rightUpperLeg.name = 'rightUpperLeg';
    rightUpperLeg.position.set(0.1, -0.11, 0);
    hips.add(rightUpperLeg);
    this.boneMap.set('rightUpperLeg', rightUpperLeg);

    const shortsLegR = new THREE.Mesh(shortsLegGeo, shortsMat);
    shortsLegR.position.set(0, -0.08, 0);
    rightUpperLeg.add(shortsLegR);

    const stripeR = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.19, 0.02), stripeMat);
    stripeR.position.set(0.09, -0.08, 0);
    rightUpperLeg.add(stripeR);

    const thighSkinR = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.44, 16), skinMat);
    thighSkinR.position.set(0, -0.22, 0);
    rightUpperLeg.add(thighSkinR);

    const quadMeshR = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.068, 0.35, 14));
    quadMeshR.name = 'muscle_quads_right';
    quadMeshR.position.set(0, -0.22, 0.02);
    rightUpperLeg.add(quadMeshR);

    const hamstringMeshR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.062, 0.35, 14));
    hamstringMeshR.name = 'muscle_hamstrings_right';
    hamstringMeshR.position.set(0, -0.22, -0.02);
    rightUpperLeg.add(hamstringMeshR);

    const rightLowerLeg = new THREE.Group();
    rightLowerLeg.name = 'rightLowerLeg';
    rightLowerLeg.position.set(0, -0.44, 0);
    rightUpperLeg.add(rightLowerLeg);
    this.boneMap.set('rightLowerLeg', rightLowerLeg);

    const calfSkinR = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.045, 0.4, 16), skinMat);
    calfSkinR.position.set(0, -0.2, 0);
    rightLowerLeg.add(calfSkinR);

    const calfMeshR = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.048, 0.3, 14));
    calfMeshR.name = 'muscle_calves_right';
    calfMeshR.position.set(0, -0.16, -0.01);
    rightLowerLeg.add(calfMeshR);

    const rightFoot = new THREE.Group();
    rightFoot.name = 'rightFoot';
    rightFoot.position.set(0, -0.4, 0);
    rightLowerLeg.add(rightFoot);
    this.boneMap.set('rightFoot', rightFoot);

    const shoeMeshR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.065, 0.22), shoeMat);
    shoeMeshR.position.set(0, -0.03, 0.06);
    rightFoot.add(shoeMeshR);

    return characterGroup;
  }

  /**
   * Stage 4: applies a semantic production grip preset (`BARBELL_GRIP` /
   * `DUMBBELL_GRIP`) to the bound character rig. Returns the number of
   * finger bones posed; 0 on rigs without production finger bones
   * (procedural fallback). Never throws — grip is cosmetic and must not
   * fail exercise loading.
   */
  applyGripPreset(preset: GripPresetName): number {
    if (!this.characterModel) return 0;
    try {
      return applyGripPreset(this.characterModel, preset);
    } catch {
      return 0;
    }
  }

  /**
   * Stage 5: releases any active production grip preset. Called on
   * exercises without handheld equipment so curled fingers never persist
   * across exercise switches. Never throws; 0 on rigs without finger bones.
   */
  clearGripPreset(): number {
    if (!this.characterModel) return 0;
    try {
      return clearGripPreset(this.characterModel);
    } catch {
      return 0;
    }
  }

  private clear(): void {
    if (this.characterModel && this.characterModel.parent) {
      this.characterModel.parent.remove(this.characterModel);
    }
    this.characterModel = null;
    this.boneMap.clear();
  }


  dispose(): void {
    this.clear();
  }
}
