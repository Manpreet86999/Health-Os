import * as THREE from 'three';
import type { EquipmentAttachmentPoint, HumanoidBoneName } from '../core/types.js';
import { resolveEquipmentAnchor } from './ProductionAnchors.js';

export interface CharacterSkeletonProvider {
  getBone(boneName: HumanoidBoneName): THREE.Object3D | null;
  getRoot(): THREE.Object3D;
}

/**
 * Constraint mode for equipment attachment.
 * - 'parent': Traditional parenting — item becomes a child of a bone node.
 * - 'two-hand': Item is positioned at the midpoint between two bone targets
 *   and oriented along the bone-to-bone axis. Updated every frame.
 * - 'world-static': Item is placed in world space at a fixed position (e.g. bench on floor).
 */
export type AttachmentConstraintMode = 'parent' | 'two-hand' | 'world-static' | 'equipment-mounted';

export interface AttachmentRecord {
  item: THREE.Object3D;
  constraintMode: AttachmentConstraintMode;
  attachment: EquipmentAttachmentPoint;
  /** For 'parent' mode */
  parentBone?: THREE.Object3D;
  /** For 'two-hand' mode */
  twoHandConfig?: {
    boneA: THREE.Object3D;
    boneB: THREE.Object3D;
    /** Offset from the computed midpoint (local space) */
    centerOffset: THREE.Vector3;
    /** Additional rotation applied after axis alignment */
    rotationOffset: THREE.Euler;
    /** Whether the bar runs along X axis (true) or Z axis (false) */
    barAxisX: boolean;
  };
  /** For 'world-static' mode */
  worldPosition?: THREE.Vector3;
  worldRotation?: THREE.Euler;
}

export class AttachmentSystem {
  private attachedRecords: AttachmentRecord[] = [];
  private sceneRoot: THREE.Object3D | null = null;

  setSceneRoot(root: THREE.Object3D): void {
    this.sceneRoot = root;
  }

  /**
   * Standard single-bone parenting attachment.
   *
   * Stage 4: when `options.anchorBodyosId` is provided and the item carries
   * a matching production metadata anchor, the item is shifted so the anchor
   * coincides with the bone origin (anchor-compensated parenting). When the
   * anchor is absent (procedural fallback models), plain legacy parenting
   * with the attachment offset is used.
   */
  attach(
    item: THREE.Object3D,
    attachment: EquipmentAttachmentPoint,
    character: CharacterSkeletonProvider,
    options?: { anchorBodyosId?: string }
  ): boolean {
    let parentBone: THREE.Object3D | null = null;

    if (attachment.attachToBone === 'floor' || attachment.attachToBone === 'root') {
      parentBone = character.getRoot();
    } else {
      parentBone = character.getBone(attachment.attachToBone);
    }

    if (!parentBone) {
      console.warn(`[AttachmentSystem] Target bone "${attachment.attachToBone}" not found on character.`);
      return false;
    }

    // Reset transform relative to parent
    item.position.set(0, 0, 0);
    item.rotation.set(0, 0, 0);
    item.scale.set(1, 1, 1);

    if (attachment.offset) {
      if (attachment.offset.position) {
        item.position.fromArray(attachment.offset.position);
      }
      if (attachment.offset.rotation) {
        item.rotation.set(
          attachment.offset.rotation[0],
          attachment.offset.rotation[1],
          attachment.offset.rotation[2]
        );
      }
      if (attachment.offset.scale) {
        item.scale.fromArray(attachment.offset.scale);
      }
    }

    parentBone.add(item);

    if (options?.anchorBodyosId) {
      const anchor = resolveEquipmentAnchor(item, { bodyosId: options.anchorBodyosId });
      if (anchor) {
        // Align the production anchor to the bone origin, then apply the
        // attachment offset on top of the compensated transform.
        parentBone.updateWorldMatrix(true, false);
        item.updateMatrixWorld(true);
        const anchorWorld = new THREE.Vector3();
        anchor.getWorldPosition(anchorWorld);
        const anchorInBone = parentBone.worldToLocal(anchorWorld.clone());
        item.position.sub(anchorInBone);
      }
    }

    this.attachedRecords.push({
      item,
      constraintMode: 'parent',
      attachment,
      parentBone,
    });
    return true;
  }

