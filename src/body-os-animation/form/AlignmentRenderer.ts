/**
 * Health OS Alignment Renderer
 * Visualizes biomechanical alignment references (spine neutral axis, knee-over-foot tracking,
 * bar horizontal alignment) and contact points (floor, bench).
 */

import * as THREE from 'three';
import type { FormCueDefinition } from '../core/types.js';

export class AlignmentRenderer {
  private group: THREE.Group;
  private lines: Map<string, THREE.Line> = new Map();
  private contactDiscs: Map<string, THREE.Mesh> = new Map();

  private lineMaterial: THREE.LineBasicMaterial;
  private contactMaterial: THREE.MeshBasicMaterial;
  private discGeometry: THREE.RingGeometry;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'FormOverlay_Alignments';

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    });

    this.contactMaterial = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
    });

    this.discGeometry = new THREE.RingGeometry(0.04, 0.08, 16);
    this.discGeometry.rotateX(-Math.PI / 2); // Lay flat on floor
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Renders an alignment line between two 3D points (e.g. knee over foot, spine axis, barbell level).
   */
  updateAlignmentLine(
    cue: FormCueDefinition,
    start: THREE.Vector3,
    end: THREE.Vector3,
    visible: boolean = true
  ): void {
    if (!visible) {
      const line = this.lines.get(cue.id);
      if (line) line.visible = false;
      return;
    }

    const points = [start, end];
    let line = this.lines.get(cue.id);
    if (!line) {
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      line = new THREE.Line(geo, this.lineMaterial);
      line.renderOrder = 998;
      this.group.add(line);
      this.lines.set(cue.id, line);
    } else {
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints(points);
      line.visible = true;
    }
  }

  /**
   * Renders a contact point disc on the ground/surface at a contact position.
   */
  updateContactPoint(
    cue: FormCueDefinition,
    position: THREE.Vector3,
    visible: boolean = true
  ): void {
    if (!visible) {
      const disc = this.contactDiscs.get(cue.id);
      if (disc) disc.visible = false;
      return;
    }

    let disc = this.contactDiscs.get(cue.id);
    if (!disc) {
      disc = new THREE.Mesh(this.discGeometry, this.contactMaterial);
      disc.renderOrder = 997;
      this.group.add(disc);
      this.contactDiscs.set(cue.id, disc);
    }

    disc.position.copy(position);
    disc.visible = true;
  }

  clear(): void {
    for (const line of this.lines.values()) {
      line.geometry.dispose();
      this.group.remove(line);
    }
    for (const disc of this.contactDiscs.values()) {
      this.group.remove(disc);
    }
    this.lines.clear();
    this.contactDiscs.clear();
  }

  dispose(): void {
    this.clear();
    this.lineMaterial.dispose();
    this.contactMaterial.dispose();
    this.discGeometry.dispose();
  }
}
