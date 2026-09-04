import { useFrame, useThree } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { waterHeight } from "./Ocean";
import { boat, boatSeatWorld, BOAT_SCALE, BOAT_SEAT } from "@/hooks/useBoat";
import { isInWater, player } from "@/hooks/usePlayer";
import { useGameStore } from "@/hooks/useGameStore";
import boatUrl from "@/assets/boat.glb?url";

/** Target hull length in local units (before BOAT_SCALE). */
const TARGET_LENGTH = 7.4;

/** Uploaded low-poly boat, auto-centred, auto-scaled and laid bow-forward (+z). */
function BoatModel() {
  const { scene } = useGLTF(boatUrl);
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // the hull is a single-sided shell (no separate interior floor mesh) —
        // double-side the material so the inside of the hull renders instead
        // of culling to reveal the ocean plane behind it (looked like water
        // sitting inside the boat).
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat) (mat as THREE.Material).side = THREE.DoubleSide;
        }
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    // longest horizontal axis becomes the hull axis (+z)
    const alongX = size.x > size.z;
    const length = alongX ? size.x : size.z;
    const s = TARGET_LENGTH / (length || 1);

    const inner = new THREE.Group();
    root.position.set(-center.x, -box.min.y, -center.z);
    inner.add(root);
    inner.scale.setScalar(s);

    const wrapper = new THREE.Group();
    if (alongX) wrapper.rotation.y = Math.PI / 2;
    wrapper.add(inner);
    // keep the hull bottom just above the waterline so the sea never shows inside
    wrapper.position.y = -size.y * s * 0.05;
    // seat the rider on the interior floor
    BOAT_SEAT.y = wrapper.position.y + size.y * s * 0.14;
    return wrapper;
  }, [scene]);

  return <primitive object={model} />;
}

useGLTF.preload(boatUrl);


const ACCEL = 16; // throttle acceleration
const REVERSE = 8;
const MAX_SPEED = 17;
const MAX_REVERSE = 5;
const DRAG = 1.1; // exponential water drag coefficient
const TURN_RATE = 1.5; // rad/s at cruising speed
const BOARD_DIST = 7;

const damp = (cur: number, target: number, k: number, dt: number) =>
  THREE.MathUtils.lerp(cur, target, 1 - Math.exp(-k * dt));




/* ------------------------------------------------------------------ */
/* Wake: trailing foam rings + bow spray droplets                      */
/* ------------------------------------------------------------------ */

const FOAM_COUNT = 150;
const SPRAY_COUNT = 90;

