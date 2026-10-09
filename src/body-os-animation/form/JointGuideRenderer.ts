/**
 * Health OS Joint Guide Renderer
 * Computes biomechanical joint angles (e.g. knee flexion, elbow angle, hip hinge)
 * from canonical skeleton transforms and renders visual angle arcs and guide lines.
 */

import * as THREE from 'three';
import type { FormCueDefinition } from '../core/types.js';

export interface JointAngleResult {
  cueId: string;
  degrees: number;
  vertexPosition: THREE.Vector3;
  arm1Position: THREE.Vector3;
  arm2Position: THREE.Vector3;
}

export class JointGuideRenderer {
  private group: THREE.Group;
  private arcMeshes: Map<string, THREE.Line> = new Map();
  private guideLines: Map<string, THREE.LineSegments> = new Map();
  private defaultMaterial: THREE.LineBasicMaterial;
  private activeMaterial: THREE.LineBasicMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'FormOverlay_JointGuides';

    this.defaultMaterial = new THREE.LineBasicMaterial({
      color: 0x00d2ff,
      linewidth: 2,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });

    this.activeMaterial = new THREE.LineBasicMaterial({
      color: 0x10b981,
      linewidth: 3,
      depthTest: false,
      transparent: true,
      opacity: 0.95,
    });
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Computes the angle in degrees between vector (A - B) and (C - B) where B is the joint vertex.
   */
  calculateJointAngle(posA: THREE.Vector3, posB: THREE.Vector3, posC: THREE.Vector3): number {
    const v1 = new THREE.Vector3().subVectors(posA, posB).normalize();
    const v2 = new THREE.Vector3().subVectors(posC, posB).normalize();
    const dot = Math.min(1.0, Math.max(-1.0, v1.dot(v2)));
    return (Math.acos(dot) * 180) / Math.PI;
  }

  /**
   * Updates or creates the 3D angle arc visual representation for a given cue.
   */
  updateJointVisual(
    cue: FormCueDefinition,
    posA: THREE.Vector3, // Arm 1 (e.g. upper leg)
    posB: THREE.Vector3, // Vertex (e.g. knee joint)
    posC: THREE.Vector3, // Arm 2 (e.g. foot/ankle)
    visible: boolean
  ): JointAngleResult {
    const degrees = this.calculateJointAngle(posA, posB, posC);

    if (!visible) {
      const arc = this.arcMeshes.get(cue.id);
      if (arc) arc.visible = false;
      const lines = this.guideLines.get(cue.id);
      if (lines) lines.visible = false;
      return { cueId: cue.id, degrees, vertexPosition: posB, arm1Position: posA, arm2Position: posC };
    }

    const radius = cue.visualRadius || 0.15;
    const v1 = new THREE.Vector3().subVectors(posA, posB).normalize();
    const v2 = new THREE.Vector3().subVectors(posC, posB).normalize();

    // Normal to plane of rotation
    const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
    if (normal.lengthSq() < 0.0001) {
      normal.set(0, 0, 1);
    }

    // Generate arc points from v1 toward v2
    const segments = 16;
    const totalAngle = (degrees * Math.PI) / 180;
    const points: THREE.Vector3[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const currentAngle = t * totalAngle;
      const rotated = v1.clone().applyAxisAngle(normal, currentAngle).multiplyScalar(radius);
      points.push(posB.clone().add(rotated));
    }

    // Update or create arc Line
    let arc = this.arcMeshes.get(cue.id);
    if (!arc) {
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      arc = new THREE.Line(geo, this.defaultMaterial);
      arc.renderOrder = 999;
      this.group.add(arc);
      this.arcMeshes.set(cue.id, arc);
    } else {
      arc.geometry.dispose();
      arc.geometry = new THREE.BufferGeometry().setFromPoints(points);
      arc.visible = true;
    }

    // Guide ray lines (B -> A and B -> C)
    const linePoints = [
      posB,
      posB.clone().add(v1.multiplyScalar(radius * 1.6)),
      posB,
      posB.clone().add(v2.multiplyScalar(radius * 1.6)),
    ];

    let lines = this.guideLines.get(cue.id);
    if (!lines) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      lines = new THREE.LineSegments(lineGeo, this.defaultMaterial);
      lines.renderOrder = 999;
      this.group.add(lines);
      this.guideLines.set(cue.id, lines);
    } else {
      lines.geometry.dispose();
      lines.geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      lines.visible = true;
    }

    // Color feedback based on target angle & tolerance
    if (cue.targetAngle !== undefined) {
      const tol = cue.tolerance || 10;
      const diff = Math.abs(degrees - cue.targetAngle);
      const isTargetMet = diff <= tol;
      arc.material = isTargetMet ? this.activeMaterial : this.defaultMaterial;
    }

    return { cueId: cue.id, degrees, vertexPosition: posB, arm1Position: posA, arm2Position: posC };
  }

  clear(): void {
    for (const arc of this.arcMeshes.values()) {
      arc.geometry.dispose();
      this.group.remove(arc);
    }
    for (const lines of this.guideLines.values()) {
      lines.geometry.dispose();
      this.group.remove(lines);
    }
    this.arcMeshes.clear();
    this.guideLines.clear();
  }

  dispose(): void {
    this.clear();
    this.defaultMaterial.dispose();
    this.activeMaterial.dispose();
  }
}
