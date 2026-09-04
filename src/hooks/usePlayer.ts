import * as THREE from "three";
import { groundAround, pushOutOfSolids } from "@/lib/worldPhysics";
import { WATER_Y } from "@/components/game/worldConfig";

const PLAYER_FOOT_RADIUS = 0.35;
const BOARDWALK_GROUND_MARGIN = 0.04;
const GROUND_GRACE_SECONDS = 0.15;

/** Shared, mutable player transform so the camera rig can follow the angler. */
export const player = {
  pos: new THREE.Vector3(0, 0.66, 12),
  yaw: 0,
  moving: false,
  /** true while the character is out in the water (swimming, not walking) */
  swimming: false,
  /** vertical velocity while jumping (0 when grounded) */
  vy: 0,
  /** true while airborne from a jump */
  jumping: false,
  /** Last reliable support, retained briefly across plank seams. */
  lastGroundY: WATER_Y,
  groundGraceRemaining: 0,
};

/**
 * The hand-authored island is gone: land is whatever the player placed with the
 * World Editor. A point is water when no walkable object covers it above the
 * waterline.
 */
export function isInWater(x: number, z: number): boolean {
  const g = groundAround(x, z, PLAYER_FOOT_RADIUS);
  return g === null || g < WATER_Y + BOARDWALK_GROUND_MARGIN;
}

/** Walkable surface height at a point (falls back to the waterline). */
export function groundHeight(x: number, z: number): number {
  const g = groundAround(x, z, PLAYER_FOOT_RADIUS);
  return g === null ? WATER_Y : g;
}

/**
 * Resolve walk/swim state once per frame. A short grace window prevents a
 * single missed ray between boardwalk planks from dropping the player into
 * swimming mode, while genuine water still takes over after 150 ms.
 */
export function resolvePlayerGround(
  x: number,
  z: number,
  delta: number,
): { swimming: boolean; groundY: number } {
  const ground = groundAround(x, z, PLAYER_FOOT_RADIUS);
  const supported = ground !== null && ground >= WATER_Y + BOARDWALK_GROUND_MARGIN;

  if (supported) {
    player.lastGroundY = ground;
    player.groundGraceRemaining = GROUND_GRACE_SECONDS;
    return { swimming: false, groundY: ground };
  }

  player.groundGraceRemaining = Math.max(0, player.groundGraceRemaining - delta);
  if (player.groundGraceRemaining > 0) {
    return { swimming: false, groundY: player.lastGroundY };
  }

  return { swimming: true, groundY: WATER_Y };
}

/** Free roaming; only objects marked "solid" in the editor block the player. */
export function clampToWalkable(x: number, z: number): [number, number] {
  return pushOutOfSolids(x, z, 0.9);
}

// Dev aid: expose the live player state for quick inspection in the console.
if (typeof window !== "undefined") {
  (window as unknown as { __player?: typeof player }).__player = player;
}