  /**
   * Two-hand constraint: the equipment is positioned at the midpoint between
   * two hand bones and oriented so its long axis aligns with the hand-to-hand vector.
   * This solves the barbell problem where a single-hand attachment causes the bar to
   * pivot incorrectly.
   */
  attachTwoHand(
    item: THREE.Object3D,
    attachment: EquipmentAttachmentPoint,
    character: CharacterSkeletonProvider,
    boneAName: HumanoidBoneName,
    boneBName: HumanoidBoneName,
    options?: {
      centerOffset?: [number, number, number];
      rotationOffset?: [number, number, number];
      barAxisX?: boolean;
    }
  ): boolean {
    const boneA = character.getBone(boneAName);
    const boneB = character.getBone(boneBName);

    if (!boneA || !boneB) {
      console.warn(
        `[AttachmentSystem] Two-hand constraint failed: ` +
        `boneA="${boneAName}" (${boneA ? 'found' : 'MISSING'}), ` +
        `boneB="${boneBName}" (${boneB ? 'found' : 'MISSING'})`
      );
      return false;
    }

    // Place item in the scene root (not as a child of any bone)
    const root = this.sceneRoot || character.getRoot();
    root.add(item);

    item.position.set(0, 0, 0);
    item.rotation.set(0, 0, 0);
    item.scale.set(1, 1, 1);

    if (attachment.offset?.scale) {
      item.scale.fromArray(attachment.offset.scale);
    }

    const centerOffset = new THREE.Vector3();
    if (options?.centerOffset) {
      centerOffset.fromArray(options.centerOffset);
    } else if (attachment.offset?.position) {
      centerOffset.fromArray(attachment.offset.position);
    }

    const rotationOffset = new THREE.Euler();
    if (options?.rotationOffset) {
      rotationOffset.set(options.rotationOffset[0], options.rotationOffset[1], options.rotationOffset[2]);
    } else if (attachment.offset?.rotation) {
      rotationOffset.set(attachment.offset.rotation[0], attachment.offset.rotation[1], attachment.offset.rotation[2]);
    }

    this.attachedRecords.push({
      item,
      constraintMode: 'two-hand',
      attachment,
      twoHandConfig: {
        boneA,
        boneB,
        centerOffset,
        rotationOffset,
        barAxisX: options?.barAxisX ?? true,
      },
    });

    // Perform initial update
    this.updateTwoHandRecord(this.attachedRecords[this.attachedRecords.length - 1]);

    return true;
  }

  /**
   * Stage 5: mounts an item onto a sibling equipment instance (e.g. weight
   * plates onto barbell sleeves). The item is positioned at the host's
   * production metadata anchor (or host origin as fallback) and parented to
   * the host, so it follows the host with zero per-frame cost. Anchor and
   * plate geometry share the barbell's local X axis, so identity rotation
   * keeps plates coaxial with the bar.
   */
  attachToEquipment(
    item: THREE.Object3D,
    attachment: EquipmentAttachmentPoint,
    host: THREE.Object3D,
    anchorBodyosId?: string
  ): boolean {
    item.position.set(0, 0, 0);
    item.rotation.set(0, 0, 0);
    item.scale.set(1, 1, 1);

    if (anchorBodyosId) {
      const anchor = resolveEquipmentAnchor(host, { bodyosId: anchorBodyosId });
      if (anchor) {
        item.position.copy(anchor.position);
      }
    }

    if (attachment.offset) {
      if (attachment.offset.position) {
        item.position.add(new THREE.Vector3().fromArray(attachment.offset.position));
      }
      if (attachment.offset.rotation) {
        item.rotation.set(
          attachment.offset.rotation[0],
          attachment.offset.rotation[1],
          attachment.offset.rotation[2]
        );
      }
      if (attachment.offset.scale) {
        item.scale.fromArray(attachment.offset.scale);
      }
    }

    host.add(item);
    this.attachedRecords.push({
      item,
      constraintMode: 'equipment-mounted',
      attachment,
    });
    return true;
  }

