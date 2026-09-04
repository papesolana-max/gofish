import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";

/**
 * Runtime collision registry for the player-placed world objects.
 *
 * Every object rendered by <WorldObjects /> registers its three.js group here.
 * - `walkable` objects are raycast against to find the ground height.
 * - `solid` objects push the player out of their (XZ) bounding box.
 *
 * Imported GLB/FBX models can carry hundreds of thousands of triangles, so a
 * naive `intersectObject(root, true)` several times per frame stalls the loop.
 * Every walkable mesh therefore gets a BVH built once (and rebuilt only when the
 * model itself changes), and ground queries are memoised on a coarse grid that
 * is invalidated whenever a transform changes.
 */

// Opt in to BVH-accelerated raycasting for meshes we prepare below.
THREE.Mesh.prototype.raycast = acceleratedRaycast;
// three's own typings ship a slightly different BVH shape; the runtime is the
// same three-mesh-bvh implementation, so widen the assignment.
const geoProto = THREE.BufferGeometry.prototype as unknown as Record<string, unknown>;
geoProto["computeBoundsTree"] = computeBoundsTree;
geoProto["disposeBoundsTree"] = disposeBoundsTree;

export interface Collider {
  id: string;
  obj: THREE.Object3D;
  walkable: boolean;
  solid: boolean;
  box: THREE.Box3;
  /** flattened list of meshes, so we skip a traverse on every query */
  meshes: THREE.Mesh[];
}

const colliders = new Map<string, Collider>();

/** Bumped on any registry/transform change so cached ground samples drop. */
let version = 0;
const groundCache = new Map<string, number | null>();

function invalidate() {
  version++;
  groundCache.clear();
}

function collectMeshes(obj: THREE.Object3D, walkable: boolean): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    meshes.push(m);
    if (!walkable) return;
    const geo = m.geometry as THREE.BufferGeometry & {
      boundsTree?: unknown;
      computeBoundsTree?: (o?: { maxLeafTris?: number }) => void;
    };
    if (geo && !geo.boundsTree) {
      try {
        geo.computeBoundsTree?.({ maxLeafTris: 8 });
      } catch {
        /* non-indexed / degenerate geometry: fall back to plain raycast */
      }
    }
  });
  return meshes;
}

export function registerCollider(
  id: string,
  obj: THREE.Object3D,
  walkable: boolean,
  solid: boolean,
) {
  obj.updateWorldMatrix(true, true);
  colliders.set(id, {
    id,
    obj,
    walkable,
    solid,
    box: new THREE.Box3().setFromObject(obj),
    meshes: collectMeshes(obj, walkable),
  });
  invalidate();
}

export function unregisterCollider(id: string) {
  colliders.delete(id);
  invalidate();
}

/** Recompute the cached bounding box after a transform change. */
export function refreshCollider(id: string) {
  const c = colliders.get(id);
  if (!c) return;
  c.obj.updateWorldMatrix(true, true);
  c.box.setFromObject(c.obj);
  invalidate();
}

export function refreshAllColliders() {
  for (const c of colliders.values()) {
    c.obj.updateWorldMatrix(true, true);
    c.box.setFromObject(c.obj);
  }
  invalidate();
}

const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const DOWN = new THREE.Vector3(0, -1, 0);
const origin = new THREE.Vector3();

/** Highest walkable surface under (x, z), or null when there is nothing there. */
export function groundAt(x: number, z: number, from = 500): number | null {
  // Quantise to a 10cm grid: the player moves far less than that per frame, so
  // consecutive queries in the same frame (water test, height, monster AI) hit
  // the cache instead of re-raycasting the whole world.
  const key = `${version}|${Math.round(x * 10)}|${Math.round(z * 10)}`;
  const hit = groundCache.get(key);
  if (hit !== undefined) return hit;

  let best: number | null = null;
  origin.set(x, from, z);
  raycaster.set(origin, DOWN);
  raycaster.far = from + 500;
  for (const c of colliders.values()) {
    if (!c.walkable) continue;
    // cheap reject with the cached bounds
    if (x < c.box.min.x - 0.1 || x > c.box.max.x + 0.1) continue;
    if (z < c.box.min.z - 0.1 || z > c.box.max.z + 0.1) continue;
    for (const m of c.meshes) {
      const hits = raycaster.intersectObject(m, false);
      for (const h of hits) {
        if (best === null || h.point.y > best) best = h.point.y;
      }
    }
  }

  if (groundCache.size > 20000) groundCache.clear();
  groundCache.set(key, best);
  return best;
}

/**
 * Ground beneath the player's footprint rather than beneath one exact point.
 * Thin planks, seams between boards, and platform edges can miss a centre-only
 * ray even while most of the character is still supported.
 */
export function groundAround(x: number, z: number, radius = 0.35): number | null {
  const samples: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ];
  let best: number | null = null;
  for (const [offsetX, offsetZ] of samples) {
    const ground = groundAt(x + offsetX, z + offsetZ);
    if (ground !== null && (best === null || ground > best)) best = ground;
  }
  return best;
}

/** True when any walkable object covers (x, z) above the waterline. */
export function isOverLand(x: number, z: number, minY = -0.2): boolean {
  const g = groundAt(x, z);
  return g !== null && g > minY;
}

/**
 * Push (x, z) out of every solid object's XZ bounding box, along the axis with
 * the smallest penetration. Objects are only solid when the user marks them so.
 */
export function pushOutOfSolids(x: number, z: number, radius = 0.9): [number, number] {
  let px = x;
  let pz = z;
  for (const c of colliders.values()) {
    if (!c.solid) continue;
    const minX = c.box.min.x - radius;
    const maxX = c.box.max.x + radius;
    const minZ = c.box.min.z - radius;
    const maxZ = c.box.max.z + radius;
    if (px <= minX || px >= maxX || pz <= minZ || pz >= maxZ) continue;
    const left = px - minX;
    const right = maxX - px;
    const back = pz - minZ;
    const front = maxZ - pz;
    const m = Math.min(left, right, back, front);
    if (m === left) px = minX;
    else if (m === right) px = maxX;
    else if (m === back) pz = minZ;
    else pz = maxZ;
  }
  return [px, pz];
}
