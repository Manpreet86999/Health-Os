import * as THREE from 'three';
import type { CameraPreset } from '../core/types.js';
import { getCameraConfiguration, type CameraConfiguration } from './CameraPresets.js';

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private currentTarget: THREE.Vector3 = new THREE.Vector3(0, 0.95, 0);
  private desiredPosition: THREE.Vector3 = new THREE.Vector3();
  private desiredTarget: THREE.Vector3 = new THREE.Vector3();
  private isTransitioning = false;
  private transitionAlpha = 0;
  private transitionSpeed = 4.5; // Lerp rate per second

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.setPreset('three-quarter-front', false);
  }

  setPreset(preset: CameraPreset, animate = true): void {
    const config = getCameraConfiguration(preset);
    this.desiredPosition.copy(config.position);
    this.desiredTarget.copy(config.target);
    this.camera.fov = config.fov;
    this.camera.updateProjectionMatrix();

    if (!animate) {
      this.camera.position.copy(this.desiredPosition);
      this.currentTarget.copy(this.desiredTarget);
      this.camera.lookAt(this.currentTarget);
      this.isTransitioning = false;
    } else {
      this.isTransitioning = true;
      this.transitionAlpha = 0;
    }
  }

  update(delta: number): void {
    if (!this.isTransitioning) return;

    const step = Math.min(1, delta * this.transitionSpeed);
    this.camera.position.lerp(this.desiredPosition, step);
    this.currentTarget.lerp(this.desiredTarget, step);
    this.camera.lookAt(this.currentTarget);

    if (
      this.camera.position.distanceTo(this.desiredPosition) < 0.005 &&
      this.currentTarget.distanceTo(this.desiredTarget) < 0.005
    ) {
      this.camera.position.copy(this.desiredPosition);
      this.currentTarget.copy(this.desiredTarget);
      this.camera.lookAt(this.currentTarget);
      this.isTransitioning = false;
    }
  }

  getTarget(): THREE.Vector3 {
    return this.currentTarget;
  }
}
