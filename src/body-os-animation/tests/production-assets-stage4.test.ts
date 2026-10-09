/**
 * Health OS Animation System — Stage 4: Production Asset Integration Tests
 *
 * Verifies (headless, no network — synthetic GLB loader):
 * - CharacterRegistry / SkeletonMap (+ production DEF adapter)
 * - MotionController / TwoBoneIK (untouched Phase 3 behavior)
 * - EquipmentRegistry production bindings (real GLB paths, runtimeIds)
 * - EquipmentController GLB path: cache, independence, no duplicate loads
 * - Procedural fallback when production GLB fails
 * - Production anchor resolution by bodyos_id + role (+ legacy fallback)
 * - Simultaneous dumbbell instances, two-hand barbell, world-static bench/floor
 * - Grip presets (semantic application + graceful fallback-rig no-op)
 * - Production muscle-map reconciliation (vertex groups merged, meshes kept)
 * - Exercise manifests + display-mode switching on the same live scene
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { CHARACTER_REGISTRY } from '../character/CharacterRegistry.js';
import { matchHumanoidBone } from '../character/SkeletonMap.js';
import {
  PRODUCTION_DEF_TO_CANONICAL,
  resolveProductionBoneDef,
  findProductionBoneNode,
} from '../character/ProductionSkeletonMap.js';
import { GRIP_PRESETS, applyGripPreset } from '../character/GripPresets.js';
import { registerProductionMaleAthleticMuscleMap } from '../character/ProductionMuscleMap.js';
import { CHARACTER_MUSCLE_MAPS } from '../muscles/CharacterMuscleMap.js';
import { MotionController } from '../motion/MotionController.js';
import { TwoBoneIK } from '../motion/TwoBoneIK.js';
import {
  EQUIPMENT_REGISTRY,
  getEquipmentDefinition,
  getEquipmentByType,
} from '../equipment/EquipmentRegistry.js';
import { AttachmentSystem, type CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';
import { EquipmentController } from '../equipment/EquipmentController.js';
import {
  findAnchorByBodyosId,
  findAnchorsByRole,
  resolveEquipmentAnchor,
  selectProductionRoot,
} from '../equipment/ProductionAnchors.js';
import { EXERCISE_REGISTRY } from '../exercise/ExerciseRegistry.js';
import { ExerciseController } from '../exercise/ExerciseController.js';
import { CharacterController } from '../character/CharacterController.js';
import { CameraController } from '../camera/CameraController.js';
import { MuscleController } from '../muscles/MuscleController.js';
import { FormCueController } from '../form/FormCueController.js';
import type { EquipmentAttachmentPoint, HumanoidBoneName } from '../core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function createMockCharacter(): CharacterSkeletonProvider & { root: THREE.Group; bones: Map<string, THREE.Object3D> } {
  const root = new THREE.Group();
  root.name = 'mock_root';
  const bones = new Map<string, THREE.Object3D>();
  const names: HumanoidBoneName[] = [
    'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
    'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
    'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
    'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
  ];
  const hips = new THREE.Group();
  hips.name = 'hips';
  root.add(hips);
  bones.set('hips', hips);
  for (const name of names) {
    if (name === 'hips') continue;
    const bone = new THREE.Group();
    bone.name = name;
    bone.position.set(0, 0.1, 0);
    hips.add(bone);
    bones.set(name, bone);
  }
  bones.get('leftHand')!.position.set(-0.5, 1.2, 0);
  bones.get('rightHand')!.position.set(0.5, 1.2, 0);
  root.updateMatrixWorld(true);
  return { root, bones, getBone: (n) => bones.get(n) || null, getRoot: () => root };
}

/** Builds a synthetic production-style equipment model with metadata anchors. */
function syntheticGlbModel(kind: 'dumbbell' | 'barbell' | 'bench' | 'plates'): THREE.Group {
  const root = new THREE.Group();
  root.name = `synthetic_${kind}`;
  const addAnchor = (name: string, bodyosId: string, role: string) => {
    const anchor = new THREE.Object3D();
    anchor.name = name;
    anchor.userData.bodyos_anchor = true;
    anchor.userData.bodyos_id = bodyosId;
    anchor.userData.role = role;
    root.add(anchor);
    return anchor;
  };
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  body.name = `synthetic_${kind}_body`;
  root.add(body);
  if (kind === 'dumbbell') {
    addAnchor('BODYOS_Grip_C', 'equipment.grip.center', 'palm_grip').position.set(0, -0.04, 0);
  }
  if (kind === 'barbell') {
    addAnchor('BODYOS_Grip_LeftHand', 'equipment.grip.left', 'left_hand_grip');
    addAnchor('BODYOS_Grip_RightHand', 'equipment.grip.right', 'right_hand_grip');
  }
  if (kind === 'bench') {
    addAnchor('BODYOS_FloorBase_FlatBench', 'equipment.floor_base', 'floor_contact');
  }
  if (kind === 'plates') {
    const sub = new THREE.Group();
    sub.name = 'EQ_Plate_20kg';
    sub.userData.runtime_id = 'plate-20kg';
    const bore = new THREE.Object3D();
    bore.name = 'BODYOS_Bore_20kg';
    bore.userData.bodyos_anchor = true;
    bore.userData.bodyos_id = 'equipment.bore';
    bore.userData.role = 'olympic_bore';
    sub.add(bore);
    root.add(sub);
  }
  return root;
}