  /**
   * World-static attachment: places item at a fixed world-space position.
   * Used for floor-placed equipment like benches.
   */
  attachWorldStatic(
    item: THREE.Object3D,
    attachment: EquipmentAttachmentPoint,
    character: CharacterSkeletonProvider,
    worldPos?: [number, number, number],
    worldRot?: [number, number, number]
  ): boolean {
    const root = this.sceneRoot || character.getRoot();
    root.add(item);

    const pos = worldPos || attachment.offset?.position || [0, 0, 0];
    const rot = worldRot || attachment.offset?.rotation || [0, 0, 0];

    item.position.fromArray(pos);
    item.rotation.set(rot[0], rot[1], rot[2]);
    item.scale.set(1, 1, 1);

    if (attachment.offset?.scale) {
      item.scale.fromArray(attachment.offset.scale);
    }

    this.attachedRecords.push({
      item,
      constraintMode: 'world-static',
      attachment,
      worldPosition: new THREE.Vector3().fromArray(pos),
      worldRotation: new THREE.Euler(rot[0], rot[1], rot[2]),
    });

    return true;
  }

  /**
   * Called every frame to update all constrained items.
   * Only 'two-hand' records need per-frame computation;
   * 'parent' and 'world-static' are handled by Three.js scene graph.
   */
  update(): void {
    for (const record of this.attachedRecords) {
      if (record.constraintMode === 'two-hand') {
        this.updateTwoHandRecord(record);
      }
    }
  }

  private _posA = new THREE.Vector3();
  private _posB = new THREE.Vector3();
  private _mid = new THREE.Vector3();
  private _axis = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _mat = new THREE.Matrix4();

  /**
   * Computes the midpoint between two world-space bone positions,
   * then orients the equipment so its local X axis (barbell long axis) aligns
   * with the bone-to-bone vector.
   */
  private updateTwoHandRecord(record: AttachmentRecord): void {
    if (!record.twoHandConfig) return;

    const { boneA, boneB, centerOffset, rotationOffset, barAxisX } = record.twoHandConfig;

    // Ensure world matrices are fresh after kinematics update
    boneA.updateWorldMatrix(true, false);
    boneB.updateWorldMatrix(true, false);

    // Get world positions of both hand bones
    boneA.getWorldPosition(this._posA);
    boneB.getWorldPosition(this._posB);

    // Midpoint
    this._mid.lerpVectors(this._posA, this._posB, 0.5);

    // Add center offset
    this._mid.add(centerOffset);

    // Compute the direction axis from boneA to boneB
    this._axis.subVectors(this._posB, this._posA).normalize();

    // Build rotation that aligns the local axis to the bone-to-bone vector
    const refAxis = barAxisX
      ? new THREE.Vector3(1, 0, 0) // Barbell runs along local X
      : new THREE.Vector3(0, 0, 1); // Alternative: along local Z

    this._quat.setFromUnitVectors(refAxis, this._axis);

    // Apply
    record.item.position.copy(this._mid);
    record.item.quaternion.copy(this._quat);

    // Apply additional rotation offset
    if (rotationOffset.x !== 0 || rotationOffset.y !== 0 || rotationOffset.z !== 0) {
      const offsetQuat = new THREE.Quaternion().setFromEuler(rotationOffset);
      record.item.quaternion.multiply(offsetQuat);
    }
  }

  /**
   * Removes all attached items from the scene graph without disposing
   * shared GPU resources. Use when instances are clones of cached base
   * models (production GLB or procedural templates); full cleanup happens
   * in the owning controller's dispose().
   */
  detachWithoutDispose(): void {
    for (const record of this.attachedRecords) {
      if (record.item.parent) {
        record.item.parent.remove(record.item);
      }
    }
    this.attachedRecords = [];
  }

  detachAll(): void {
    for (const record of this.attachedRecords) {
      if (record.item.parent) {
        record.item.parent.remove(record.item);
      }
      // Dispose geometries and materials in cloned instances
      record.item.traverse((child) => {
        if ((child as THREE.Mesh).geometry) {
          (child as THREE.Mesh).geometry.dispose();
        }
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat.dispose();
          }
        }
      });
    }
    this.attachedRecords = [];
  }

  getAttachedItems(): THREE.Object3D[] {
    return this.attachedRecords.map((a) => a.item);
  }

  getRecordCount(): number {
    return this.attachedRecords.length;
  }

  getRecords(): ReadonlyArray<AttachmentRecord> {
    return this.attachedRecords;
  }
}
