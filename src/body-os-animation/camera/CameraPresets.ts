import * as THREE from 'three';
import type { CameraPreset } from '../core/types.js';

export interface CameraConfiguration {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export const CAMERA_CONFIGURATIONS: Record<CameraPreset, CameraConfiguration> = {
  'front': {
    position: new THREE.Vector3(0, 1.05, 4.3),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'back': {
    position: new THREE.Vector3(0, 1.05, -4.3),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'side': {
    position: new THREE.Vector3(4.2, 1.05, 0),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'side-left': {
    position: new THREE.Vector3(-4.2, 1.05, 0),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'side-right': {
    position: new THREE.Vector3(4.2, 1.05, 0),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'three-quarter': {
    position: new THREE.Vector3(2.6, 1.20, 3.4),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'three-quarter-front': {
    position: new THREE.Vector3(2.6, 1.20, 3.4),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'three-quarter-front-left': {
    position: new THREE.Vector3(-2.6, 1.20, 3.4),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'three-quarter-front-right': {
    position: new THREE.Vector3(2.6, 1.20, 3.4),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'three-quarter-back': {
    position: new THREE.Vector3(2.6, 1.20, -3.4),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'three-quarter-back-left': {
    position: new THREE.Vector3(-2.6, 1.20, -3.4),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'three-quarter-back-right': {
    position: new THREE.Vector3(2.6, 1.20, -3.4),
    target: new THREE.Vector3(0, 0.95, 0),
    fov: 38,
  },
  'horizontal-floor': {
    position: new THREE.Vector3(2.5, 0.85, 2.2),
    target: new THREE.Vector3(0, 0.22, 0),
    fov: 42,
  },
};

export function getCameraConfiguration(preset: CameraPreset): CameraConfiguration {
  return CAMERA_CONFIGURATIONS[preset] || CAMERA_CONFIGURATIONS['three-quarter-front'];
}