// ---------------------------------------------------------------------------
// CharacterRegistry + SkeletonMap + production DEF adapter
// ---------------------------------------------------------------------------
describe('Stage 4: character registry and skeleton mapping', () => {
  it('male-athletic registry entry points at the production VRM URL', () => {
    const def = CHARACTER_REGISTRY['male-athletic'];
    assert.ok(def);
    assert.equal(def.asset, '/assets/body-os/characters/male-athletic.vrm');
  });

  it('canonical matchHumanoidBone still resolves standard names', () => {
    assert.equal(matchHumanoidBone('leftHand'), 'leftHand');
    assert.equal(matchHumanoidBone('DEF-toe.L'), null);
  });

  it('production DEF map covers the load-bearing skeleton', () => {
    assert.equal(resolveProductionBoneDef('DEF-spine'), 'hips');
    assert.equal(resolveProductionBoneDef('DEF-thigh.L'), 'leftUpperLeg');
    assert.equal(resolveProductionBoneDef('DEF-hand.R'), 'rightHand');
    assert.equal(resolveProductionBoneDef('DEF-knee-helper.L'), null);
    assert.ok(Object.keys(PRODUCTION_DEF_TO_CANONICAL).length >= 22);
  });

  it('findProductionBoneNode locates DEF bones in a loaded scene', () => {
    const root = new THREE.Group();
    const hand = new THREE.Group();
    hand.name = 'DEF-hand.L';
    root.add(hand);
    assert.equal(findProductionBoneNode(root, 'DEF-hand.L'), hand);
    assert.equal(findProductionBoneNode(root, 'DEF-hand.R'), null);
  });
});

// ---------------------------------------------------------------------------
// Motion (Phase 3 untouched)
// ---------------------------------------------------------------------------
describe('Stage 4: motion system intact', () => {
  it('MotionController plays the production squat exercise', () => {
    const motion = new MotionController();
    const character = createMockCharacter();
    motion.setExercise('bodyweight-squat');
    assert.ok(motion.getDuration() > 0);
    motion.play();
    motion.update(0.5, character);
    assert.ok(motion.getCurrentTime() >= 0);
  });

  it('TwoBoneIK ground lock keeps feet planted', () => {
    const hip = new THREE.Vector3(0, 0.9, 0);
    const foot = new THREE.Vector3(0.1, 0.02, 0);
    const solved = TwoBoneIK.solveLegGroundLock(hip, foot, 0.44, 0.4);
    assert.ok(solved);
  });
});

// ---------------------------------------------------------------------------
// EquipmentRegistry production bindings
// ---------------------------------------------------------------------------
describe('Stage 4: equipment registry production bindings', () => {
  it('dumbbell/barbell/bench point at real production GLBs', () => {
    assert.equal(getEquipmentDefinition('dumbbell')!.asset, '/assets/body-os/equipment/dumbbell.glb');
    assert.equal(getEquipmentDefinition('barbell')!.asset, '/assets/body-os/equipment/barbell.glb');
    assert.equal(getEquipmentDefinition('flat-bench')!.asset, '/assets/body-os/equipment/flat-bench.glb');
    assert.equal(
      getEquipmentDefinition('dumbbell')!.production!.anchors!['Grip_C'],
      'equipment.grip.center'
    );
  });

  it('plates share weight-plates.glb with per-variant runtimeIds', () => {
    for (const [id, runtimeId] of [['weight-plate-20kg', 'plate-20kg'], ['weight-plate-10kg', 'plate-10kg'], ['weight-plate-5kg', 'plate-5kg']] as const) {
      const def = getEquipmentDefinition(id)!;
      assert.equal(def.asset, '/assets/body-os/equipment/weight-plates.glb');
      assert.equal(def.production!.runtimeId, runtimeId);
    }
  });

  it('body-os-floor registry entry is world-static', () => {
    const floor = getEquipmentDefinition('body-os-floor')!;
    assert.equal(floor.constraint?.mode, 'world-static');
    assert.equal(floor.asset, '/assets/body-os/equipment/body-os-floor.glb');
    assert.equal(getEquipmentByType('floor').length, 1);
  });

  it('all five first-exercise equipment assets resolve to copied GLBs', () => {
    const needed = new Set<string>();
    for (const id of ['jumping-jack', 'bodyweight-squat', 'push-up', 'dumbbell-curl', 'bench-press']) {
      const ex = EXERCISE_REGISTRY[id];
      assert.ok(ex, `exercise ${id} registered`);
      for (const att of ex.equipment) {
        const def = EQUIPMENT_REGISTRY[att.id];
        assert.ok(def, `equipment ${att.id} registered`);
        needed.add(def.production?.glb || def.asset);
      }
    }
    for (const glb of needed) {
      assert.match(glb, /^\/assets\/body-os\/equipment\/[a-z0-9-]+\.glb$/);
    }
    assert.ok(needed.has('/assets/body-os/equipment/dumbbell.glb'));
    assert.ok(needed.has('/assets/body-os/equipment/barbell.glb'));
    assert.ok(needed.has('/assets/body-os/equipment/flat-bench.glb'));
  });
});

