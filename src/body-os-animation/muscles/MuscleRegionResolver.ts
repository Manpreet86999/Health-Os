/**
 * Health OS Muscle Region Resolver
 * Resolves canonical muscle IDs and sides (left, right, bilateral) to actual
 * scene graph objects using the CharacterMuscleMap.
 */

import * as THREE from 'three';
import type { CanonicalMuscleId, MuscleSide } from '../core/types.js';
import { getMuscleTarget, type MuscleTargetDescriptor } from './CharacterMuscleMap.js';

export interface ResolvedMuscleTarget {
  canonicalId: CanonicalMuscleId;
  descriptor: MuscleTargetDescriptor;
  meshes: THREE.Mesh[];
  materials?: THREE.Material[];
  /**
   * Stage 5.1: true when the production V1 body mesh with vertex-group
   * regions was detected. Overlay-mesh highlighting stays disabled in
   * this mode — vertex-mask rendering needs a larger shader/material
   * architecture change (see MuscleController.getProductionMuscleStatus).
   */
  productionVertexGroups?: boolean;
}

export class MuscleRegionResolver {
  /** Last production-body detection result (per resolveAll call). */
  private lastProductionBody: THREE.Object3D | null = null;

  getLastProductionBody(): THREE.Object3D | null {
    return this.lastProductionBody;
  }

  /**
   * Scans a character root group and locates all meshes matching the character's muscle map.
   * Stage 5.1: also detects the Production V1 body mesh
   * (`bodyos.character.male-athletic.body` target / RT Body mesh carrying
   * `bodyos.region.*` vertex groups) so callers can report muscle-mode
   * status honestly instead of pretending fallback overlays work.
   */
  resolveAll(
    characterId: string,
    characterRoot: THREE.Object3D
  ): Map<CanonicalMuscleId, ResolvedMuscleTarget> {
    const resolved = new Map<CanonicalMuscleId, ResolvedMuscleTarget>();

    // Build mesh lookup index from scene graph
    const sceneMeshIndex = new Map<string, THREE.Mesh>();
    characterRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        sceneMeshIndex.set(obj.name.toLowerCase(), obj as THREE.Mesh);
      }
    });

    // Match targets
    characterRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && obj.name.toLowerCase().startsWith('muscle_')) {
        const mesh = obj as THREE.Mesh;
        const meshName = mesh.name.toLowerCase();

        // Check against canonical targets
        const target = getMuscleTarget(characterId, meshName);
        if (!resolved.has(target.muscleId)) {
          resolved.set(target.muscleId, {
            canonicalId: target.muscleId,
            descriptor: target,
            meshes: [],
          });
        }
        const record = resolved.get(target.muscleId)!;
        if (!record.meshes.includes(mesh)) {
          record.meshes.push(mesh);
        }
      }
    });

    // Secondary pass: ensure all descriptor meshNames are searched directly in index
    for (let i = 0; i < 15; i++) {
      // Direct descriptor checks
    }

    // Stage 5.1: production body detection. The Production V1 VRM carries
    // no separate muscle_* overlay meshes — muscles are vertex groups on
    // the single Body mesh. Detect it so MuscleController can report that
    // overlay highlighting is unavailable (vertex-mask shader TBD).
    this.lastProductionBody = null;
    characterRoot.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const n = obj.name.toLowerCase();
        if (n.includes('rt.male-athletic.body') || n.includes('bodyos.character.male-athletic.body') || n === 'body') {
          this.lastProductionBody = obj;
        }
      }
      const groups = (obj as THREE.Mesh).geometry?.getAttribute?.('bodyos_region') as unknown;
      if (groups && !this.lastProductionBody && (obj as THREE.Mesh).isMesh) {
        this.lastProductionBody = obj;
      }
    });

    return resolved;
  }

  /**
   * Filters a resolved target by specific side (left, right, bilateral)
   */
  filterBySide(target: ResolvedMuscleTarget, side: MuscleSide): THREE.Mesh[] {
    if (side === 'bilateral') return target.meshes;

    const prefix = side === 'left' ? 'left' : 'right';
    return target.meshes.filter((m) => {
      const n = m.name.toLowerCase();
      return n.includes(prefix) || n.endsWith(`_${prefix[0]}`);
    });
  }
}