/** Soft elongated blob texture used for the long jet-like wake streaks. */
function makeFoamTexture() {
  const size = 128;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Foam {
  x: number;
  z: number;
  /** heading at spawn: the streak stretches along this direction */
  yaw: number;
  life: number;
  ttl: number;
  w0: number;
  side: number;
}

interface Spray {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  ttl: number;
}

function Wake() {
  const foamMesh = useRef<THREE.InstancedMesh>(null);
  const sprayMesh = useRef<THREE.InstancedMesh>(null);
  const foam = useRef<Foam[]>([]);
  const spray = useRef<Spray[]>([]);
  const acc = useRef(0);
  const sprayAcc = useRef(0);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const flat = useMemo(
    () => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
    [],
  );
  const v = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const qy = useMemo(() => new THREE.Quaternion(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const col = useMemo(() => new THREE.Color(), []);
  const foamTex = useMemo(() => makeFoamTexture(), []);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const t = performance.now() / 1000;
    const spd = Math.abs(boat.speed);

    // --- spawn foam along the stern while moving ---
    acc.current += dt;
    const interval = 0.035 + 0.05 * Math.exp(-spd * 0.35);
    if (spd > 0.35 && acc.current > interval) {
      acc.current = 0;
      const s = Math.sin(boat.yaw);
      const c = Math.cos(boat.yaw);
      for (const side of [-1, 0, 1]) {
        const lx = side * 1.1;
        const lz = -7.9; // well behind the stern, never inside the hull
        foam.current.push({
          x: boat.pos.x + lx * c + lz * s,
          z: boat.pos.z - lx * s + lz * c,
          yaw: boat.yaw,
          life: 0,
          ttl: 2.6 + Math.random() * 1.2,
          w0: 0.9 + Math.random() * 0.5,
          side,
        });
      }

      if (foam.current.length > FOAM_COUNT) foam.current.splice(0, foam.current.length - FOAM_COUNT);
    }

    // --- spawn bow spray at speed ---
    sprayAcc.current += dt;
    if (spd > 3 && sprayAcc.current > 0.03) {
      sprayAcc.current = 0;
      const s = Math.sin(boat.yaw);
      const c = Math.cos(boat.yaw);
      const dir = Math.sign(boat.speed) || 1;
      const lz = 7.9 * dir; // ahead of the bow / behind the stern, outside the hull
      const bx = boat.pos.x + lz * s;
      const bz = boat.pos.z + lz * c;
      for (let i = 0; i < 4; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        spray.current.push({
          p: new THREE.Vector3(bx + side * 1.6 * c, boat.pos.y + 0.1, bz - side * 1.6 * s),
          v: new THREE.Vector3(
            side * (2.0 + Math.random() * 1.6) * c + s * spd * 0.4,
            3.4 + Math.random() * 2.6,
            -side * (2.0 + Math.random() * 1.6) * s + c * spd * 0.4,
          ),
          life: 0,
          ttl: 0.6 + Math.random() * 0.4,
        });
      }
      if (spray.current.length > SPRAY_COUNT)
        spray.current.splice(0, spray.current.length - SPRAY_COUNT);
    }

    // --- update + write foam streaks ---
    const fm = foamMesh.current;
    if (fm) {
      let i = 0;
      for (const f of foam.current) {
        f.life += dt;
        const k = f.life / f.ttl;
        if (k >= 1) continue;
        // the streak keeps sliding backwards and spreads out only slightly
        const s = Math.sin(f.yaw);
        const c = Math.cos(f.yaw);
        const back = 3.2 * dt;
        f.x -= s * back - f.side * 0.35 * dt * c;
        f.z -= c * back + f.side * 0.35 * dt * s;
        const len = 7 + k * 22; // long jet-like trail
        const wid = f.w0 * (1.8 + k * 3.0);
        // boosted past 1.0 so the additive foam reads clearly over bright water
        const alpha = Math.min(1, k * 8) * (1 - k) * 2.2;
        v.set(f.x, waterHeight(f.x, f.z, t) + 0.45, f.z);
        qy.setFromAxisAngle(up, f.yaw);
        q.copy(qy).multiply(flat);
        sc.set(wid, len, 1);
        m.compose(v, q, sc);
        fm.setMatrixAt(i, m);
        col.setScalar(alpha);
        fm.setColorAt(i, col);
        i++;
        if (i >= FOAM_COUNT) break;
      }
      foam.current = foam.current.filter((f) => f.life < f.ttl);
      for (let j = i; j < FOAM_COUNT; j++) {
        m.compose(v.set(0, -900, 0), flat, sc.set(0.001, 0.001, 0.001));
        fm.setMatrixAt(j, m);
        col.setScalar(0);
        fm.setColorAt(j, col);
      }
      fm.instanceMatrix.needsUpdate = true;
      if (fm.instanceColor) fm.instanceColor.needsUpdate = true;
    }


    // --- update + write spray instances ---
    const sm = sprayMesh.current;
    if (sm) {
      let i = 0;
      for (const d of spray.current) {
        d.life += dt;
        if (d.life >= d.ttl) continue;
        d.v.y -= 11 * dt;
        d.p.addScaledVector(d.v, dt);
        const k = d.life / d.ttl;
        const scale = 0.3 * (1 - k * 0.5);
        q.identity();
        m.compose(d.p, q, sc.set(scale, scale, scale));
        sm.setMatrixAt(i, m);
        i++;
        if (i >= SPRAY_COUNT) break;
      }
      spray.current = spray.current.filter((d) => d.life < d.ttl);
      for (let j = i; j < SPRAY_COUNT; j++) {
        q.identity();
        m.compose(v.set(0, -900, 0), q, sc.set(0.001, 0.001, 0.001));
        sm.setMatrixAt(j, m);
      }
      sm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={foamMesh}
        args={[undefined, undefined, FOAM_COUNT]}
        frustumCulled={false}
        renderOrder={30}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={foamTex}
          color="#ffffff"
          transparent
          opacity={1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={sprayMesh}
        args={[undefined, undefined, SPRAY_COUNT]}
        frustumCulled={false}
        renderOrder={31}
      >
        <sphereGeometry args={[1, 6, 5]} />
        <meshBasicMaterial
          color="#ffffff"
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Boat                                                                */
/* ------------------------------------------------------------------ */

export function Boat() {
  const group = useRef<THREE.Group>(null);

  const keys = useRef<Record<string, boolean>>({});
  const seat = useMemo(() => new THREE.Vector3(), []);
  const { camera } = useThree();
  const setMessage = useGameStore((s) => s.setMessage);
  const [prompt, setPrompt] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code !== "KeyE" || e.repeat) return;
      e.preventDefault();
      if (boat.riding) {
        // step off onto the port side of the hull
        boat.riding = false;
        boat.speed = 0;
        const s = Math.sin(boat.yaw);
        const c = Math.cos(boat.yaw);
        player.pos.x = boat.pos.x + 3.2 * c;
        player.pos.z = boat.pos.z - 3.2 * s;
        setMessage("Left the boat. Press E near the boat to board again.");
      } else if (boat.near) {
        boat.riding = true;
        setMessage("Aboard! W/S = throttle & reverse, A/D = steer, E = disembark.");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const clear = () => {
      keys.current = {};
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clear);
    };
  }, [setMessage]);

  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.05);
    const t = state.clock.elapsedTime;
    const k = keys.current;

    boatSeatWorld(seat);
    boat.near =
      !boat.riding &&
      Math.hypot(player.pos.x - seat.x, player.pos.z - seat.z) < BOARD_DIST;
    if (boat.near !== prompt) setPrompt(boat.near);

    // ---- steering ------------------------------------------------------
    if (boat.riding) {
      const throttle =
        (k["KeyW"] || k["ArrowUp"] ? 1 : 0) - (k["KeyS"] || k["ArrowDown"] ? 1 : 0);
      const steer = (k["KeyA"] || k["ArrowLeft"] ? 1 : 0) - (k["KeyD"] || k["ArrowRight"] ? 1 : 0);

      if (throttle > 0) boat.speed += ACCEL * dt;
      else if (throttle < 0) boat.speed -= REVERSE * dt;
      boat.speed *= Math.exp(-DRAG * dt);
      boat.speed = THREE.MathUtils.clamp(boat.speed, -MAX_REVERSE, MAX_SPEED);

      // rudder authority scales with headway, like a real boat
      const authority = THREE.MathUtils.clamp(Math.abs(boat.speed) / 6, 0.15, 1);
      const wantTurn = steer * TURN_RATE * authority * Math.sign(boat.speed || 1);
      // steering re-centres quickly so the boat tracks straight when A/D released
      boat.turn = damp(boat.turn, wantTurn, steer === 0 ? 12 : 6, dt);
      if (steer === 0 && Math.abs(boat.turn) < 0.01) boat.turn = 0;
      boat.yaw += boat.turn * dt;


      boat.pos.x += Math.sin(boat.yaw) * boat.speed * dt;
      boat.pos.z += Math.cos(boat.yaw) * boat.speed * dt;

      // the hull cannot climb onto land — bounce it back into the water
      if (!isInWater(boat.pos.x, boat.pos.z)) {
        boat.pos.x -= Math.sin(boat.yaw) * boat.speed * dt * 1.05;
        boat.pos.z -= Math.cos(boat.yaw) * boat.speed * dt * 1.05;
        boat.speed *= -0.25;
      }
    } else {
      boat.speed *= Math.exp(-2.4 * dt);
      boat.turn = damp(boat.turn, 0, 4, dt);
      boat.yaw += boat.turn * dt;
      boat.pos.x += Math.sin(boat.yaw) * boat.speed * dt;
      boat.pos.z += Math.cos(boat.yaw) * boat.speed * dt;
    }

    // ---- float on the swell -------------------------------------------
    const h = waterHeight(boat.pos.x, boat.pos.z, t);
    boat.pos.y = damp(boat.pos.y, h + 0.06, 7, dt);

    const hb = waterHeight(boat.pos.x + Math.sin(boat.yaw) * 2, boat.pos.z + Math.cos(boat.yaw) * 2, t);
    const hs = waterHeight(boat.pos.x + Math.cos(boat.yaw) * 1, boat.pos.z - Math.sin(boat.yaw) * 1, t);
    const g = group.current;
    if (g) {
      (window as unknown as { __boatGroup?: THREE.Group }).__boatGroup = g;
      g.position.copy(boat.pos);
      g.rotation.y = boat.yaw;
      // keep the hull level: only a hint of swell + a very light bank in turns
      const pitch = THREE.MathUtils.clamp((hb - h) * 0.08, -0.06, 0.06) - boat.speed * 0.003;
      const roll = THREE.MathUtils.clamp((hs - h) * 0.08, -0.06, 0.06) + boat.turn * 0.06;
      g.rotation.x = damp(g.rotation.x, pitch, 3, dt);
      g.rotation.z = damp(g.rotation.z, roll, 3, dt);
    }


    // ---- carry the rider ----------------------------------------------
    if (boat.riding) {
      boatSeatWorld(seat);
      player.pos.copy(seat);
      player.yaw = boat.yaw;
      player.moving = false;
      player.swimming = false;
      void camera;
    }
  });

  return (
    <group>
      <group ref={group} scale={BOAT_SCALE}>
        <Suspense fallback={null}>
          <BoatModel />
        </Suspense>



        {prompt && (
          <Html position={[0, 1.9, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
            <div className="pointer-events-none whitespace-nowrap rounded-full border border-white/30 bg-slate-900/70 px-3 py-1 text-[13px] font-semibold text-slate-50 shadow-lg backdrop-blur-sm">
              Press E to board the boat
            </div>
          </Html>
        )}
      </group>
      <Wake />
    </group>
  );
}