// ---------------------------------------------------------------------------
// Production anchor resolver
// ---------------------------------------------------------------------------
describe('Stage 4: production anchor resolution', () => {
  it('resolves by bodyos_id primarily', () => {
    const model = syntheticGlbModel('dumbbell');
    const anchor = findAnchorByBodyosId(model, 'equipment.grip.center');
    assert.ok(anchor);
    assert.equal(anchor!.name, 'BODYOS_Grip_C');
    assert.equal(findAnchorByBodyosId(model, 'equipment.nope'), null);
  });

  it('resolves by role', () => {
    const model = syntheticGlbModel('barbell');
    assert.equal(findAnchorsByRole(model, 'left_hand_grip').length, 1);
    assert.equal(findAnchorsByRole(model, 'right_hand_grip').length, 1);
    assert.equal(findAnchorsByRole(model, 'palm_grip').length, 0);
  });

  it('scoped bodyos_id + role beats legacy node name', () => {
    const model = syntheticGlbModel('barbell');
    // A misleading legacy name must not win over metadata.
    model.children[0].name = 'WRONG_NAME';
    const resolved = resolveEquipmentAnchor(model, {
      bodyosId: 'equipment.grip.left',
      role: 'left_hand_grip',
      nodeName: 'BODYOS_Grip_RightHand',
    });
    assert.ok(resolved);
    assert.equal(resolved!.userData.bodyos_id, 'equipment.grip.left');
  });

  it('falls back to node name when metadata is absent', () => {
    const plain = new THREE.Group();
    const legacy = new THREE.Object3D();
    legacy.name = 'Grip_C';
    plain.add(legacy);
    assert.equal(resolveEquipmentAnchor(plain, { nodeName: 'Grip_C' }), legacy);
    assert.equal(resolveEquipmentAnchor(plain, { bodyosId: 'equipment.grip.center' }), null);
  });

  it('selects multi-root GLB variants by runtime_id', () => {
    const scene = syntheticGlbModel('plates');
    const root20 = selectProductionRoot(scene, 'plate-20kg');
    assert.equal(root20.name, 'EQ_Plate_20kg');
    assert.equal(selectProductionRoot(scene, 'plate-99kg'), scene);
    assert.equal(selectProductionRoot(scene), scene);
  });
});

