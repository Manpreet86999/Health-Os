/**
 * Health OS Muscle Material Controller
 * Manages GPU materials and visual hierarchy for Primary, Secondary, and Inactive muscle states.
 */

import * as THREE from 'three';

export interface MuscleMaterials {
  primary: THREE.Material;
  secondary: THREE.Material;
  inactive: THREE.Material;
}

export class MuscleMaterialController {
  private materials: MuscleMaterials;

  constructor() {
    this.materials = this.createMaterials();
  }

  getMaterials(): MuscleMaterials {
    return this.materials;
  }

  getPrimaryMaterial(): THREE.Material {
    return this.materials.primary;
  }

  getSecondaryMaterial(): THREE.Material {
    return this.materials.secondary;
  }

  getInactiveMaterial(): THREE.Material {
    return this.materials.inactive;
  }

  private createMaterials(): MuscleMaterials {
    // Primary: High-contrast electric-blue with emissive neon rim
    const primary = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#0066FF'),
      emissive: new THREE.Color('#00D2FF'),
      emissiveIntensity: 0.85,
      roughness: 0.20,
      metalness: 0.15,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Secondary: Sky-blue accent with softer glow
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

    // Inactive: Completely non-rendering
    const inactive = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      visible: false,
    });

    return { primary, secondary, inactive };
  }

  dispose(): void {
    this.materials.primary.dispose();
    this.materials.secondary.dispose();
    this.materials.inactive.dispose();
  }
}
