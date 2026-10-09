/**
 * Health OS Form Overlay Renderer
 * Master Three.js container and coordinator for form visualizations:
 * - Joint guides and angle arcs
 * - Movement and equipment paths
 * - Alignment lines and contact points
 */

import * as THREE from 'three';
import { JointGuideRenderer } from './JointGuideRenderer.js';
import { PathRenderer } from './PathRenderer.js';
import { AlignmentRenderer } from './AlignmentRenderer.js';
import { AngleRenderer } from './AngleRenderer.js';

export class FormOverlayRenderer {
  private rootGroup: THREE.Group;
  readonly jointGuides: JointGuideRenderer;
  readonly paths: PathRenderer;
  readonly alignments: AlignmentRenderer;
  readonly angles: AngleRenderer;

  constructor() {
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'FormOverlay_Root';
    this.rootGroup.visible = false; // Initially hidden until Form Mode active

    this.jointGuides = new JointGuideRenderer();
    this.paths = new PathRenderer();
    this.alignments = new AlignmentRenderer();
    this.angles = new AngleRenderer();

    this.rootGroup.add(this.jointGuides.getGroup());
    this.rootGroup.add(this.paths.getGroup());
    this.rootGroup.add(this.alignments.getGroup());
    this.rootGroup.add(this.angles.getGroup());
  }

  getRoot(): THREE.Group {
    return this.rootGroup;
  }

  setVisible(visible: boolean): void {
    this.rootGroup.visible = visible;
  }

  getIsVisible(): boolean {
    return this.rootGroup.visible;
  }

  clear(): void {
    this.jointGuides.clear();
    this.paths.clear();
    this.alignments.clear();
    this.angles.clear();
  }

  dispose(): void {
    this.clear();
    this.jointGuides.dispose();
    this.paths.dispose();
    this.alignments.dispose();
    this.angles.dispose();
    if (this.rootGroup.parent) {
      this.rootGroup.parent.remove(this.rootGroup);
    }
  }
}