// ---------------------------------------------------------------------------
// EquipmentController GLB path + fallback
// ---------------------------------------------------------------------------
describe('Stage 4: EquipmentController production loading', () => {
  it('caches the GLB base and clones independent instances', async () => {
    let loads = 0;
    const controller = new EquipmentController();
    const character = createMockCharacter();
    controller.setSceneRoot(new THREE.Group());
    controller.setModelLoader(async () => {
      loads += 1;
      return syntheticGlbModel('dumbbell');
    });

    await controller.loadAndAttach(
      [
        { id: 'dumbbell', attachToBone: 'leftHand', socketName: 'Grip_C' },
        { id: 'dumbbell', attachToBone: 'rightHand', socketName: 'Grip_C' },
      ],
      character
    );
    const [left, right] = controller.getActiveInstances();
    assert.equal(controller.getActiveInstances().length, 2);
    assert.ok(controller.isProductionBacked('dumbbell'));
    assert.notEqual(left, right);
    assert.ok(left.children.length > 0 && right.children.length > 0);
    // Moving one instance must not move the other (independent clones).
    left.position.x += 5;
    assert.ok(Math.abs(right.position.x - left.position.x) > 1);
    assert.equal(loads, 1);
    controller.dispose();
  });

  it('does not repeat network loads across exercise switches', async () => {
    let loads = 0;
    const controller = new EquipmentController();
    const character = createMockCharacter();
    controller.setSceneRoot(new THREE.Group());
    controller.setModelLoader(async (url: string) => {
      loads += 1;
      assert.ok(url.endsWith('.glb'));
      return syntheticGlbModel('dumbbell');
    });
    const att: EquipmentAttachmentPoint[] = [{ id: 'dumbbell', attachToBone: 'leftHand', socketName: 'Grip_C' }];
    await controller.loadAndAttach(att, character);
    await controller.loadAndAttach(att, character);
    await controller.loadAndAttach(att, character);
    assert.equal(loads, 1);
    controller.dispose();
  });

  it('falls back to procedural meshes when the GLB fails', async () => {
    const controller = new EquipmentController();
    const character = createMockCharacter();
    controller.setSceneRoot(new THREE.Group());
    controller.setModelLoader(async () => {
      throw new Error('simulated production outage');
    });
    await controller.loadAndAttach(
      [{ id: 'dumbbell', attachToBone: 'leftHand', socketName: 'Grip_C' }],
      character
    );
    assert.equal(controller.getActiveInstances().length, 1);
    assert.equal(controller.isProductionBacked('dumbbell'), false);
    assert.ok(controller.getActiveInstances()[0].children.length > 0);
    controller.dispose();
  });

  it('two-hand barbell works with a production-backed instance', async () => {
    const controller = new EquipmentController();
    const character = createMockCharacter();
    const sceneRoot = new THREE.Group();
    controller.setSceneRoot(sceneRoot);
    controller.setModelLoader(async () => syntheticGlbModel('barbell'));
    await controller.loadAndAttach(
      [{ id: 'barbell', attachToBone: 'leftHand', socketName: 'two-hand' }],
      character
    );
    assert.equal(controller.getActiveInstances().length, 1);
    assert.equal(controller.getAttachmentRecordCount(), 1);
    controller.update();
    controller.dispose();
  });

  it('world-static bench and floor attach at fixed positions', async () => {
    const controller = new EquipmentController();
    const character = createMockCharacter();
    controller.setSceneRoot(new THREE.Group());
    controller.setModelLoader(async (url: string) => {
      if (url.includes('flat-bench')) return syntheticGlbModel('bench');
      const floor = new THREE.Group();
      floor.name = 'synthetic_floor';
      const origin = new THREE.Object3D();
      origin.name = 'BODYOS_FloorOrigin';
      origin.userData.bodyos_anchor = true;
      origin.userData.bodyos_id = 'equipment.floor_origin';
      origin.userData.role = 'runtime_origin';
      floor.add(origin);
      return floor;
    });
    await controller.loadAndAttach(
      [
        { id: 'flat-bench', attachToBone: 'floor', socketName: 'Floor_Base' },
        { id: 'body-os-floor', attachToBone: 'floor', socketName: 'FloorOrigin' },
      ],
      character
    );
    assert.equal(controller.getActiveInstances().length, 2);
    assert.ok(controller.isProductionBacked('flat-bench'));
    assert.ok(controller.isProductionBacked('body-os-floor'));
    controller.dispose();
  });

  it('anchor-compensated parenting aligns the production grip to the bone', async () => {
    const controller = new EquipmentController();
    const character = createMockCharacter();
    controller.setSceneRoot(new THREE.Group());
    controller.setModelLoader(async () => syntheticGlbModel('dumbbell'));
    await controller.loadAndAttach(
      [{ id: 'dumbbell', attachToBone: 'leftHand', socketName: 'Grip_C' }],
      character
    );
    const instance = controller.getActiveInstances()[0];
    assert.ok(controller.resolveAnchorForEquipment('dumbbell', 'Grip_C'));
    const anchor = resolveEquipmentAnchor(instance, { bodyosId: 'equipment.grip.center' });
    assert.ok(anchor);
    // The compensated grip anchor must sit at the hand bone origin.
    anchor!.updateWorldMatrix(true, false);
    const world = new THREE.Vector3();
    anchor!.getWorldPosition(world);
    const handWorld = new THREE.Vector3();
    character.bones.get('leftHand')!.getWorldPosition(handWorld);
    assert.ok(world.distanceTo(handWorld) < 1e-4);
    controller.dispose();
  });
});

