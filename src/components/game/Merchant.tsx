import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { player, groundHeight } from "@/hooks/usePlayer";
import { MERCHANT_POS, MERCHANT_TALK_DIST, useMerchant } from "@/hooks/useMerchant";

/**
 * Fish Merchant NPC standing in front of the FISHSHOP stall.
 * Blocky Roblox-style (R6) character built from boxes, wearing a merchant
 * apron + vest, with a smiling face drawn on a canvas texture.
 */
const MERCHANT_SCALE = 2.5;
/** small lift so the NPC reads clearly above the ground/deck */
const MERCHANT_LIFT = 0.18;

const SKIN = "#f2c14e";
const SHIRT = "#2f7f8f";
const PANTS = "#3b4a63";
const APRON = "#e8e2d2";

/** Roblox-like smiling face: two eyes + a wide grin on a transparent canvas. */
function useFaceTexture() {
  return useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#1b1b1b";
    // eyes
    ctx.beginPath();
    ctx.ellipse(88, 100, 16, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(168, 100, 16, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    // eye shine
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(83, 92, 5, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(163, 92, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // smile
    ctx.strokeStyle = "#1b1b1b";
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(128, 140, 46, 0.18 * Math.PI, 0.82 * Math.PI);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }, []);
}

export function Merchant() {
  const group = useRef<THREE.Group>(null);
  const [prompt, setPrompt] = useState(false);
  const open = useMerchant((s) => s.open);
  const [x, z] = MERCHANT_POS;
  const face = useFaceTexture();
  // The island colliders stream in after mount, so re-sample the ground for a
  // few seconds instead of trusting the very first (water-level) reading.
  const y = useRef(groundHeight(x, z) + MERCHANT_LIFT);
  const settle = useRef(0);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat) return;
      const st = useMerchant.getState();
      if (st.open) {
        st.setOpen(false);
      } else if (st.near) {
        e.preventDefault();
        st.setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useFrame((state) => {
    const near =
      Math.hypot(player.pos.x - x, player.pos.z - z) < MERCHANT_TALK_DIST;
    if (near !== useMerchant.getState().near) useMerchant.getState().setNear(near);
    if (near !== prompt) setPrompt(near);

    const g = group.current;
    if (!g) return;
    if (settle.current < 300) {
      settle.current += 1;
      y.current = groundHeight(x, z) + MERCHANT_LIFT;
    }
    // gentle idle bob + face the player when they come close
    g.position.y = y.current + Math.sin(state.clock.elapsedTime * 1.6) * 0.03;
    if (near) {
      g.rotation.y = Math.atan2(player.pos.x - x, player.pos.z - z);
    }
  });

  return (
    <group ref={group} position={[x, y.current, z]} scale={MERCHANT_SCALE}>
      {/* legs (blocky) */}
      <mesh position={[-0.14, 0.32, 0]} castShadow>
        <boxGeometry args={[0.22, 0.64, 0.24]} />
        <meshStandardMaterial color={PANTS} roughness={0.9} />
      </mesh>
      <mesh position={[0.14, 0.32, 0]} castShadow>
        <boxGeometry args={[0.22, 0.64, 0.24]} />
        <meshStandardMaterial color={PANTS} roughness={0.9} />
      </mesh>

      {/* torso */}
      <mesh position={[0, 0.98, 0]} castShadow>
        <boxGeometry args={[0.52, 0.6, 0.28]} />
        <meshStandardMaterial color={SHIRT} roughness={0.8} />
      </mesh>
      {/* merchant apron */}
      <mesh position={[0, 0.9, 0.155]} castShadow>
        <boxGeometry args={[0.42, 0.5, 0.04]} />
        <meshStandardMaterial color={APRON} roughness={0.95} />
      </mesh>
      {/* apron pocket */}
      <mesh position={[0, 0.78, 0.185]}>
        <boxGeometry args={[0.26, 0.14, 0.02]} />
        <meshStandardMaterial color="#c9bfa6" roughness={0.95} />
      </mesh>
      {/* vest panels */}
      <mesh position={[-0.2, 1.02, 0.15]}>
        <boxGeometry args={[0.12, 0.52, 0.04]} />
        <meshStandardMaterial color="#8c5a3c" roughness={0.85} />
      </mesh>
      <mesh position={[0.2, 1.02, 0.15]}>
        <boxGeometry args={[0.12, 0.52, 0.04]} />
        <meshStandardMaterial color="#8c5a3c" roughness={0.85} />
      </mesh>

      {/* arms */}
      <mesh position={[-0.36, 0.96, 0]} castShadow>
        <boxGeometry args={[0.18, 0.6, 0.22]} />
        <meshStandardMaterial color={SKIN} roughness={0.85} />
      </mesh>
      <mesh position={[0.36, 0.96, 0]} castShadow>
        <boxGeometry args={[0.18, 0.6, 0.22]} />
        <meshStandardMaterial color={SKIN} roughness={0.85} />
      </mesh>

      {/* head (blocky) + smiling face on the front */}
      <mesh position={[0, 1.52, 0]} castShadow>
        <boxGeometry args={[0.42, 0.38, 0.38]} />
        <meshStandardMaterial color={SKIN} roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.53, 0.191]}>
        <planeGeometry args={[0.4, 0.36]} />
        <meshBasicMaterial map={face} transparent />
      </mesh>

      {/* straw merchant hat */}
      <mesh position={[0, 1.74, 0]} castShadow>
        <cylinderGeometry args={[0.42, 0.44, 0.05, 20]} />
        <meshStandardMaterial color="#e0a83c" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.83, 0]} castShadow>
        <cylinderGeometry args={[0.23, 0.26, 0.2, 20]} />
        <meshStandardMaterial color="#e0a83c" roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.77, 0]}>
        <cylinderGeometry args={[0.265, 0.265, 0.05, 20]} />
        <meshStandardMaterial color="#8c5a3c" roughness={0.8} />
      </mesh>

      {prompt && !open && (
        <Html position={[0, 2.2, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-full border border-white/30 bg-slate-900/70 px-3 py-1 text-[13px] font-semibold text-slate-50 shadow-lg backdrop-blur-sm">
            Press E to talk
          </div>
        </Html>
      )}
    </group>
  );
}
