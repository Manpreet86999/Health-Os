import * as THREE from 'three';

/**
 * Health OS Muscle Highlighting Materials
 * Styled to match the Health OS signature electric-blue aesthetic.
 */

export interface MuscleMaterialSet {
  primary: THREE.MeshStandardMaterial;
  secondary: THREE.MeshStandardMaterial;
  inactive: THREE.MeshBasicMaterial;
}

export function createMuscleMaterials(): MuscleMaterialSet {
  const primary = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0066FF'),
    emissive: new THREE.Color('#00D2FF'),
    emissiveIntensity: 0.85,
    roughness: 0.25,
    metalness: 0.1,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const secondary = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0284C7'),
    emissive: new THREE.Color('#38BDF8'),
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.05,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const inactive = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    visible: false,
  });

  return { primary, secondary, inactive };
}
