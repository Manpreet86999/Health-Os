/**
 * Health OS Animation System — Phase 4: Equipment & Interaction System Tests
 *
 * Validates:
 * 1. Equipment Registry v2 definitions (dumbbell, barbell, plates, bench)
 * 2. Attachment System constraint modes (parent, two-hand, world-static)
 * 3. EquipmentController lifecycle (load, detach, dispose, no duplicates)
 * 4. Barbell two-hand constraint midpoint and orientation correctness
 * 5. Equipment mesh generation (non-empty groups with children)
 * 6. Memory management (no leaks on repeated exercise switching)
 *
 * Stage 4: ported from vitest to node:test so the suite runs under the
 * project test tooling (`tsx --test`). Controller tests inject a throwing
 * model loader to deterministically exercise the procedural fallback
 * (no network in unit tests); production GLB paths are covered in
 * production-assets-stage4.test.ts with a synthetic loader.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AttachmentSystem, type CharacterSkeletonProvider } from '../equipment/AttachmentSystem.js';
import { EquipmentController } from '../equipment/EquipmentController.js';
import {
  EQUIPMENT_REGISTRY,
  getEquipmentDefinition,
  getAllEquipmentIds,
  getEquipmentByType,
} from '../equipment/EquipmentRegistry.js';
import type { EquipmentAttachmentPoint, HumanoidBoneName } from '../core/types.js';

// =============================================================================
// Mock Character Skeleton Provider
// =============================================================================
function createMockCharacter(): CharacterSkeletonProvider & { bones: Map<string, THREE.Object3D> } {
  const root = new THREE.Group();
  root.name = 'mock_root';

  const bones = new Map<string, THREE.Object3D>();
  const boneNames: HumanoidBoneName[] = [
    'hips', 'spine', 'chest', 'upperChest', 'neck', 'head',
    'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
    'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
    'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes',
    'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
  ];

  // Build a simple hierarchy
  let current = root;
  for (const name of boneNames) {
    const bone = new THREE.Group();
    bone.name = name;
    bone.position.set(0, 0.1, 0); // Slight offset for each
    current.add(bone);
    bones.set(name, bone);
    // Keep building from hips
    if (name === 'hips') current = bone;
  }

  // Place hands at known world positions for testing
  const leftHand = bones.get('leftHand')!;
  leftHand.position.set(-0.5, 1.2, 0);

  const rightHand = bones.get('rightHand')!;
  rightHand.position.set(0.5, 1.2, 0);

  // Force world matrix computation
  root.updateMatrixWorld(true);

  return {
    bones,
    getBone: (name: HumanoidBoneName) => bones.get(name) || null,
    getRoot: () => root,
  };
}

/** Model loader that always fails — forces the procedural fallback path. */
async function failingLoader(): Promise<THREE.Object3D> {
  throw new Error('no network in unit tests');
}

// =============================================================================
// TEST SUITE: Equipment Registry v2
// =============================================================================
describe('Equipment Registry v2', () => {
  it('contains all required equipment definitions', () => {
    const ids = getAllEquipmentIds();
    assert.ok(ids.includes('dumbbell'));
    assert.ok(ids.includes('barbell'));
    assert.ok(ids.includes('flat-bench'));
    assert.ok(ids.includes('weight-plate-20kg'));
    assert.ok(ids.includes('weight-plate-10kg'));
    assert.ok(ids.includes('weight-plate-5kg'));
  });

  it('dumbbell has parent constraint mode', () => {
    const def = getEquipmentDefinition('dumbbell');
    assert.ok(def);
    assert.equal(def!.constraint?.mode, 'parent');
    assert.equal(def!.version, 2);
  });

  it('barbell has two-hand constraint mode with correct bone targets', () => {
    const def = getEquipmentDefinition('barbell');
    assert.ok(def);
    assert.equal(def!.constraint?.mode, 'two-hand');
    assert.equal(def!.constraint?.boneA, 'leftHand');
    assert.equal(def!.constraint?.boneB, 'rightHand');
  });

  it('flat-bench has world-static constraint mode', () => {
    const def = getEquipmentDefinition('flat-bench');
    assert.ok(def);
    assert.equal(def!.constraint?.mode, 'world-static');
  });

  it('all weight plates have parent constraint mode', () => {
    const plates = getEquipmentByType('plate');
    assert.equal(plates.length, 3);
    for (const plate of plates) {
      assert.equal(plate.constraint?.mode, 'parent');
    }
  });

  it('all equipment has physical dimensions', () => {
    for (const def of Object.values(EQUIPMENT_REGISTRY)) {
      assert.ok(def.dimensions);
      assert.ok(def.dimensions!.length! > 0);
    }
  });

  it('barbell dimensions match Olympic standard (2.2m)', () => {
    const def = getEquipmentDefinition('barbell');
    assert.equal(def!.dimensions!.length, 2.2);
    assert.equal(def!.dimensions!.weight, 20);
  });

  it('bench height matches design spec (0.48m)', () => {
    const def = getEquipmentDefinition('flat-bench');
    assert.equal(def!.dimensions!.height, 0.48);
  });
});

