import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { waterHeight } from "./Ocean";
import { FishMesh } from "./Fish";
import { MonsterFishMesh } from "./MonsterFish";
import { MonsterBurstMesh, animateBurst } from "./MonsterBurst";
import { rollFish, useGameStore, type FishCatch } from "@/hooks/useGameStore";
import { clampToWalkable, isInWater, player, resolvePlayerGround } from "@/hooks/usePlayer";
import { boat } from "@/hooks/useBoat";
import { useWeather } from "@/hooks/useWeather";
import { biteWindowFor } from "@/lib/fishRules";

import {
  playBobberSplash,
  playCastWhizz,
  playFootstep,
  resumeWeatherAudio,
  startReelSound,
  stopReelSound,
} from "@/lib/weatherAudio";

const WALK_SPEED = 17;
const SWIM_SPEED = 10;
/** upward velocity imparted by a Space jump — tinggi & responsif (bukan slow-motion) */
const JUMP_VEL = 27;
const GRAVITY = 95;
const CAST_RANGE = 16;

/** swim pose: near-vertical while treading water in place, near-horizontal
 * (prone, "tengkurap") once actually swimming forward/back/sideways. */
const SWIM_PITCH_IDLE = 0.05;
const SWIM_PITCH_ACTIVE = 1.3;
/** local height (body-space) of the head, used to keep it near the surface
 * at any pitch — as the body tips from upright toward prone, less of its
 * local "up" axis stays vertical, so the swim depth below has to compensate. */
const SWIM_HEAD_LOCAL_Y = 4.25;
/** how far the head pokes above the water surface when floating upright */
const SWIM_SURFACE_EMERGE = 0.65;


const lerp = THREE.MathUtils.lerp;
const damp = (cur: number, target: number, k: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-k * dt));

/** Offset mulut monster relatif pusat model (lokal x≈1.6, y≈-0.05) × scale 9. */
const MONSTER_SCALE = 9;
const MONSTER_MOUTH = new THREE.Vector3(1.6, -0.05, 0).multiplyScalar(MONSTER_SCALE);



