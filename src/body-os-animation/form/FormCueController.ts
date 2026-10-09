/**
 * Health OS Form Cue Controller
 * Coordinates data-driven form visualization cues, phase filtering,
 * skeleton anchor tracking, and overlay rendering.
 */

import * as THREE from 'three';
import type { FormCueDefinition, HumanoidBoneName } from '../core/types.js';
import { FormOverlayRenderer } from './FormOverlayRenderer.js';
import type { CharacterController } from '../character/CharacterController.js';
import type { EquipmentController } from '../equipment/EquipmentController.js';

export interface FormCategoryToggles {
  jointGuides: boolean;
  paths: boolean;
  alignments: boolean;
  contactPoints: boolean;
}

export class FormCueController {
  private overlayRenderer: FormOverlayRenderer;
  private activeCues: FormCueDefinition[] = [];
  private currentPhase: string = 'phase:descent';
  private isVisible: boolean = false;

  private categoryToggles: FormCategoryToggles = {
    jointGuides: true,
    paths: true,
    alignments: true,
    contactPoints: true,
  };

  // Reusable vectors to eliminate GC in update loop
  private tempPosA = new THREE.Vector3();
  private tempPosB = new THREE.Vector3();
  private tempPosC = new THREE.Vector3();

  constructor() {
    this.overlayRenderer = new FormOverlayRenderer();
  }

  getOverlayRenderer(): FormOverlayRenderer {
    return this.overlayRenderer;
  }

  getOverlayGroup(): THREE.Group {
    return this.overlayRenderer.getRoot();
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible;
    this.overlayRenderer.setVisible(visible);
  }

  getIsVisible(): boolean {
    return this.isVisible;
  }

  setExerciseCues(cues: FormCueDefinition[]): void {
    this.activeCues = cues;
    this.overlayRenderer.clear();
  }

  setCurrentPhase(phaseName: string): void {
    this.currentPhase = phaseName;
  }

  getCurrentPhase(): string {
    return this.currentPhase;
  }

  setCategoryToggle(category: keyof FormCategoryToggles, enabled: boolean): void {
    this.categoryToggles[category] = enabled;
  }

  getCategoryToggles(): FormCategoryToggles {
    return { ...this.categoryToggles };
  }

  /**
   * Evaluates if a cue should be visually active during the current phase.
   */
  isCueActiveInPhase(cue: FormCueDefinition, phase: string): boolean {
    if (!cue.phases || cue.phases.length === 0 || cue.phases.includes('all')) {
      return true;
    }
    return cue.phases.includes(phase);
  }

  /**
   * Per-frame update loop.
   * If form mode is inactive, returns immediately with 0 performance overhead.
   */
  update(character: CharacterController, equipment: EquipmentController): void {
    if (!this.isVisible || this.activeCues.length === 0) {
      return;
    }

    for (const cue of this.activeCues) {
      const isPhaseActive = this.isCueActiveInPhase(cue, this.currentPhase);

      switch (cue.type) {
        case 'joint-angle': {
          const isCategoryActive = this.categoryToggles.jointGuides && isPhaseActive;
          const posVertex = this.resolveAnchorPosition(cue.anchor, character, equipment, this.tempPosB);
          const posArm1 = cue.target ? this.resolveAnchorPosition(cue.target, character, equipment, this.tempPosA) : null;
          const posArm2 = cue.secondaryAnchor
            ? this.resolveAnchorPosition(cue.secondaryAnchor, character, equipment, this.tempPosC)
            : null;

          if (posVertex && posArm1 && posArm2) {
            this.overlayRenderer.jointGuides.updateJointVisual(
              cue,
              posArm1,
              posVertex,
              posArm2,
              isCategoryActive
            );
          }
          break;
        }

        case 'path':
        case 'equipment-path': {
          const isCategoryActive = this.categoryToggles.paths;
          const pos = this.resolveAnchorPosition(cue.anchor, character, equipment, this.tempPosA);
          if (pos || cue.pathPoints) {
            this.overlayRenderer.paths.updatePathVisual(cue, pos || undefined, isCategoryActive);
          }
          break;
        }

        case 'alignment-line':
        case 'body-axis': {
          const isCategoryActive = this.categoryToggles.alignments && isPhaseActive;
          const start = this.resolveAnchorPosition(cue.anchor, character, equipment, this.tempPosA);
          const end = cue.target ? this.resolveAnchorPosition(cue.target, character, equipment, this.tempPosB) : null;

          if (start && end) {
            this.overlayRenderer.alignments.updateAlignmentLine(cue, start, end, isCategoryActive);
          }
          break;
        }

        case 'contact-point': {
          const isCategoryActive = this.categoryToggles.contactPoints && isPhaseActive;
          const pos = this.resolveAnchorPosition(cue.anchor, character, equipment, this.tempPosA);
          if (pos) {
            // Project to floor contact plane (y = 0 or actual contact height)
            const contactPos = new THREE.Vector3(pos.x, 0.002, pos.z);
            this.overlayRenderer.alignments.updateContactPoint(cue, contactPos, isCategoryActive);
          }
          break;
        }

        default:
          break;
      }
    }
  }

  /**
   * Resolves canonical anchor identifiers to 3D world space coordinates.
   */
  resolveAnchorPosition(
    anchor: HumanoidBoneName | 'floor' | string | [number, number, number],
    character: CharacterController,
    equipment: EquipmentController,
    outVec: THREE.Vector3
  ): THREE.Vector3 | null {
    // 1. Literal tuple coordinates
    if (Array.isArray(anchor) && anchor.length === 3) {
      return outVec.set(anchor[0], anchor[1], anchor[2]);
    }

    if (typeof anchor !== 'string') return null;

    // 2. Equipment anchors (e.g. "equipment:barbell:Center" or "equipment:dumbbell_L:Grip_C")
    if (anchor.startsWith('equipment:')) {
      const parts = anchor.split(':');
      const equipId = parts[1];
      const records = equipment.getAttachedRecords();
      for (const rec of records) {
        if (rec.attachment.id.toLowerCase().includes(equipId.toLowerCase())) {
          return rec.item.getWorldPosition(outVec);
        }
      }
      return null;
    }

    // 3. Floor anchor
    if (anchor === 'floor') {
      const rootPos = character.getRoot().getWorldPosition(outVec);
      return outVec.set(rootPos.x, 0, rootPos.z);
    }

    // 4. Canonical humanoid bone
    const bone = character.getBone(anchor as HumanoidBoneName);
    if (bone) {
      return bone.getWorldPosition(outVec);
    }

    return null;
  }

  clear(): void {
    this.overlayRenderer.clear();
  }

  dispose(): void {
    this.overlayRenderer.dispose();
    this.activeCues = [];
  }
}
