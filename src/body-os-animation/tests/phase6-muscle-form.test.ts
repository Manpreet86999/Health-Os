import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';

import { ExerciseController } from '../exercise/ExerciseController.js';
import { CharacterController } from '../character/CharacterController.js';
import { MotionController } from '../motion/MotionController.js';
import { EquipmentController } from '../equipment/EquipmentController.js';
import { CameraController } from '../camera/CameraController.js';
import { MuscleController } from '../muscles/MuscleController.js';
import { MuscleMaterialController } from '../muscles/MuscleMaterialController.js';
import { MuscleRegionResolver } from '../muscles/MuscleRegionResolver.js';
import {
  CHARACTER_MUSCLE_MAPS,
  getMuscleTarget,
  registerCharacterMuscleMap,
} from '../muscles/CharacterMuscleMap.js';
import { normalizeMuscleId, MUSCLE_REGISTRY } from '../muscles/MuscleRegistry.js';
import {
  FormCueDefinitionSchema,
  ExerciseFormMetadataSchema,
} from '../form/FormCueSchema.js';
import { JointGuideRenderer } from '../form/JointGuideRenderer.js';
import { PathRenderer } from '../form/PathRenderer.js';
import { AlignmentRenderer } from '../form/AlignmentRenderer.js';
import { FormOverlayRenderer } from '../form/FormOverlayRenderer.js';
import { FormCueController } from '../form/FormCueController.js';
import { EXERCISE_REGISTRY, getExerciseDefinition } from '../exercise/ExerciseRegistry.js';