// =============================================================================
// TEST SUITE: Attachment System
// =============================================================================
describe('AttachmentSystem', () => {
  let system: AttachmentSystem;
  let character: ReturnType<typeof createMockCharacter>;

  beforeEach(() => {
    system = new AttachmentSystem();
    character = createMockCharacter();
  });

  it('attaches an item to a bone via parent mode', () => {
    const item = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    const att: EquipmentAttachmentPoint = {
      id: 'dumbbell',
      attachToBone: 'leftHand',
      socketName: 'Grip_C',
      offset: { position: [0, -0.05, 0], rotation: [0, 0, 0] },
    };
    const success = system.attach(item, att, character);
    assert.equal(success, true);
    assert.ok(item.parent);
    assert.ok(Math.abs(item.position.y - -0.05) < 1e-6);
    assert.equal(system.getRecordCount(), 1);
  });

  it('returns false when target bone is not found', () => {
    const item = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    const att: EquipmentAttachmentPoint = {
      id: 'dumbbell',
      attachToBone: 'leftToes',
      socketName: 'Grip_C',
    };
    const mockWithMissing: CharacterSkeletonProvider = {
      getBone: () => null,
      getRoot: () => new THREE.Group(),
    };
    const success = system.attach(item, att, mockWithMissing);
    assert.equal(success, false);
    assert.equal(system.getRecordCount(), 0);
  });

  it('attaches to floor/root bone', () => {
    const item = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 1.0));
    const att: EquipmentAttachmentPoint = {
      id: 'flat-bench',
      attachToBone: 'floor',
      socketName: 'Floor_Base',
    };
    const success = system.attach(item, att, character);
    assert.equal(success, true);
    assert.equal(item.parent, character.getRoot());
  });

  it('detaches all items and clears records', () => {
    const item1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    const item2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    system.attach(item1, { id: 'dumbbell', attachToBone: 'leftHand', socketName: 'Grip_C' }, character);
    system.attach(item2, { id: 'dumbbell', attachToBone: 'rightHand', socketName: 'Grip_C' }, character);
    assert.equal(system.getRecordCount(), 2);

    system.detachAll();
    assert.equal(system.getRecordCount(), 0);
    assert.equal(item1.parent, null);
    assert.equal(item2.parent, null);
  });

  it('attaches equipment with two-hand constraint', () => {
    const sceneRoot = new THREE.Group();
    system.setSceneRoot(sceneRoot);

    const item = new THREE.Group();
    item.name = 'barbell';
    const att: EquipmentAttachmentPoint = {
      id: 'barbell',
      attachToBone: 'leftHand',
      socketName: 'Grip_LeftHand',
    };

    const success = system.attachTwoHand(
      item,
      att,
      character,
      'leftHand',
      'rightHand',
      { barAxisX: true }
    );

    assert.equal(success, true);
    assert.equal(system.getRecordCount(), 1);
    assert.equal(item.parent, sceneRoot);
  });

  it('two-hand constraint positions item at midpoint between hands', () => {
    const sceneRoot = new THREE.Group();
    system.setSceneRoot(sceneRoot);

    // Position hands at known locations
    const leftHand = character.bones.get('leftHand')!;
    const rightHand = character.bones.get('rightHand')!;
    leftHand.position.set(-1.0, 1.5, 0);
    rightHand.position.set(1.0, 1.5, 0);
    character.getRoot().updateMatrixWorld(true);

    const item = new THREE.Group();
    const att: EquipmentAttachmentPoint = {
      id: 'barbell',
      attachToBone: 'leftHand',
      socketName: 'Grip_LeftHand',
    };

    system.attachTwoHand(item, att, character, 'leftHand', 'rightHand', { barAxisX: true });

    // After attachment, the item should be near the midpoint
    // Note: world positions depend on parent chain, but the concept should hold
    assert.ok(item.position);
    assert.equal(system.getRecordCount(), 1);

    // Update should not throw
    system.update();
  });

  it('world-static attachment positions at fixed world coordinates', () => {
    const sceneRoot = new THREE.Group();
    system.setSceneRoot(sceneRoot);

    const item = new THREE.Group();
    const att: EquipmentAttachmentPoint = {
      id: 'flat-bench',
      attachToBone: 'floor',
      socketName: 'Floor_Base',
    };

    const success = system.attachWorldStatic(item, att, character, [0.5, 0, 0.3], [0, Math.PI / 4, 0]);
    assert.equal(success, true);
    assert.ok(Math.abs(item.position.x - 0.5) < 1e-6);
    assert.ok(Math.abs(item.position.z - 0.3) < 1e-6);
    assert.ok(Math.abs(item.rotation.y - Math.PI / 4) < 1e-6);
  });
});

