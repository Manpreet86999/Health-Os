/**
 * Health OS Angle Renderer
 * Specialized visualizer for angle arcs, radial sectors, and degree callouts.
 */

import * as THREE from 'three';

export interface AngleRenderOptions {
  radius?: number;
  color?: number | string;
  fillOpacity?: number;
  segments?: number;
}

export class AngleRenderer {
  private group: THREE.Group;
  private angleArcs: Map<string, THREE.Line> = new Map();
  private angleFans: Map<string, THREE.Mesh> = new Map();

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'FormOverlay_AngleArcs';
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Renders an angle sector/arc at origin between vector vA and vB.
   */
  renderAngleArc(
    id: string,
    center: THREE.Vector3,
    vA: THREE.Vector3,
    vB: THREE.Vector3,
    options: AngleRenderOptions = {}
  ): void {
    const radius = options.radius || 0.15;
    const color = options.color || 0x00d2ff;
    const segments = options.segments || 16;

    const dirA = vA.clone().normalize();
    const dirB = vB.clone().normalize();
    const dot = Math.min(1.0, Math.max(-1.0, dirA.dot(dirB)));
    const totalAngle = Math.acos(dot);

    let normal = new THREE.Vector3().crossVectors(dirA, dirB).normalize();
    if (normal.lengthSq() < 0.0001) normal.set(0, 0, 1);

    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const pt = dirA.clone().applyAxisAngle(normal, t * totalAngle).multiplyScalar(radius);
      points.push(center.clone().add(pt));
    }

    let line = this.angleArcs.get(id);
    if (!line) {
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false, transparent: true, opacity: 0.9 });
      line = new THREE.Line(geo, mat);
      line.renderOrder = 999;
      this.group.add(line);
      this.angleArcs.set(id, line);
    } else {
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints(points);
      line.visible = true;
    }
  }

  hide(id: string): void {
    const line = this.angleArcs.get(id);
    if (line) line.visible = false;
    const fan = this.angleFans.get(id);
    if (fan) fan.visible = false;
  }

  clear(): void {
    for (const line of this.angleArcs.values()) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
      this.group.remove(line);
    }
    for (const fan of this.angleFans.values()) {
      fan.geometry.dispose();
      (fan.material as THREE.Material).dispose();
      this.group.remove(fan);
    }
    this.angleArcs.clear();
    this.angleFans.clear();
  }

  dispose(): void {
    this.clear();
  }
}
