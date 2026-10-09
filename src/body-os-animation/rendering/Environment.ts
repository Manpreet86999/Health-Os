import * as THREE from 'three';

export class Environment {
  private group: THREE.Group = new THREE.Group();
  private shadowPlane: THREE.Mesh;
  private groundGrid: THREE.GridHelper;

  constructor() {
    this.group.name = 'environment';

    // 1. Soft Contact Shadow Plane
    const shadowGeo = new THREE.PlaneGeometry(6, 6);
    const shadowMat = new THREE.ShadowMaterial({
      opacity: 0.25,
    });
    this.shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadowPlane.rotation.x = -Math.PI / 2;
    this.shadowPlane.position.y = 0.001;
    this.shadowPlane.receiveShadow = true;
    this.group.add(this.shadowPlane);

    // 2. Subtle Ground Radial Disc
    const discGeo = new THREE.RingGeometry(0.01, 1.4, 32);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x0066ff,
      transparent: true,
      opacity: 0.07,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.002;
    this.group.add(disc);

    // 3. Ground Grid for dev/alignment
    this.groundGrid = new THREE.GridHelper(4, 20, 0x0066ff, 0x27272a);
    this.groundGrid.position.y = 0;
    (this.groundGrid.material as THREE.Material).transparent = true;
    (this.groundGrid.material as THREE.Material).opacity = 0.2;
    this.group.add(this.groundGrid);
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  setGridVisible(visible: boolean): void {
    this.groundGrid.visible = visible;
  }

  dispose(): void {
    this.shadowPlane.geometry.dispose();
    (this.shadowPlane.material as THREE.Material).dispose();
  }
}
