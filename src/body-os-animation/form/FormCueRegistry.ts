/**
 * Health OS Form Cue Registry
 * Catalog of standard biomechanical form cues and reusable form definitions.
 */

import type { FormCueDefinition } from '../core/types.js';

export const STANDARD_FORM_CUES: Record<string, FormCueDefinition> = {
  // Squat Cues
  'squat-knee-angle': {
    id: 'squat-knee-angle',
    type: 'joint-angle',
    label: 'Knee Flexion (Target ~90° at depth)',
    phases: ['phase:descent', 'rep:bottom', 'phase:ascent'],
    anchor: 'leftLowerLeg', // Joint vertex (knee)
    target: 'leftUpperLeg', // Arm 1 (thigh)
    secondaryAnchor: 'leftFoot', // Arm 2 (shin/foot)
    targetAngle: 90,
    tolerance: 15,
    visualRadius: 0.18,
  },
  'squat-hip-path': {
    id: 'squat-hip-path',
    type: 'path',
    label: 'Hip Vertical Descent & Rise Path',
    phases: ['all'],
    anchor: 'hips',
  },
  'squat-knee-track': {
    id: 'squat-knee-track',
    type: 'alignment-line',
    label: 'Knee Tracking Over Toes',
    phases: ['phase:descent', 'rep:bottom', 'phase:ascent'],
    anchor: 'leftLowerLeg',
    target: 'leftFoot',
  },
  'squat-spine-neutral': {
    id: 'squat-spine-neutral',
    type: 'body-axis',
    label: 'Neutral Spine Torso Alignment',
    phases: ['all'],
    anchor: 'spine',
    target: 'upperChest',
  },

  // Bench Press Cues
  'bench-bar-path': {
    id: 'bench-bar-path',
    type: 'equipment-path',
    label: 'Barbell Vertical Press Path',
    phases: ['all'],
    anchor: 'equipment:barbell:Center',
  },
  'bench-elbow-angle': {
    id: 'bench-elbow-angle',
    type: 'joint-angle',
    label: 'Elbow Press Angle (~90° at chest touch)',
    phases: ['phase:descent', 'rep:bottom', 'phase:ascent'],
    anchor: 'leftLowerArm',
    target: 'leftUpperArm',
    secondaryAnchor: 'leftHand',
    targetAngle: 90,
    tolerance: 15,
    visualRadius: 0.15,
  },
  'bench-bar-level': {
    id: 'bench-bar-level',
    type: 'alignment-line',
    label: 'Barbell Horizontal Level Alignment',
    phases: ['all'],
    anchor: 'leftHand',
    target: 'rightHand',
  },

  // Dumbbell Curl Cues
  'curl-elbow-angle': {
    id: 'curl-elbow-angle',
    type: 'joint-angle',
    label: 'Elbow Flexion Peak (~40° at peak contraction)',
    phases: ['phase:ascent', 'rep:top', 'phase:descent'],
    anchor: 'leftLowerArm',
    target: 'leftUpperArm',
    secondaryAnchor: 'leftHand',
    targetAngle: 40,
    tolerance: 15,
    visualRadius: 0.14,
  },
  'curl-dumbbell-arc': {
    id: 'curl-dumbbell-arc',
    type: 'equipment-path',
    label: 'Dumbbell Coronal Contraction Arc',
    phases: ['all'],
    anchor: 'equipment:dumbbell_L:Grip_C',
  },

  // Push-Up Cues
  'pushup-spine-alignment': {
    id: 'pushup-spine-alignment',
    type: 'alignment-line',
    label: 'Plank Spine Neutral Alignment',
    phases: ['all'],
    anchor: 'head',
    target: 'leftFoot',
  },
  'pushup-elbow-angle': {
    id: 'pushup-elbow-angle',
    type: 'joint-angle',
    label: 'Elbow Depth Angle (~90° at bottom)',
    phases: ['phase:descent', 'rep:bottom', 'phase:ascent'],
    anchor: 'leftLowerArm',
    target: 'leftUpperArm',
    secondaryAnchor: 'leftHand',
    targetAngle: 90,
    tolerance: 15,
    visualRadius: 0.15,
  },
  'pushup-hand-contact': {
    id: 'pushup-hand-contact',
    type: 'contact-point',
    label: 'Floor Hand Plant Base',
    phases: ['all'],
    anchor: 'leftHand',
  },

  // Jumping Jack Cues
  'jumping-jack-arm-arc': {
    id: 'jumping-jack-arm-arc',
    type: 'path',
    label: 'Full Coronal Arm Arc',
    phases: ['all'],
    anchor: 'leftHand',
  },
  'jumping-jack-foot-contact': {
    id: 'jumping-jack-foot-contact',
    type: 'contact-point',
    label: 'Landing Contact Points',
    phases: ['all'],
    anchor: 'leftFoot',
  },
};

export function getFormCue(id: string): FormCueDefinition | undefined {
  return STANDARD_FORM_CUES[id];
}

export function registerFormCue(cue: FormCueDefinition): void {
  STANDARD_FORM_CUES[cue.id] = cue;
}