/** Roblox-style blocky avatar holding a fishing rod. */
export function Angler() {
  const { setPhase, setMessage, landFish } = useGameStore.getState();

  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const leftArm = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);
  const rodBend = useRef<THREE.Group>(null);
  const rodTip = useRef<THREE.Object3D>(null);
  const bobber = useRef<THREE.Group>(null);
  const hooked = useRef<THREE.Group>(null);
  const monster = useRef<THREE.Group>(null);
  const splash = useRef<THREE.Group>(null);
  const burst = useRef<THREE.Group>(null);
  const reelCrank = useRef<THREE.Group>(null);
  /** anchor di tangan kanan (joran dipegang) */
  const handAnchor = useRef<THREE.Group>(null);
  /** anchor di punggung (joran dilepas / disampirkan) */
  const backAnchor = useRef<THREE.Group>(null);
  const stowedNow = useRef(false);

  /** anchor senar di sepanjang batang: spool reel -> ring guide -> ujung joran */
  const guideRefs = useRef<Array<THREE.Object3D | null>>([]);
  const GUIDE_COUNT = 5; // 4 ring + spool; tip ditambahkan terpisah
  const CURVE_SEGS = 14;

  // line geometry (segmen batang + katenari ke pelampung)
  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array((GUIDE_COUNT + 1 + CURVE_SEGS) * 3), 3),
    );
    const mat = new THREE.LineBasicMaterial({ color: "#f4f7f8", transparent: true, opacity: 0.85 });
    const l = new THREE.Line(geo, mat);
    l.frustumCulled = false;
    return l;
  }, []);


  const s = useRef({
    phase: "idle" as
      | "idle"
      | "cast"
      | "waiting"
      | "bite"
      | "reel"
      | "caught",
    t: 0,
    biteAt: 3,
    bobber: new THREE.Vector3(player.pos.x, 0, player.pos.z + 1),
    walk: 0,
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    /** horizontal direction the current cast was aimed at */
    dir: new THREE.Vector3(0, 0, 1),
    fish: null as FishCatch | null,
    /** sisa waktu tampil monster raksasa setelah tertangkap (detik) */
    monsterT: 0,
    monsterDir: 0,
    /** posisi & rotasi pusat monster (dihitung di fase reel/caught) */
    monsterPos: new THREE.Vector3(),
    monsterRot: new THREE.Euler(),


    splashT: 99,
    whizzed: false,
    splashAt: new THREE.Vector3(),
    rodTarget: 0,
    lean: 0,
    /** fase siklus langkah terakhir yang sudah memicu suara footstep */
    stepPhase: 0,
    /** true selama masih di udara, untuk memicu suara mendarat */
    wasJumping: false,
  });

  const tipWorld = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const tmp2 = useMemo(() => new THREE.Vector3(), []);
  const tmp3 = useMemo(() => new THREE.Vector3(), []);
  const { gl, camera } = useThree();

  const action = () => {
    // Keep gameplay audio unlocked even when this action is the browser's
    // very first user gesture. Sounds remain non-positional for multiplayer.
    resumeWeatherAudio();
    const st = s.current;
    const store = useGameStore.getState();
    if (store.rodStowed) {
      // joran sedang tersampir di punggung: ambil dulu sebelum bisa melempar
      store.setRodStowed(false);
      setMessage("Rod ready. Press ENTER / left click to cast.");
      return;
    }
    if (st.phase === "idle") {
      // Casting is locked to the avatar's visible forward axis, never the
      // orbit camera. Preserve the current visible yaw so starting a cast
      // cannot turn or snap the character after the camera has been rotated.
      const castYaw = body.current?.rotation.y ?? player.yaw;
      const dirX = Math.sin(castYaw);
      const dirZ = Math.cos(castYaw);
      const toX = player.pos.x + dirX * CAST_RANGE;
      const toZ = player.pos.z + dirZ * CAST_RANGE;
      // The bobber has to land in open sea, not on the island itself —
      // block casting toward land (e.g. facing inland toward the hills).
      if (!isInWater(toX, toZ)) {
        setMessage("Aim your cast toward the sea, not the island!");
        return;
      }
      player.yaw = castYaw;
      st.dir.set(dirX, 0, dirZ);
      st.to.set(toX, 0, toZ);
      st.phase = "cast";
      st.t = 0;
      st.whizzed = false;
      st.fish = null;
      setPhase("cast");
      setMessage("Casting...");
    } else if (st.phase === "bite") {
      st.phase = "reel";
      st.t = 0;
      setPhase("reel");
      setMessage("Reeling in!");
      startReelSound();
    } else if (st.phase === "waiting") {
      st.phase = "idle";
      st.t = 0;
      setPhase("idle");
      setMessage("Line pulled in empty. ENTER / left click to cast again.");
    }
  };

  const keys = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        if (e.repeat) return;
        // Space = selalu lompat saat di darat; lempar/tarik kail pakai ENTER / klik kiri.
        // Saat sedang memancing (fase bukan idle) Space tetap untuk aksi pancing.
        const st = s.current;
        const canJump =
          e.code === "Space" &&
          st.phase === "idle" &&
          !boat.riding &&
          !player.swimming &&
          !player.jumping;
        if (canJump) {
          player.vy = JUMP_VEL;
          player.jumping = true;
          return;
        }
        if (e.code === "Space" && st.phase === "idle") return; // di air/perahu: abaikan
        action();
      }
      if (e.code === "KeyR") {
        e.preventDefault();
        const store = useGameStore.getState();
        // hanya boleh melepas/memasang joran saat tidak sedang memancing
        if (s.current.phase !== "idle") return;
        const next = !store.rodStowed;
        store.setRodStowed(next);
        setMessage(
          next
            ? "Rod stowed on your back. Press R to draw it again."
            : "Rod ready. Press ENTER / left click to cast.",
        );
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const clearKeys = () => {
      keys.current = {};
    };
    // left mouse button casts; right button is reserved for camera rotation
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 0) action();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    gl.domElement.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      gl.domElement.removeEventListener("pointerdown", onPointerDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.05);
    const t = state.clock.elapsedTime;
    const st = s.current;
    st.t += dt;

    // efek burst hanya aktif selama fase caught monster; reset tiap frame
    if (burst.current) burst.current.visible = false;

    // ---- WASD movement (camera-relative), only while not fishing --------
    const k = keys.current;
    const fwd = (k["KeyW"] || k["ArrowUp"] ? 1 : 0) - (k["KeyS"] || k["ArrowDown"] ? 1 : 0);
    const side = (k["KeyD"] || k["ArrowRight"] ? 1 : 0) - (k["KeyA"] || k["ArrowLeft"] ? 1 : 0);
    const canWalk = st.phase === "idle" && !boat.riding;
    let speed = 0;

    if (canWalk && (fwd !== 0 || side !== 0)) {
      // camera forward projected on the ground plane
      const camYaw = Math.atan2(
        state.camera.position.x - player.pos.x,
        state.camera.position.z - player.pos.z,
      );
      // W walks away from the camera, D walks to the camera-right
      const dirX = -Math.sin(camYaw) * fwd + Math.cos(camYaw) * side;
      const dirZ = -Math.cos(camYaw) * fwd - Math.sin(camYaw) * side;
      const len = Math.hypot(dirX, dirZ) || 1;
      const nx = dirX / len;
      const nz = dirZ / len;
      const mv = player.swimming ? SWIM_SPEED : WALK_SPEED;
      const [cx, cz] = clampToWalkable(
        player.pos.x + nx * mv * dt,
        player.pos.z + nz * mv * dt,
      );
      player.pos.x = cx;
      player.pos.z = cz;
      player.yaw = Math.atan2(nx, nz);
      speed = 1;
    }
    player.moving = speed > 0;
    if (!boat.riding) {
      // ---- swim when off the island / off the dock ----------------------
      const groundContact = resolvePlayerGround(player.pos.x, player.pos.z, dt);
      player.swimming = groundContact.swimming;
      const targetY = player.swimming
        ? waterHeight(player.pos.x, player.pos.z, t) - 3.6 // tenggelam: cuma kepala di atas air
        : groundContact.groundY;
      if (player.jumping) {
        // ---- jump physics: ballistic arc until landing -------------------
        player.vy -= GRAVITY * dt;
        player.pos.y += player.vy * dt;
        if (player.pos.y <= targetY) {
          player.pos.y = targetY;
          player.vy = 0;
          player.jumping = false;
          // suara mendarat
          playFootstep(player.swimming ? "water" : "sand", 1.5);
          st.stepPhase = Math.floor(st.walk / Math.PI);
        }
      } else {
        player.pos.y = damp(player.pos.y, targetY, player.swimming ? 6 : 12, dt);
      }
    } else {
      player.jumping = false;
      player.vy = 0;
      // riding: the boat writes player.pos each frame (seated on the bench)
      player.swimming = false;
    }
    st.walk += dt * (speed > 0 ? 9 : 0);

    // ---- footstep sounds: satu bunyi tiap setengah siklus langkah --------
    if (speed > 0 && !player.jumping && !player.swimming && !boat.riding) {
      const phase = Math.floor(st.walk / Math.PI);
      if (phase !== st.stepPhase) {
        st.stepPhase = phase;
        // di atas dermaga/papan (di atas permukaan air tapi tidak berenang) = kayu
        const onWood = isInWater(player.pos.x, player.pos.z);
        playFootstep(onWood ? "wood" : "sand", 0.9 + Math.random() * 0.2);
      }
    } else if (speed === 0) {
      st.stepPhase = Math.floor(st.walk / Math.PI);
    }


    // ---- body transform: stand at the player position -------------------
    if (body.current) {
      const bob = boat.riding
        ? 0
        : player.swimming
        ? Math.sin(t * 2.4) * 0.16
        : speed > 0
          ? Math.abs(Math.sin(st.walk)) * 0.09
          : Math.sin(t * 1.6) * 0.05;
      // pose renang: badan tetap tegak & tenggelam (hanya kepala di atas air),
      // sedikit condong ke depan saat bergerak — tidak diangkat/terapung
      const swimPitch =
        player.swimming && !boat.riding ? (speed > 0 ? 0.22 : 0.05) : 0;
      body.current.rotation.order = "YXZ";
      body.current.rotation.x = damp(body.current.rotation.x, swimPitch, 6, dt);
      body.current.position.set(
        player.pos.x,
        player.pos.y + bob,
        player.pos.z,
      );
      // shortest-path yaw smoothing
      let diff = player.yaw - body.current.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      body.current.rotation.y += diff * (1 - Math.exp(-12 * dt));
    }
    if (head.current)
      head.current.rotation.y = speed > 0 ? 0 : Math.sin(t * 0.42) * 0.18;

    // ---- walking legs ---------------------------------------------------
    // swimming: continuous flutter kick, slightly wider than the walk cycle
    st.walk += player.swimming ? dt * 7 : 0;
    const legSwing = player.swimming
      ? Math.sin(st.walk * 1.6) * 0.5
      : speed > 0
        ? Math.sin(st.walk) * 0.75
        : 0;
    // seated driver pose: thighs swing forward so the angler sits on the bench
    const seatSwing = boat.riding ? -1.45 : 0;
    const targetL = boat.riding ? seatSwing : legSwing;
    const targetR = boat.riding ? seatSwing : -legSwing;
    if (legL.current) legL.current.rotation.x = damp(legL.current.rotation.x, targetL, 12, dt);
    if (legR.current) legR.current.rotation.x = damp(legR.current.rotation.x, targetR, 12, dt);
    if (legL.current) legL.current.rotation.z = damp(legL.current.rotation.z, boat.riding ? 0.12 : 0, 12, dt);
    if (legR.current) legR.current.rotation.z = damp(legR.current.rotation.z, boat.riding ? -0.12 : 0, 12, dt);

    let armR = -0.35; // shoulder pitch (+ = arm swings back, - = forward)
    let armRZ = 0; // right shoulder roll (+ = moves the hand inward toward center)
    let armL = -0.15;
    let armLZ = 0; // left shoulder roll (negative = reaches in toward the rod)
    let crankAngle = 0; // reel handle spin
    // rodAbs = rod tilt in BODY space: 0 = straight up, + = tipped forward (+Z),
    // - = laid back over the shoulder. It is converted to a local rotation
    // relative to the arm and torso. The face is also modeled on +Z, so a
    // positive released/settled rodAbs can never point behind the avatar.
    let rodAbs = 0.5;
    let rodRoll = 0; // sideways tilt (used for the shoulder-carry pose)
    let bend = 0;
    let lean = 0;

    // ---- phase logic --------------------------------------------------
    if (st.phase === "cast") {
      const p = st.t;
      if (p < 0.3) {
        // 1) unstow from the shoulder into a vertical "ready" pose
        const k = p / 0.3;
        const e = k * k * (3 - 2 * k);
        armR = lerp(-1.35, -0.4, e);
        rodAbs = lerp(-1.15, 0.15, e);
        rodRoll = lerp(-0.35, 0, e);
        lean = lerp(0, 0.06, e);
      } else if (p < 0.5) {
        // 2) SHORT backswing: just a little past vertical, never into the arm
        const k = (p - 0.3) / 0.2;
        const e = k * k * (3 - 2 * k);
        armR = lerp(-0.4, -0.05, e);
        rodAbs = lerp(0.15, -0.4, e);
        bend = -e * 0.18;
        lean = lerp(0.06, 0.16, e);
      } else if (p < 0.78) {
        // 3) whip forward
        const k = (p - 0.5) / 0.28;
        const e = 1 - Math.pow(1 - k, 3);
        armR = lerp(-0.05, -1.0, e);
        rodAbs = lerp(-0.4, 1.05, e);
        bend = Math.sin(k * Math.PI) * 0.6;
        lean = lerp(0.16, -0.16, e);

      } else {
        // 3) settle: rod pointing out over the water
        const k = Math.min((p - 0.78) / 0.5, 1);
        armR = lerp(-1.0, -0.55, k);
        rodAbs = lerp(1.05, 0.55, k);
        lean = lerp(-0.16, 0, k);
      }
      // left hand joins the rod as the cast settles
      const grip = Math.min(Math.max((p - 0.7) / 0.3, 0), 1);
      armRZ = lerp(0, 0.38, grip);
      armL = lerp(-0.5, -1.15, grip);
      armLZ = lerp(-0.1, -0.55, grip);



      // bobber flight starts at the whip release
      if (p >= 0.66) {
        const fk = Math.min((p - 0.66) / 0.75, 1);

        if (!st.whizzed) {
          st.whizzed = true;
          playCastWhizz(0.75);
        }
        if (fk === 0) st.from.copy(st.bobber);
        st.bobber.lerpVectors(st.from, st.to, fk);
        st.bobber.y += Math.sin(fk * Math.PI) * 6.5;
        if (fk >= 1) {
          st.phase = "waiting";
          st.t = 0;
          st.biteAt = 2 + Math.random() * 4;
          st.splashT = 0;
          st.splashAt.copy(st.bobber);
          setPhase("waiting");
          setMessage("Waiting for a bite...");
          playBobberSplash(1);
        }
      } else {
        // rod tip carries the bobber before release
        if (rodTip.current) {
          rodTip.current.getWorldPosition(tipWorld);
          st.bobber.copy(tipWorld);
          st.from.copy(tipWorld);
        }
      }
    } else if (st.phase === "waiting") {
      // after the cast: both hands on the rod, left hand resting on the reel
      armR = -0.55 + Math.sin(t * 1.2) * 0.02;
      armRZ = 0.38;
      rodAbs = 0.55;
      armL = -1.15;
      armLZ = -0.55;
      st.bobber.y = waterHeight(st.bobber.x, st.bobber.z, t) + 0.18 + Math.sin(t * 2.2) * 0.06;
      if (st.t > st.biteAt) {
        st.phase = "bite";
        st.t = 0;
        st.fish = rollFish(useWeather.getState().kind);
        setPhase("bite");
        setMessage("FISH ON! Press SPACE / ENTER now!");
      }
    } else if (st.phase === "bite") {
      // bobber yanked under, rod tip loaded
      const dip = Math.abs(Math.sin(st.t * 9)) * 0.75;
      st.bobber.y = waterHeight(st.bobber.x, st.bobber.z, t) + 0.18 - dip;
      st.bobber.x += Math.sin(st.t * 11) * 0.02;
      bend = 0.18 + Math.sin(st.t * 9) * 0.12;
      armR = -0.45;
      armRZ = 0.38;
      rodAbs = 0.42;
      lean = -0.05;
      armL = -1.2;
      armLZ = -0.55;

      if (st.t > biteWindowFor(useWeather.getState().kind)) {
        st.phase = "idle";
        st.t = 0;
        st.fish = null;
        setPhase("idle");
        setMessage("It got away! Cast again.");
      }
    } else if (st.phase === "reel") {
      const isMonsterFight = !!st.fish?.isMonster;
      // monster raksasa: perlawanan panjang sebelum bisa diangkat
      const reelDur = isMonsterFight ? 5.5 : 1.5;
      const k = Math.min(st.t / reelDur, 1);
      // fighting: rod high and bent, character leans back
      armR = lerp(-0.45, -1.1, Math.min(k * 2, 1));
      armRZ = 0.38;
      rodAbs = lerp(0.42, -0.55, Math.min(k * 2, 1)) + Math.sin(st.t * 7) * 0.08;

      bend = 0.75 - k * 0.2 + Math.sin(st.t * 8) * 0.1;
      lean = -0.28 + Math.sin(st.t * 6) * 0.05;
      // left hand cranks the reel: small circle traced by the shoulder joint
      const crank = st.t * 11;
      crankAngle = crank;
      armL = -1.15 + Math.sin(crank) * 0.16;
      armLZ = -0.55 + Math.cos(crank) * 0.14;

      if (isMonsterFight) {
        // ---- PERLAWANAN MONSTER: umpan TETAP di titik lemparan, monster
        // sepenuhnya tersembunyi di bawah air, mulut tepat di umpan ----
        const dirA = Math.atan2(st.to.z - player.pos.z, st.to.x - player.pos.x);
        const yaw = Math.PI - dirA; // kepala (+X lokal) menghadap pemain
        const surf = waterHeight(st.to.x, st.to.z, t);
        const jerk = Math.sin(st.t * 1.05); // sentakan maju-mundur
        st.bobber.set(
          st.to.x + Math.cos(dirA) * jerk * 0.6 + Math.sin(st.t * 9) * 0.25,
          surf - 0.9 - Math.abs(Math.sin(st.t * 5)) * 0.6,
          st.to.z + Math.sin(dirA) * jerk * 0.6 + Math.cos(st.t * 7) * 0.25,
        );
        st.monsterRot.set(0, yaw, 0.08 + Math.sin(st.t * 2.4) * 0.1);
        // pusat monster = umpan - offset mulut (monster di belakang umpan, menjauhi pemain)
        st.monsterPos
          .copy(MONSTER_MOUTH)
          .applyEuler(st.monsterRot)
          .multiplyScalar(-1)
          .add(st.bobber);
        st.monsterPos.y = surf - 12;
        // joran melengkung lebih ekstrem & badan tersentak saat monster surge
        bend = 0.95 + Math.sin(st.t * 3) * 0.18;
        lean = -0.35 + Math.sin(st.t * 2.6) * 0.09;
        rodAbs += Math.sin(st.t * 3.1) * 0.12;
        // getar layar selama perlawanan: mengikuti sentakan, memuncak di akhir
        if (camera) {
          const ramp = st.t > reelDur - 0.8 ? (st.t - (reelDur - 0.8)) / 0.8 : 0;
          const amp = 0.12 + 0.25 * Math.abs(jerk) + ramp * 0.35;
          camera.position.x += (Math.random() - 0.5) * amp;
          camera.position.y += (Math.random() - 0.5) * amp;
          camera.position.z += (Math.random() - 0.5) * amp;
        }
        // cipratan berulang di titik umpan
        if (st.splashT > 0.35) {
          st.splashT = 0;
          st.splashAt.set(st.to.x, surf, st.to.z);
        }
      } else {
        // ikan melawan DI TEMPAT sambaran — tidak digeser mendekati pemain;
        // hanya bergejolak kecil di sekitar titik kail
        st.bobber.x = st.to.x + Math.sin(st.t * 14) * 0.45 * (1 - k * 0.5);
        st.bobber.z = st.to.z + Math.cos(st.t * 11) * 0.45 * (1 - k * 0.5);
        st.bobber.y =
          waterHeight(st.to.x, st.to.z, t) - 0.25 + Math.abs(Math.sin(st.t * 9)) * 0.35;
        // cipratan fight berulang di titik sambaran
        if (st.splashT > 0.45) {
          st.splashT = 0;
          st.splashAt.copy(st.bobber);
        }
      }
      if (k >= 1) {
        st.phase = "caught";
        st.t = 0;
        st.splashT = 0;
        if (isMonsterFight) {
          // Mulai tarikan tepat dari permukaan di titik sambaran. Monster baru
          // ditampilkan pada fase caught, lalu langsung menerobos ke atas.
          const surface = waterHeight(st.to.x, st.to.z, t);
          st.from.set(st.to.x, surface, st.to.z);
          st.bobber.copy(st.from);
          st.splashAt.copy(st.from);
        } else {
          st.from.copy(st.bobber);
          st.splashAt.copy(st.bobber);
        }
        setPhase("caught");
        stopReelSound();
        playBobberSplash(1.6);
        if (st.fish) {
          landFish(st.fish);
          setMessage(`Caught ${st.fish.name} — ${st.fish.weight} kg!`);
        }
      }

    } else if (st.phase === "caught") {
      const isMonster = !!st.fish?.isMonster;
      if (isMonster) {
        // ---------- EPIC MONSTER LIFT ----------
        const dur = 1.5;
        const kk = Math.min(st.t / dur, 1);
        const e = 1 - Math.pow(1 - kk, 3); // fast-out, then hold

        // Tarikan awal lurus ke atas dari titik umpan, lalu melayang ke
        // DEPAN pemain (di antara titik umpan dan pemain) untuk pose kemenangan.
        const start = tmp.copy(st.from);
        const liftEnd = tmp2.set(start.x, start.y + 28, start.z);
        const finish = tmp3.set(
          lerp(player.pos.x, st.to.x, 0.6),
          player.pos.y + 18,
          lerp(player.pos.z, st.to.z, 0.6),
        );
        if (kk < 0.62) {
          const liftK = 1 - Math.pow(1 - kk / 0.62, 3);
          st.bobber.lerpVectors(start, liftEnd, liftK);
        } else {
          const triumphK = (kk - 0.62) / 0.38;
          st.bobber.lerpVectors(liftEnd, finish, triumphK);
        }

        // pusat monster ditempatkan dari mulut: mulut selalu di ujung senar
        {
          const dirA = Math.atan2(st.bobber.z - player.pos.z, st.bobber.x - player.pos.x);
          st.monsterRot.set(
            0,
            Math.PI - dirA,
            0.15 + kk * 0.85 + Math.sin(t * 3) * 0.06,
          );
          st.monsterPos
            .copy(MONSTER_MOUTH)
            .applyEuler(st.monsterRot)
            .multiplyScalar(-1)
            .add(st.bobber);
        }

        // efek cosmic burst di titik monster menembus permukaan air
        if (burst.current) {
          const kb = Math.min(st.t / 1.45, 1);
          burst.current.visible = kb < 1;
          burst.current.position.set(st.from.x, st.from.y + 0.25, st.from.z);
          animateBurst(burst.current, kb, t);
        }


        // rod bent to the limit, character leans way back
        armR = lerp(-1.1, -2.0, Math.min(kk * 2.2, 1));
        armRZ = lerp(0.38, 0.1, Math.min(kk * 1.8, 1));
        rodAbs = lerp(-0.55, -1.35, Math.min(kk * 2.2, 1));
        bend = 1.05 - kk * 0.25 + Math.sin(t * 12) * 0.12;
        lean = lerp(-0.28, -0.6, Math.min(kk * 1.8, 1));
        armL = lerp(-1.0, -1.75, Math.min(kk * 1.8, 1));
        armLZ = lerp(-0.55, -0.05, Math.min(kk * 1.8, 1));

        // screen shake while the monster is in the air
        if (camera && kk < 0.92) {
          const shake = (1 - kk) * 0.55;
          camera.position.x += (Math.random() - 0.5) * shake;
          camera.position.y += (Math.random() - 0.5) * shake;
          camera.position.z += (Math.random() - 0.5) * shake;
        }

        // extra splash when the monster breaches the surface
        if (kk > 0.12 && kk < 0.18 && st.splashT > 0.4) {
          st.splashT = 0;
          st.splashAt.copy(st.bobber);
        }

        if (kk >= 1) {
          st.phase = "idle";
          st.t = 0;
          setPhase("idle");
          setMessage("Ancient Leviathan caught! Press ENTER / left click to cast again.");
        }
      } else {
        // ---------- normal fish caught (unchanged) ----------
        const k = Math.min(st.t / 1.9, 1);
        // triumphant lift: rod raised, fish swings up in an arc
        armR = lerp(-1.1, -1.7, Math.min(k * 3, 1));
        armRZ = lerp(0.38, 0.18, Math.min(k * 2, 1));
        rodAbs = lerp(-0.55, -0.85, Math.min(k * 3, 1));

        bend = 0.45 * (1 - k * 0.5);
        lean = lerp(-0.28, 0.1, Math.min(k * 2, 1)) + Math.sin(t * 8) * 0.02 * (1 - k);
        armL = lerp(-1.0, -1.6, Math.min(k * 2, 1));
        armLZ = lerp(-0.55, -0.1, Math.min(k * 2, 1));

        if (rodTip.current) {
          rodTip.current.getWorldPosition(tipWorld);
          tmp.copy(tipWorld);
          tmp.y -= 1.6;
          if (st.t < 0.7) {
            // 1) tarik lurus ke atas: ikan terangkat vertikal dari air mengikuti
            //    senar, tanpa bergerak horizontal mendekati pemain
            const kk = st.t / 0.7;
            const e = 1 - Math.pow(1 - kk, 3);
            st.bobber.x = st.to.x;
            st.bobber.z = st.to.z;
            st.bobber.y = lerp(
              waterHeight(st.to.x, st.to.z, t) - 0.2,
              tmp.y,
              e,
            );
          } else {
            // 2) ikan di udara mengikuti ujung joran yang diangkat
            st.bobber.lerp(tmp, 1 - Math.exp(-6 * dt));
          }
        }
        if (k >= 1) {
          st.phase = "idle";
          st.t = 0;
          setPhase("idle");
          setMessage("Press ENTER / left click to cast again");
        }
      }
    } else {
      // idle: rod carried on the shoulder/back, line reeled in near the tip
      if (rodTip.current) {
        rodTip.current.getWorldPosition(tipWorld);
        tmp.copy(tipWorld);
        tmp.y -= 0.6;
        st.bobber.lerp(tmp, 1 - Math.exp(-5 * dt));
      }
      // hand raised to the shoulder, rod laid back diagonally behind the head
      armR = -1.35 + (speed > 0 ? 0 : Math.sin(t * 1.3) * 0.03);
      armL = -0.15;
      armLZ = 0;
      rodAbs = -1.15;
      rodRoll = -0.35;
    }

    // ---- lepas / pakai joran -------------------------------------------
    const stowed = useGameStore.getState().rodStowed && st.phase === "idle";
    if (rod.current && stowed !== stowedNow.current) {
      stowedNow.current = stowed;
      const target = stowed ? backAnchor.current : handAnchor.current;
      if (target && rod.current.parent !== target) target.add(rod.current);
      rod.current.position.set(0, 0, 0);
    }
    if (stowed) {
      // joran tersampir menyilang di punggung: lengan bebas seperti berjalan
      armR = -0.35 + (speed > 0 ? legSwing * 0.55 : Math.sin(t * 1.3) * 0.03);
      armRZ = 0;
      armL = -0.15;
      armLZ = 0;
      bend = 0;
    }

    // ---- apply pose (smoothed) ----------------------------------------
    if (speed > 0) {
      armL += -legSwing * 0.55;
    }
    if (rightArm.current) {
      rightArm.current.rotation.x = damp(rightArm.current.rotation.x, armR, 16, dt);
      rightArm.current.rotation.z = damp(rightArm.current.rotation.z, armRZ, 14, dt);
    }
    if (leftArm.current) {
      leftArm.current.rotation.x = damp(leftArm.current.rotation.x, armL, 12, dt);
      leftArm.current.rotation.z = damp(leftArm.current.rotation.z, armLZ, 12, dt);
    }
    if (reelCrank.current) reelCrank.current.rotation.y = crankAngle;
    if (torso.current) torso.current.rotation.x = damp(torso.current.rotation.x, lean, 10, dt);
    if (rod.current) {
      if (stowed) {
        // pose joran ditentukan oleh anchor punggung
        rod.current.rotation.x = damp(rod.current.rotation.x, 0, 14, dt);
        rod.current.rotation.z = damp(rod.current.rotation.z, 0, 14, dt);
      } else {
        // convert torso-space rod tilt into a local rotation relative to the arm
        const shoulder = rightArm.current ? rightArm.current.rotation.x : armR;
        const spine = torso.current ? torso.current.rotation.x : lean;
        rod.current.rotation.x = damp(
          rod.current.rotation.x,
          rodAbs - shoulder - spine,
          18,
          dt,
        );
        // Counter-rotate the child rod so moving the right hand inward does not
        // alter the rod's established sideways angle.
        const shoulderRoll = rightArm.current ? rightArm.current.rotation.z : armRZ;
        rod.current.rotation.z = damp(rod.current.rotation.z, rodRoll - shoulderRoll, 16, dt);
      }
    }

    if (rodBend.current) rodBend.current.rotation.x = damp(rodBend.current.rotation.x, bend, 14, dt);

    // sembunyikan senar & pelampung saat joran dilepas
    lineObj.visible = !stowed;



    // ---- bobber + hooked fish ------------------------------------------
    if (bobber.current) {
      bobber.current.position.copy(st.bobber);
      bobber.current.visible = st.phase !== "caught" && !stowed;
    }
    const isMonster = !!st.fish?.isMonster;
    if (hooked.current) {
      const show = (st.phase === "reel" || st.phase === "caught") && !isMonster;
      hooked.current.visible = show;
      if (show) {
        hooked.current.position.copy(st.bobber);
        hooked.current.position.y -= 0.35;
        if (st.phase === "reel") {
          hooked.current.rotation.set(Math.sin(t * 18) * 0.35, Math.PI, Math.sin(t * 14) * 0.5);
        } else {
          // dangling and flopping in the air
          hooked.current.rotation.set(0, Math.PI * 0.5, -Math.PI / 2 + Math.sin(t * 12) * 0.55);
        }
      }
    }
    // ---- monster raksasa: diangkat epik mengikuti senar ----------
    if (monster.current) {
      // Selama perlawanan hanya senar dan cipratan yang terlihat. Monster
      // muncul tepat ketika fase angkat dimulai.
      const showM = st.phase === "caught" && isMonster;
      monster.current.visible = showM;
      if (showM) {
        // posisi & rotasi sudah dihitung di fase reel/caught agar mulut
        // selalu menempel tepat di ujung senar
        monster.current.position.copy(st.monsterPos);
        monster.current.rotation.copy(st.monsterRot);
      }

    }

    // ---- fishing line: spool -> guide rings -> rod tip -> catenary ke bobber
    if (rodTip.current) {
      rodTip.current.getWorldPosition(tipWorld);
      const pos = lineObj.geometry.getAttribute("position") as THREE.BufferAttribute;
      let idx = 0;
      // Segmen yang menempel di batang: ikut animasi lentur joran secara real-time
      for (let g = 0; g < GUIDE_COUNT; g++) {
        const node = guideRefs.current[g];
        if (node) {
          node.getWorldPosition(tmp);
          pos.setXYZ(idx, tmp.x, tmp.y, tmp.z);
        } else {
          pos.setXYZ(idx, tipWorld.x, tipWorld.y, tipWorld.z);
        }
        idx++;
      }
      pos.setXYZ(idx, tipWorld.x, tipWorld.y, tipWorld.z);
      idx++;
    const sag =
      st.phase === "reel" || st.phase === "bite" ||
      (st.phase === "caught" && !!st.fish?.isMonster)
        ? 0.12
        : 0.8;
      for (let i = 0; i < CURVE_SEGS; i++) {
        const k = (i + 1) / CURVE_SEGS;
        const x = lerp(tipWorld.x, st.bobber.x, k);
        const y = lerp(tipWorld.y, st.bobber.y, k) - Math.sin(k * Math.PI) * sag;
        const z = lerp(tipWorld.z, st.bobber.z, k);
        pos.setXYZ(idx, x, y, z);
        idx++;
      }
      pos.needsUpdate = true;
    }


    // ---- splash particles ------------------------------------------------
    st.splashT += dt;
    if (splash.current) {
      const life = st.splashT / 0.85;
      splash.current.visible = life < 1;
      if (life < 1) {
        splash.current.position.set(st.splashAt.x, 0, st.splashAt.z);
        splash.current.children.forEach((c, i) => {
          const a = (i / splash.current!.children.length) * Math.PI * 2;
          const r = life * 1.9;
          c.position.set(Math.cos(a) * r, Math.sin(life * Math.PI) * 1.7 - life * 0.3, Math.sin(a) * r);
          const sc = Math.max(0.001, (1 - life) * 0.3);
          c.scale.setScalar(sc);
        });
      }
    }
  });

  const skin = "#f2c48a";
  const shirt = "#2f6fd0";
  const pants = "#2a3140";

  return (
    <group>
      <group ref={body} position={[player.pos.x, player.pos.y, player.pos.z]}>
        <group ref={torso}>
          {/* legs (hip-pivoted for the walk cycle) */}
          <group ref={legL} position={[-0.52, 1.8, 0]}>
            <mesh position={[0, -0.9, 0]} castShadow>
              <boxGeometry args={[0.95, 1.8, 0.95]} />
              <meshStandardMaterial color={pants} roughness={0.85} />
            </mesh>
          </group>
          <group ref={legR} position={[0.52, 1.8, 0]}>
            <mesh position={[0, -0.9, 0]} castShadow>
              <boxGeometry args={[0.95, 1.8, 0.95]} />
              <meshStandardMaterial color={pants} roughness={0.85} />
            </mesh>
          </group>
          {/* torso */}
          <mesh position={[0, 2.7, 0]} castShadow>
            <boxGeometry args={[2, 1.8, 1]} />
            <meshStandardMaterial color={shirt} roughness={0.8} />
          </mesh>
          {/* anchor punggung: joran menyilang di belakang badan saat dilepas */}
          <group ref={backAnchor} position={[-0.62, 1.85, -0.66]} rotation={[-0.2, 0, -0.5]} />
          {/* tali sandang joran */}
          <mesh position={[0, 2.85, -0.52]} rotation={[0, 0, -0.5]} castShadow>
            <boxGeometry args={[0.18, 2.4, 0.12]} />
            <meshStandardMaterial color="#3a2a1c" roughness={0.95} />
          </mesh>
          {/* head */}
          <group ref={head} position={[0, 4.25, 0]}>
            <mesh castShadow>
              <boxGeometry args={[1.25, 1.25, 1.25]} />
              <meshStandardMaterial color={skin} roughness={0.75} />
            </mesh>
            {[-0.3, 0.3].map((x) => (
              <mesh key={x} position={[x, 0.12, 0.64]}>
                <boxGeometry args={[0.18, 0.24, 0.04]} />
                <meshStandardMaterial color="#1a1d22" />
              </mesh>
            ))}
            <mesh position={[0, -0.22, 0.64]}>
              <boxGeometry args={[0.5, 0.1, 0.04]} />
              <meshStandardMaterial color="#1a1d22" />
            </mesh>
            {/* bucket hat */}
            <mesh position={[0, 0.72, 0]} castShadow>
              <cylinderGeometry args={[0.62, 0.72, 0.42, 12]} />
              <meshStandardMaterial color="#d8b25c" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.53, 0]} castShadow>
              <cylinderGeometry args={[1.05, 1.05, 0.08, 14]} />
              <meshStandardMaterial color="#c9a24d" roughness={0.9} />
            </mesh>
          </group>

          {/* left arm (character's left = +X side) */}
          <group ref={leftArm} position={[1.5, 3.5, 0]}>
            <mesh position={[0, -0.85, 0]} castShadow>
              <boxGeometry args={[0.9, 1.8, 0.9]} />
              <meshStandardMaterial color={skin} roughness={0.75} />
            </mesh>
          </group>

          {/* right arm + rod (character's right = -X side) */}
          <group ref={rightArm} position={[-1.5, 3.5, 0]}>

            <mesh position={[0, -0.85, 0]} castShadow>
              <boxGeometry args={[0.9, 1.8, 0.9]} />
              <meshStandardMaterial color={skin} roughness={0.75} />
            </mesh>

            <group ref={handAnchor} position={[0, -1.6, 0.2]}>
            <group ref={rod}>
              {/* grip */}
              <mesh position={[0, 0.35, 0]} castShadow>
                <cylinderGeometry args={[0.13, 0.15, 1.1, 8]} />
                <meshStandardMaterial color="#5d3a22" roughness={1} />
              </mesh>
              {/* reel */}
              <mesh position={[0.28, 0.75, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.24, 0.24, 0.28, 12]} />
                <meshStandardMaterial color="#b9c1c8" metalness={0.7} roughness={0.3} />
              </mesh>
              {/* reel crank handle (spins while reeling) */}
              <group ref={reelCrank} position={[0.44, 0.75, 0]} rotation={[0, 0, Math.PI / 2]}>
                <mesh position={[0, 0, 0.18]} castShadow>
                  <boxGeometry args={[0.06, 0.06, 0.36]} />
                  <meshStandardMaterial color="#e0b64a" metalness={0.6} roughness={0.4} />
                </mesh>
                <mesh position={[0.1, 0, 0.34]} castShadow>
                  <cylinderGeometry args={[0.07, 0.07, 0.2, 8]} />
                  <meshStandardMaterial color="#3a2a1c" roughness={0.9} />
                </mesh>
              </group>
              {/* titik keluar senar dari spool reel */}
              <object3D ref={(o) => (guideRefs.current[0] = o)} position={[0.2, 0.9, 0]} />
              {/* flexible upper blank */}
              <group ref={rodBend} position={[0, 0.9, 0]}>
                <mesh position={[0, 1.5, 0]} castShadow>
                  <cylinderGeometry args={[0.055, 0.1, 3, 8]} />
                  <meshStandardMaterial color="#22303c" roughness={0.5} />
                </mesh>
                {/* ring guide bawah */}
                <group position={[0.12, 1.0, 0]}>
                  <object3D ref={(o) => (guideRefs.current[1] = o)} />
                  <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <torusGeometry args={[0.055, 0.016, 6, 10]} />
                    <meshStandardMaterial color="#b9c1c8" metalness={0.7} roughness={0.35} />
                  </mesh>
                </group>
                <group position={[0.1, 2.2, 0]}>
                  <object3D ref={(o) => (guideRefs.current[2] = o)} />
                  <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                    <torusGeometry args={[0.048, 0.014, 6, 10]} />
                    <meshStandardMaterial color="#b9c1c8" metalness={0.7} roughness={0.35} />
                  </mesh>
                </group>
                <group position={[0, 3, 0]} rotation-x={0.22}>
                  <mesh position={[0, 1.1, 0]} castShadow>
                    <cylinderGeometry args={[0.025, 0.055, 2.2, 8]} />
                    <meshStandardMaterial color="#2c3d4c" roughness={0.5} />
                  </mesh>
                  <group position={[0.08, 0.8, 0]}>
                    <object3D ref={(o) => (guideRefs.current[3] = o)} />
                    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <torusGeometry args={[0.04, 0.012, 6, 10]} />
                      <meshStandardMaterial color="#b9c1c8" metalness={0.7} roughness={0.35} />
                    </mesh>
                  </group>
                  <group position={[0.06, 1.7, 0]}>
                    <object3D ref={(o) => (guideRefs.current[4] = o)} />
                    <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                      <torusGeometry args={[0.034, 0.01, 6, 10]} />
                      <meshStandardMaterial color="#b9c1c8" metalness={0.7} roughness={0.35} />
                    </mesh>
                  </group>

                  <object3D ref={rodTip} position={[0, 2.2, 0]} />
                </group>
              </group>
            </group>
            </group>
          </group>
        </group>
      </group>

      {/* line */}
      <primitive object={lineObj} />

      {/* bobber */}
      <group ref={bobber}>
        <mesh castShadow>
          <sphereGeometry args={[0.2, 12, 12]} />
          <meshStandardMaterial color="#e2402f" roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.14, 0]}>
          <sphereGeometry args={[0.2, 12, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
          <meshStandardMaterial color="#f7f7f2" roughness={0.4} />
        </mesh>
      </group>

      {/* hooked fish */}
      <group ref={hooked} visible={false}>
        <FishMesh color="#e8a04a" scale={1.25} wagSpeed={18} />
      </group>

      {/* monster raksasa saat tertangkap */}
      <group ref={monster} visible={false}>
        <MonsterFishMesh scale={MONSTER_SCALE} jawOpen={0.85} wagSpeed={1.4} />
      </group>

      {/* splash */}
      <group ref={splash} visible={false}>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshStandardMaterial color="#eaf7ff" transparent opacity={0.85} />
          </mesh>
        ))}
      </group>

      {/* cosmic burst saat monster menerobos */}
      <group ref={burst} visible={false}>
        <MonsterBurstMesh />
      </group>
    </group>
  );
}