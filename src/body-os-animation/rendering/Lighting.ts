import * as THREE from 'three';

export class Lighting {
  private group: THREE.Group = new THREE.Group();

  constructor() {
    this.group.name = 'lighting_rig';
    this.setupLighting();
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  private setupLighting(): void {
    // 1. Ambient Light (soft, even fill)
    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    this.group.add(ambient);

    // 2. Key Light (warm studio white from front-top-right)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(2.5, 4.0, 3.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    this.group.add(keyLight);

    // 3. Fill Light (soft cool neutral from front-left)
    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 1.1);
    fillLight.position.set(-2.5, 2.0, 2.5);
    this.group.add(fillLight);

    // 4. Health OS Signature Rim Light (Electric Blue glow from rear-right)
    const rimLight = new THREE.DirectionalLight(0x0070f3, 1.6);
    rimLight.position.set(1.8, 2.5, -3.0);
    this.group.add(rimLight);

    // 5. Secondary Rim Light (Cyan tint from rear-left)
    const subRim = new THREE.DirectionalLight(0x38bdf8, 0.8);
    subRim.position.set(-1.8, 1.8, -2.5);
    this.group.add(subRim);
  }

  dispose(): void {
    // Clean up
    this.group.traverse((obj) => {
      if ((obj as THREE.Light).isLight) {
        (obj as THREE.Light).dispose?.();
      }
    });
  }
}