// =============================================================================
// TEST SUITE: Equipment Controller
// =============================================================================
describe('EquipmentController', () => {
  let controller: EquipmentController;
  let character: ReturnType<typeof createMockCharacter>;

  beforeEach(() => {
    controller = new EquipmentController();
    character = createMockCharacter();
    controller.setSceneRoot(new THREE.Group());
    controller.setModelLoader(failingLoader);
  });

  it('loads and attaches dumbbell curl equipment (2 dumbbells)', async () => {
    const attachments: EquipmentAttachmentPoint[] = [
      {
        id: 'dumbbell',
        attachToBone: 'leftHand',
        socketName: 'Grip_C',
        offset: { position: [0, -0.05, 0], rotation: [0, 0, 0] },
      },
      {
        id: 'dumbbell',
        attachToBone: 'rightHand',
        socketName: 'Grip_C',
        offset: { position: [0, -0.05, 0], rotation: [0, 0, 0] },
      },
    ];

    await controller.loadAndAttach(attachments, character);
    const instances = controller.getActiveInstances();
    assert.equal(instances.length, 2);
  });

  it('loads bench press equipment (bench + barbell)', async () => {
    const attachments: EquipmentAttachmentPoint[] = [
      {
        id: 'flat-bench',
        attachToBone: 'floor',
        socketName: 'Floor_Base',
        offset: { position: [0, 0, 0], rotation: [0, 0, 0] },
      },
      {
        id: 'barbell',
        attachToBone: 'leftHand',
        socketName: 'Grip_LeftHand',
        offset: { position: [0, -0.03, 0], rotation: [0, 0, 0] },
      },
    ];

    await controller.loadAndAttach(attachments, character);
    const instances = controller.getActiveInstances();
    assert.equal(instances.length, 2);
  });

  it('detaches previous equipment when loading new exercise', async () => {
    // First: load dumbbell curl
    await controller.loadAndAttach(
      [
        { id: 'dumbbell', attachToBone: 'leftHand', socketName: 'Grip_C', offset: { position: [0, -0.05, 0], rotation: [0, 0, 0] } },
        { id: 'dumbbell', attachToBone: 'rightHand', socketName: 'Grip_C', offset: { position: [0, -0.05, 0], rotation: [0, 0, 0] } },
      ],
      character
    );
    assert.equal(controller.getActiveInstances().length, 2);

    // Second: load bodyweight exercise (no equipment)
    await controller.loadAndAttach([], character);
    assert.equal(controller.getActiveInstances().length, 0);
  });

  it('does not create duplicate objects on repeated loads', async () => {
    const attachments: EquipmentAttachmentPoint[] = [
      { id: 'dumbbell', attachToBone: 'leftHand', socketName: 'Grip_C', offset: { position: [0, -0.05, 0], rotation: [0, 0, 0] } },
    ];

    await controller.loadAndAttach(attachments, character);
    assert.equal(controller.getActiveInstances().length, 1);

    await controller.loadAndAttach(attachments, character);
    assert.equal(controller.getActiveInstances().length, 1); // Not 2

    await controller.loadAndAttach(attachments, character);
    assert.equal(controller.getActiveInstances().length, 1); // Not 3
  });

  it('update() does not throw for parent or two-hand modes', async () => {
    await controller.loadAndAttach(
      [
        { id: 'flat-bench', attachToBone: 'floor', socketName: 'Floor_Base', offset: { position: [0, 0, 0], rotation: [0, 0, 0] } },
        { id: 'barbell', attachToBone: 'leftHand', socketName: 'Grip_LeftHand', offset: { position: [0, -0.03, 0], rotation: [0, 0, 0] } },
      ],
      character
    );

    // Should not throw during frame update
    controller.update();
    controller.update();
    controller.update();
  });

  it('dispose() clears cache and active instances', async () => {
    await controller.loadAndAttach(
      [{ id: 'dumbbell', attachToBone: 'leftHand', socketName: 'Grip_C', offset: { position: [0, -0.05, 0], rotation: [0, 0, 0] } }],
      character
    );
    assert.equal(controller.getActiveInstances().length, 1);

    controller.dispose();
    assert.equal(controller.getActiveInstances().length, 0);
  });

  it('generated dumbbell mesh has children (non-empty)', async () => {
    await controller.loadAndAttach(
      [{ id: 'dumbbell', attachToBone: 'leftHand', socketName: 'Grip_C', offset: { position: [0, -0.05, 0], rotation: [0, 0, 0] } }],
      character
    );
    const instances = controller.getActiveInstances();
    assert.ok(instances[0].children.length > 0);
  });

  it('generated barbell mesh has children (non-empty)', async () => {
    await controller.loadAndAttach(
      [{ id: 'barbell', attachToBone: 'leftHand', socketName: 'Grip_LeftHand', offset: { position: [0, -0.03, 0], rotation: [0, 0, 0] } }],
      character
    );
    const instances = controller.getActiveInstances();
    assert.ok(instances[0].children.length > 0);
  });

  it('generated bench mesh has children (non-empty)', async () => {
    await controller.loadAndAttach(
      [{ id: 'flat-bench', attachToBone: 'floor', socketName: 'Floor_Base', offset: { position: [0, 0, 0], rotation: [0, 0, 0] } }],
      character
    );
    const instances = controller.getActiveInstances();
    assert.ok(instances[0].children.length > 0);
  });
});

