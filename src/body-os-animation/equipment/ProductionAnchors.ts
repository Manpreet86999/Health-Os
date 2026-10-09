import * as THREE from 'three';

/**
 * Health OS Production Anchor Resolver — Stage 4: Production Asset Integration
 *
 * Resolves production equipment anchors primarily from glTF metadata
 * (`bodyos_id` + `role` extras, see `BODY_OS_EQUIPMENT_SCHEMA_V1.md` and
 * `ANCHOR_SCHEMA_MIGRATION_V1.json`). Node names carry semantic/debug
 * information and serve as legacy fallback only.
 *
 * `bodyos_id` values are unique WITHIN each owning runtime asset
 * (asset-scoped by contract); resolution always happens against a single
 * loaded equipment instance root, so no global disambiguation is needed.
 */

export interface ProductionAnchorQuery {
  /** Primary key: production `bodyos_id` extra (e.g. `equipment.grip.center`). */
  bodyosId?: string;
  /** Secondary key: production `role` extra (e.g. `palm_grip`). */
  role?: string;
  /** Legacy fallback: production node name (e.g. `BODYOS_Grip_C`). */
  nodeName?: string;
}

/** Reads a glTF extra / Three.js userData field from a node. */
function readExtra(node: THREE.Object3D, key: string): unknown {
  const userData = (node as { userData?: Record<string, unknown> }).userData;
  return userData ? userData[key] : undefined;
}

/**
 * Finds the first node in `root` whose `bodyos_id` extra matches.
 * Returns null when no metadata-anchored node exists.
 */
export function findAnchorByBodyosId(root: THREE.Object3D, bodyosId: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (found) return;
    if (readExtra(child, 'bodyos_id') === bodyosId) found = child;
  });
  return found;
}

/** Finds all nodes in `root` whose `role` extra matches. */
export function findAnchorsByRole(root: THREE.Object3D, role: string): THREE.Object3D[] {
  const matches: THREE.Object3D[] = [];
  root.traverse((child) => {
    if (readExtra(child, 'role') === role) matches.push(child);
  });
  return matches;
}

/** Finds a node by production node name (legacy fallback path). */
export function findAnchorByNodeName(root: THREE.Object3D, nodeName: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (found) return;
    if (child.name === nodeName) found = child;
  });
  return found;
}

/**
 * Resolves a production anchor against a loaded equipment instance.
 * Priority: `bodyos_id` (+ `role` disambiguation) → `role` alone →
 * legacy `nodeName`. Returns null when nothing matches; callers fall back
 * to non-anchored attachment instead of failing.
 */
export function resolveEquipmentAnchor(root: THREE.Object3D, query: ProductionAnchorQuery): THREE.Object3D | null {
  if (query.bodyosId) {
    if (query.role) {
      const byRole = findAnchorsByRole(root, query.role);
      const scoped = byRole.find((node) => readExtra(node, 'bodyos_id') === query.bodyosId);
      if (scoped) return scoped;
    }
    const byId = findAnchorByBodyosId(root, query.bodyosId);
    if (byId) return byId;
  }
  if (query.role) {
    const byRole = findAnchorsByRole(root, query.role);
    if (byRole.length > 0) return byRole[0];
  }
  if (query.nodeName) {
    return findAnchorByNodeName(root, query.nodeName);
  }
  return null;
}

/**
 * Finds the production runtime root inside a (possibly multi-root) loaded
 * GLB scene by its `runtime_id` extra (e.g. `plate-20kg` inside
 * `weight-plates.glb`). Returns the scene itself when no `runtimeId` is
 * requested or no matching root exists (caller then uses the full scene).
 */
export function selectProductionRoot(scene: THREE.Object3D, runtimeId?: string): THREE.Object3D {
  if (!runtimeId) return scene;
  let found: THREE.Object3D | null = null;
  // Check the scene itself first (single-root GLBs may carry runtime_id on scene).
  if (readExtra(scene, 'runtime_id') === runtimeId) return scene;
  scene.traverse((child) => {
    if (found || child === scene) return;
    if (readExtra(child, 'runtime_id') === runtimeId) found = child;
  });
  return found ?? scene;
}