// ---------------------------------------------------------------------------
// Grip presets
// ---------------------------------------------------------------------------
describe('Stage 4: grip presets', () => {
  function fingerRig(): THREE.Group {
    const root = new THREE.Group();
    for (const name of Object.keys(GRIP_PRESETS.DUMBBELL_GRIP)) {
      const bone = new THREE.Group();
      bone.name = name;
      root.add(bone);
    }
    return root;
  }

  it('both presets carry full bilateral finger tables', () => {
    assert.equal(Object.keys(GRIP_PRESETS.DUMBBELL_GRIP).length, 30);
    assert.equal(Object.keys(GRIP_PRESETS.BARBELL_GRIP).length, 30);
  });

  it('applies DUMBBELL_GRIP to a production-derived rig', () => {
    const rig = fingerRig();
    const applied = applyGripPreset(rig, 'DUMBBELL_GRIP');
    assert.equal(applied, 30);
    const index = rig.getObjectByName('DEF-f_index.01.L')!;
    assert.ok(Math.abs(index.rotation.x - 1.25) < 1e-9);
  });

  it('BARBELL_GRIP differs from DUMBBELL_GRIP (tighter curl)', () => {
    const rig = fingerRig();
    applyGripPreset(rig, 'BARBELL_GRIP');
    const index = rig.getObjectByName('DEF-f_index.01.L')!;
    assert.ok(Math.abs(index.rotation.x - 1.3393) < 1e-9);
  });

  it('gracefully poses zero bones on the procedural fallback rig', () => {
    const fallback = new THREE.Group();
    fallback.name = 'body_os_male_athletic';
    const hand = new THREE.Group();
    hand.name = 'leftHand';
    fallback.add(hand);
    assert.equal(applyGripPreset(fallback, 'DUMBBELL_GRIP'), 0);
  });

  it('CharacterController.applyGripPreset never throws without a model', () => {
    const controller = new CharacterController();
    assert.equal(controller.applyGripPreset('BARBELL_GRIP'), 0);
  });
});

// ---------------------------------------------------------------------------
// Production muscle map + exercise manifests + display modes
// ---------------------------------------------------------------------------
describe('Stage 4: muscle map, manifests, display modes', () => {
  it('registers production vertex groups while keeping mesh descriptors', () => {
    registerProductionMaleAthleticMuscleMap();
    const quads = CHARACTER_MUSCLE_MAPS['male-athletic']!['quadriceps']!;
    assert.ok(quads.meshNames.includes('muscle_quads_left'));
    assert.ok(quads.vertexGroups);
    assert.equal(quads.vertexGroups!.length, 2);
    assert.equal(quads.vertexGroups![0].group, 'bodyos.region.quadriceps.left');
    assert.equal(quads.vertexGroups![0].regionIndex, 12);
    assert.equal(quads.vertexGroups![1].regionIndex, 27);
  });

  it('all five validation exercises remain registered with equipment', () => {
    for (const id of ['jumping-jack', 'bodyweight-squat', 'push-up', 'dumbbell-curl', 'bench-press']) {
      assert.ok(EXERCISE_REGISTRY[id], id);
    }
    assert.equal(EXERCISE_REGISTRY['dumbbell-curl'].equipment.length, 2);
    // Stage 5: bench station = bench + floor + barbell + 2 sleeve plates.
    assert.equal(EXERCISE_REGISTRY['bench-press'].equipment.length, 5);
    assert.equal(EXERCISE_REGISTRY['bodyweight-squat'].equipment.length, 0);
  });

  it('display modes share one live scene (no character/exercise reload)', async () => {
    const character = new CharacterController();
    const motion = new MotionController();
    const equipment = new EquipmentController();
    equipment.setModelLoader(async () => {
      throw new Error('no network in unit tests');
    });
    const muscles = new MuscleController();
    const camera = new CameraController(new THREE.PerspectiveCamera());
    const formCues = new FormCueController();
    const controller = new ExerciseController(character, motion, equipment, muscles, camera, formCues);

    await character.loadCharacter('male-athletic', new THREE.Group());
    await controller.loadExercise('bodyweight-squat');
    const sceneBefore = character.getRoot();

    controller.setDisplayMode('muscles');
    assert.equal(controller.getDisplayMode(), 'muscles');
    assert.equal(character.getRoot(), sceneBefore);

    controller.setDisplayMode('form');
    assert.equal(controller.getDisplayMode(), 'form');
    assert.equal(character.getRoot(), sceneBefore);
    assert.equal(motion.getSpeed(), 0.5);

    controller.setDisplayMode('exercise');
    assert.equal(controller.getDisplayMode(), 'exercise');
    assert.equal(character.getRoot(), sceneBefore);
    controller.dispose();
  });
});