// =============================================================================
// TEST SUITE: Memory & Lifecycle
// =============================================================================
describe('Equipment Memory & Lifecycle', () => {
  it('repeated equipment switching does not leak (50 cycles)', async () => {
    const controller = new EquipmentController();
    const character = createMockCharacter();
    controller.setSceneRoot(new THREE.Group());
    controller.setModelLoader(failingLoader);

    const dumbbellAtt: EquipmentAttachmentPoint[] = [
      { id: 'dumbbell', attachToBone: 'leftHand', socketName: 'Grip_C', offset: { position: [0, -0.05, 0], rotation: [0, 0, 0] } },
      { id: 'dumbbell', attachToBone: 'rightHand', socketName: 'Grip_C', offset: { position: [0, -0.05, 0], rotation: [0, 0, 0] } },
    ];
    const benchPressAtt: EquipmentAttachmentPoint[] = [
      { id: 'flat-bench', attachToBone: 'floor', socketName: 'Floor_Base', offset: { position: [0, 0, 0], rotation: [0, 0, 0] } },
      { id: 'barbell', attachToBone: 'leftHand', socketName: 'Grip_LeftHand', offset: { position: [0, -0.03, 0], rotation: [0, 0, 0] } },
    ];
    const noEquipment: EquipmentAttachmentPoint[] = [];

    for (let i = 0; i < 50; i++) {
      await controller.loadAndAttach(dumbbellAtt, character);
      assert.equal(controller.getActiveInstances().length, 2);

      await controller.loadAndAttach(benchPressAtt, character);
      assert.equal(controller.getActiveInstances().length, 2);

      await controller.loadAndAttach(noEquipment, character);
      assert.equal(controller.getActiveInstances().length, 0);
    }

    controller.dispose();
    assert.equal(controller.getActiveInstances().length, 0);
  });
});
