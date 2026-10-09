/**
 * Health OS Path Renderer
 * Visualizes movement paths, equipment trajectories (barbell path, dumbbell arc)
 * and body center-of-mass/hip travel.
 */

import * as THREE from 'three';
import type { FormCueDefinition } from '../core/types.js';

export class PathRenderer {
  private group: THREE.Group;
  private pathLines: Map<string, THREE.Line> = new Map();
  private markerSpheres: Map<string, THREE.Mesh[]> = new Map();
  private recordedPaths: Map<string, THREE.Vector3[]> = new Map();
  private maxRecordedPoints = 64;

  private pathMaterial: THREE.LineBasicMaterial;
  private markerMaterial: THREE.MeshBasicMaterial;
  private sphereGeometry: THREE.SphereGeometry;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'FormOverlay_Paths';

    this.pathMaterial = new THREE.LineBasicMaterial({
      color: 0x00d2ff,
      linewidth: 3,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    });

    this.markerMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });

    this.sphereGeometry = new THREE.SphereGeometry(0.02, 12, 12);
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Records a live world-space trajectory point for an active anchor.
   */
  recordPoint(cueId: string, currentPos: THREE.Vector3): void {
    if (!this.recordedPaths.has(cueId)) {
      this.recordedPaths.set(cueId, []);
    }
    const points = this.recordedPaths.get(cueId)!;

    // Only record if moved sufficiently (> 5mm)
    if (points.length > 0) {
      const last = points[points.length - 1];
      if (last.distanceToSquared(currentPos) < 0.000025) {
        return;
      }
    }

    points.push(currentPos.clone());
    if (points.length > this.maxRecordedPoints) {
      points.shift();
    }
  }

  /**
   * Renders the trajectory path from precomputed definition or live recorded points.
   */
  updatePathVisual(
    cue: FormCueDefinition,
    currentPos?: THREE.Vector3,
    visible: boolean = true
  ): void {
    if (!visible) {
      const line = this.pathLines.get(cue.id);
      if (line) line.visible = false;
      const markers = this.markerSpheres.get(cue.id);
      if (markers) markers.forEach((m) => (m.visible = false));
      return;
    }

    let points: THREE.Vector3[] = [];

    // 1. Check if declarative pathPoints are provided in cue
    if (cue.pathPoints && cue.pathPoints.length >= 2) {
      points = cue.pathPoints.map((p) => new THREE.Vector3(...p));
    } else if (currentPos) {
      // 2. Otherwise use live recorded points
      this.recordPoint(cue.id, currentPos);
      points = this.recordedPaths.get(cue.id) || [];
    }

    if (points.length < 2) return;

    let line = this.pathLines.get(cue.id);
    if (!line) {
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      line = new THREE.Line(geo, this.pathMaterial);
      line.renderOrder = 998;
      this.group.add(line);
      this.pathLines.set(cue.id, line);
    } else {
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints(points);
      line.visible = true;
    }

    // Update start & end marker spheres
    let markers = this.markerSpheres.get(cue.id);
    if (!markers) {
      const startMarker = new THREE.Mesh(this.sphereGeometry, this.markerMaterial);
      const endMarker = new THREE.Mesh(this.sphereGeometry, this.markerMaterial);
      startMarker.renderOrder = 999;
      endMarker.renderOrder = 999;
      this.group.add(startMarker, endMarker);
      markers = [startMarker, endMarker];
      this.markerSpheres.set(cue.id, markers);
    }

    markers[0].position.copy(points[0]);
    markers[0].visible = true;
    markers[1].position.copy(points[points.length - 1]);
    markers[1].visible = true;
  }

  clearRecorded(cueId?: string): void {
    if (cueId) {
      this.recordedPaths.delete(cueId);
    } else {
      this.recordedPaths.clear();
    }
  }

  clear(): void {
    for (const line of this.pathLines.values()) {
      line.geometry.dispose();
      this.group.remove(line);
    }
    for (const markers of this.markerSpheres.values()) {
      markers.forEach((m) => this.group.remove(m));
    }
    this.pathLines.clear();
    this.markerSpheres.clear();
    this.recordedPaths.clear();
  }

  dispose(): void {
    this.clear();
    this.pathMaterial.dispose();
    this.markerMaterial.dispose();
    this.sphereGeometry.dispose();
  }
}
