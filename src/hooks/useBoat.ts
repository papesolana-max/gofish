import * as THREE from "three";

/**
 * Shared, mutable boat transform. Lives outside React (like `player`) so the
 * scene, the angler and the wake effect can all read it every frame without
 * re-rendering.
 */
export const boat = {
  pos: new THREE.Vector3(-11.8, 0, 44),
  yaw: 0,
  /** forward speed along the hull axis (units/s) */
  speed: 0,
  /** turn rate, used to bank the hull into the turn */
  turn: 0,
  /** true while the character is aboard and steering */
  riding: false,
  /** true when the player stands close enough to press E */
  near: false,
};

/** Seat position in hull-local space (character sits just behind the mast). */
export const BOAT_SEAT = new THREE.Vector3(0, 0.02, -0.9);

/** Uniform scale of the hull model so the dinghy reads bigger than the angler. */
export const BOAT_SCALE = 1.85;

/** World position of the seat, written into `out`. */
export function boatSeatWorld(out: THREE.Vector3): THREE.Vector3 {
  const s = Math.sin(boat.yaw);
  const c = Math.cos(boat.yaw);
  const x = BOAT_SEAT.x * BOAT_SCALE;
  const z = BOAT_SEAT.z * BOAT_SCALE;
  return out.set(
    boat.pos.x + x * c + z * s,
    boat.pos.y + BOAT_SEAT.y * BOAT_SCALE,
    boat.pos.z - x * s + z * c,
  );
}

// Dev aid: expose the live boat state for quick inspection in the console.
if (typeof window !== "undefined") {
  (window as unknown as { __boat?: typeof boat }).__boat = boat;
}