describe('Health OS Animation System — Phase 6: Muscle + Form Architecture', () => {
  // Test 1: Display Mode Switching without reloading
  it('supports canonical DisplayMode ("exercise", "muscles", "form") without reload', async () => {
    const character = new CharacterController();
    const motion = new MotionController();
    const equipment = new EquipmentController();
    const muscles = new MuscleController();
    const camera = new CameraController(new THREE.PerspectiveCamera());
    const formCues = new FormCueController();

    const controller = new ExerciseController(character, motion, equipment, muscles, camera, formCues);
    await controller.loadExercise('bodyweight-squat');

    // Default: 'exercise' mode
    controller.setDisplayMode('exercise');
    assert.strictEqual(controller.getDisplayMode(), 'exercise');
    assert.strictEqual(muscles.getIsVisible(), false);
    assert.strictEqual(formCues.getIsVisible(), false);
    assert.strictEqual(motion.getSpeed(), 1.0);

    // Switch to: 'muscles' mode
    controller.setDisplayMode('muscles');
    assert.strictEqual(controller.getDisplayMode(), 'muscles');
    assert.strictEqual(muscles.getIsVisible(), true);
    assert.strictEqual(formCues.getIsVisible(), false);

    // Switch to: 'form' mode
    controller.setDisplayMode('form');
    assert.strictEqual(controller.getDisplayMode(), 'form');
    assert.strictEqual(muscles.getIsVisible(), false);
    assert.strictEqual(formCues.getIsVisible(), true);
    assert.strictEqual(motion.getSpeed(), 0.5, 'Form mode uses 0.5x inspection speed');

    // Switch back to: 'exercise' mode
    controller.setDisplayMode('exercise');
    assert.strictEqual(controller.getDisplayMode(), 'exercise');
    assert.strictEqual(muscles.getIsVisible(), false);
    assert.strictEqual(formCues.getIsVisible(), false);

    controller.dispose();
  });

  // Test 2: Primary vs Secondary Muscle Resolution
  it('visually distinguishes primary and secondary muscle activations', () => {
    const matController = new MuscleMaterialController();
    const primary = matController.getPrimaryMaterial() as THREE.MeshStandardMaterial;
    const secondary = matController.getSecondaryMaterial() as THREE.MeshStandardMaterial;
    const inactive = matController.getInactiveMaterial() as THREE.MeshBasicMaterial;

    assert.ok(primary.emissiveIntensity > secondary.emissiveIntensity, 'Primary has higher emissive intensity');
    assert.strictEqual(inactive.visible, false, 'Inactive material is hidden');
    assert.strictEqual(inactive.opacity, 0.0);

    matController.dispose();
  });

  // Test 3: Missing Muscle-Region Fallback
  it('gracefully generates fallback targets for non-mapped muscles or new characters', () => {
    // Unmapped character
    const targetUnknownChar = getMuscleTarget('future-character-v2', 'pectoralis-major');
    assert.strictEqual(targetUnknownChar.muscleId, 'pectoralis-major');
    assert.ok(targetUnknownChar.meshNames.includes('muscle_pectoralis_major_left'));
    assert.ok(targetUnknownChar.meshNames.includes('muscle_pectoralis_major_right'));

    // Fuzzy alias mapping
    const targetAlias = getMuscleTarget('male-athletic', 'quads');
    assert.strictEqual(targetAlias.muscleId, 'quadriceps');
  });

  // Test 4: Character Muscle-Map Abstraction for Zero-Code Replacement
  it('allows future characters to register custom mesh/material regions without code changes', () => {
    const futureCharId = 'next-gen-character-pro';
    registerCharacterMuscleMap(futureCharId, {
      'latissimus-dorsi': {
        muscleId: 'latissimus-dorsi',
        targetType: 'mesh',
        meshNames: ['mesh_pro_lats_l', 'mesh_pro_lats_r'],
        bilateralSplit: { leftMesh: 'mesh_pro_lats_l', rightMesh: 'mesh_pro_lats_r' },
      },
    });

    const target = getMuscleTarget(futureCharId, 'latissimus-dorsi');
    assert.strictEqual(target.muscleId, 'latissimus-dorsi');
    assert.deepStrictEqual(target.meshNames, ['mesh_pro_lats_l', 'mesh_pro_lats_r']);
  });

  // Test 4b: Left / Right / Bilateral Muscle Region Resolution
  it('supports side-specific muscle resolution (left, right, bilateral)', () => {
    const resolver = new MuscleRegionResolver();
    const meshLeft = new THREE.Mesh();
    meshLeft.name = 'muscle_biceps_left';
    const meshRight = new THREE.Mesh();
    meshRight.name = 'muscle_biceps_right';

    const resolvedTarget = {
      canonicalId: 'biceps' as const,
      descriptor: getMuscleTarget('male-athletic', 'biceps'),
      meshes: [meshLeft, meshRight],
    };

    const bilateralMeshes = resolver.filterBySide(resolvedTarget, 'bilateral');
    assert.strictEqual(bilateralMeshes.length, 2, 'Bilateral includes both sides');

    const leftOnly = resolver.filterBySide(resolvedTarget, 'left');
    assert.strictEqual(leftOnly.length, 1);
    assert.strictEqual(leftOnly[0].name, 'muscle_biceps_left');

    const rightOnly = resolver.filterBySide(resolvedTarget, 'right');
    assert.strictEqual(rightOnly.length, 1);
    assert.strictEqual(rightOnly[0].name, 'muscle_biceps_right');
  });

  // Test 5: Form Cue Schema Validation with Zod
  it('validates declarative form cue schemas and rejects invalid definitions', () => {
    const validCue = {
      id: 'squat-knee-angle',
      type: 'joint-angle',
      label: 'Knee Flexion (Target ~90° at depth)',
      phases: ['phase:descent', 'rep:bottom'],
      anchor: 'leftLowerLeg',
      target: 'leftUpperLeg',
      secondaryAnchor: 'leftFoot',
      targetAngle: 90,
      tolerance: 15,
      visualRadius: 0.18,
    };

    const parsed = FormCueDefinitionSchema.safeParse(validCue);
    assert.ok(parsed.success, 'Valid cue parses successfully');

    const invalidType = {
      ...validCue,
      type: 'unsupported-geometry',
    };
    const invalidParsed = FormCueDefinitionSchema.safeParse(invalidType);
    assert.strictEqual(invalidParsed.success, false, 'Rejects unsupported cue type');

    const invalidAngle = {
      ...validCue,
      targetAngle: 720,
    };
    const invalidAngleParsed = FormCueDefinitionSchema.safeParse(invalidAngle);
    assert.strictEqual(invalidAngleParsed.success, false, 'Rejects angle out of range');
  });

  // Test 6: Phase-Aware Form Cue Activation
  it('correctly activates form cues only during designated movement phases', () => {
    const controller = new FormCueController();

    const descentBottomCue = {
      id: 'cue-1',
      type: 'joint-angle' as const,
      label: 'Test Angle',
      phases: ['phase:descent', 'rep:bottom'],
      anchor: 'leftLowerLeg',
    };

    const allPhasesCue = {
      id: 'cue-2',
      type: 'path' as const,
      label: 'Bar Path',
      phases: ['all'],
      anchor: 'equipment:barbell:Center',
    };

    // In descent phase:
    assert.strictEqual(controller.isCueActiveInPhase(descentBottomCue, 'phase:descent'), true);
    assert.strictEqual(controller.isCueActiveInPhase(descentBottomCue, 'rep:bottom'), true);
    assert.strictEqual(controller.isCueActiveInPhase(descentBottomCue, 'rep:top'), false);

    // In 'all' phase cue:
    assert.strictEqual(controller.isCueActiveInPhase(allPhasesCue, 'phase:descent'), true);
    assert.strictEqual(controller.isCueActiveInPhase(allPhasesCue, 'rep:top'), true);

    controller.dispose();
  });

  // Test 7: Biomechanical Joint Angle Computation
  it('accurately computes 3-point joint angles from 3D coordinates', () => {
    const renderer = new JointGuideRenderer();

    // 90 degree perpendicular test
    const posVertex = new THREE.Vector3(0, 0, 0); // B
    const posA = new THREE.Vector3(0, 1, 0);      // B -> A is UP
    const posC = new THREE.Vector3(1, 0, 0);      // B -> C is RIGHT
    const angle90 = renderer.calculateJointAngle(posA, posVertex, posC);
    assert.ok(Math.abs(angle90 - 90) < 0.001, `Expected 90 deg, got ${angle90}`);

    // 180 degree collinear test (full extension)
    const posD = new THREE.Vector3(0, -1, 0);     // B -> D is DOWN
    const angle180 = renderer.calculateJointAngle(posA, posVertex, posD);
    assert.ok(Math.abs(angle180 - 180) < 0.001, `Expected 180 deg, got ${angle180}`);

    // Update joint visual creates arc mesh and lines
    const cue = {
      id: 'test-knee',
      type: 'joint-angle' as const,
      label: 'Test Knee Flexion',
      phases: ['all'],
      anchor: 'leftLowerLeg',
      targetAngle: 90,
      tolerance: 10,
    };
    const res = renderer.updateJointVisual(cue, posA, posVertex, posC, true);
    assert.ok(Math.abs(res.degrees - 90) < 0.001);
    assert.strictEqual(renderer.getGroup().children.length, 2, 'Arc line and ray guides created');

    renderer.dispose();
  });

  // Test 8: Equipment & Body Movement Path Tracking
  it('records live movement trajectories and constructs path visualizations', () => {
    const renderer = new PathRenderer();
    const cue = {
      id: 'barbell-path',
      type: 'equipment-path' as const,
      label: 'Barbell Path',
      phases: ['all'],
      anchor: 'equipment:barbell:Center',
    };

    // Record sequential movement points
    renderer.updatePathVisual(cue, new THREE.Vector3(0, 1.0, 0), true);
    renderer.updatePathVisual(cue, new THREE.Vector3(0, 0.9, 0), true);
    renderer.updatePathVisual(cue, new THREE.Vector3(0, 0.8, 0), true);

    const group = renderer.getGroup();
    assert.ok(group.children.length > 0, 'Trajectory path and marker spheres added to group');

    renderer.dispose();
    assert.strictEqual(renderer.getGroup().children.length, 0, 'Disposed renderer cleans all meshes');
  });

  // Test 9: Alignment Lines and Floor Contact Points
  it('renders alignment lines and planar contact discs at surface level', () => {
    const renderer = new AlignmentRenderer();

    const lineCue = {
      id: 'spine-align',
      type: 'alignment-line' as const,
      label: 'Spine Alignment',
      phases: ['all'],
      anchor: 'spine',
    };
    renderer.updateAlignmentLine(lineCue, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), true);

    const contactCue = {
      id: 'foot-contact',
      type: 'contact-point' as const,
      label: 'Foot Contact',
      phases: ['all'],
      anchor: 'leftFoot',
    };
    renderer.updateContactPoint(contactCue, new THREE.Vector3(0.2, 0, 0), true);

    assert.strictEqual(renderer.getGroup().children.length, 2, 'Alignment line and contact disc created');
    renderer.dispose();
    assert.strictEqual(renderer.getGroup().children.length, 0);
  });

  // Test 10: Form Overlay Master Renderer Clean Disposal
  it('disposes sub-renderers and geometries cleanly without memory leaks', () => {
    const overlay = new FormOverlayRenderer();
    const root = overlay.getRoot();
    assert.ok(root instanceof THREE.Group);
    assert.strictEqual(root.children.length, 4, 'Root contains jointGuides, paths, alignments, angles');

    overlay.setVisible(true);
    assert.strictEqual(overlay.getIsVisible(), true);

    overlay.dispose();
    assert.strictEqual(root.children[0].children.length, 0);
    assert.strictEqual(root.children[1].children.length, 0);
    assert.strictEqual(root.children[2].children.length, 0);
  });

  // Test 11: All 5 Production Exercises Have Manifest-Driven Muscles and Form Cues
  it('confirms all 5 production exercises provide declarative muscles and form cues', () => {
    const exercises = [
      'jumping-jack',
      'bodyweight-squat',
      'push-up',
      'dumbbell-curl',
      'bench-press',
    ];

    for (const exId of exercises) {
      const def = getExerciseDefinition(exId);
      assert.ok(def, `Exercise ${exId} must exist in registry`);

      // Primary and secondary muscles
      assert.ok(def.muscles.primary.length > 0, `${exId} must have primary muscles`);
      assert.ok(Array.isArray(def.muscles.secondary), `${exId} must have secondary muscles array`);

      // Declarative form cues
      assert.ok(def.form, `${exId} must have form metadata`);
      assert.ok(def.form.cues.length > 0, `${exId} must declare at least 1 form cue`);

      for (const cue of def.form.cues) {
        assert.ok(cue.id, `Cue in ${exId} must have id`);
        assert.ok(cue.label, `Cue ${cue.id} must have label`);
        assert.ok(cue.anchor, `Cue ${cue.id} must have anchor`);
        assert.ok(Array.isArray(cue.phases), `Cue ${cue.id} must define phases`);
      }
    }
  });

  // Test 12: Zero-Coupling Asset Replacement Contract
  it('confirms exercise definitions are 100% decoupled from asset mesh/material names', () => {
    for (const def of Object.values(EXERCISE_REGISTRY)) {
      if (!def.form) continue;
      for (const cue of def.form.cues) {
        // Form cues must NEVER reference temporary mesh names directly
        assert.ok(
          !cue.anchor.includes('.vrm') && !cue.anchor.includes('.glb'),
          `Cue anchor '${cue.anchor}' must not depend on 3D asset filenames`
        );
      }
    }
  });
});
