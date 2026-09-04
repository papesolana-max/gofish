import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { player, groundHeight } from "@/hooks/usePlayer";
import { MERCHANT_POS, MERCHANT_TALK_DIST, useMerchant } from "@/hooks/useMerchant";

/**
 * Fish Merchant NPC standing in front of the FISHSHOP stall. Built from
 * primitives so no extra model download is needed.
 */
export function Merchant() {
  const group = useRef<THREE.Group>(null);
  const [prompt, setPrompt] = useState(false);
  const open = useMerchant((s) => s.open);
  const [x, z] = MERCHANT_POS;
  // The island colliders stream in after mount, so re-sample the ground for a
  // few seconds instead of trusting the very first (water-level) reading.
  const y = useRef(groundHeight(x, z));
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
      y.current = groundHeight(x, z);
    }
    // gentle idle bob + face the player when they come close
    g.position.y = y.current + Math.sin(state.clock.elapsedTime * 1.6) * 0.03;
    if (near) {
      g.rotation.y = Math.atan2(player.pos.x - x, player.pos.z - z);
    }
  });

  return (
    <group ref={group} position={[x, y.current, z]}>
      {/* legs */}
      <mesh position={[-0.16, 0.42, 0]} castShadow>
        <capsuleGeometry args={[0.11, 0.6, 4, 8]} />
        <meshStandardMaterial color="#3b4a63" roughness={0.9} />
      </mesh>
      <mesh position={[0.16, 0.42, 0]} castShadow>
        <capsuleGeometry args={[0.11, 0.6, 4, 8]} />
        <meshStandardMaterial color="#3b4a63" roughness={0.9} />
      </mesh>
      {/* apron / torso */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.66, 6, 12]} />
        <meshStandardMaterial color="#2f7f8f" roughness={0.75} />
      </mesh>
      {/* arms */}
      <mesh position={[-0.4, 1.2, 0.02]} rotation={[0, 0, 0.32]} castShadow>
        <capsuleGeometry args={[0.09, 0.5, 4, 8]} />
        <meshStandardMaterial color="#2f7f8f" roughness={0.8} />
      </mesh>
      <mesh position={[0.4, 1.2, 0.02]} rotation={[0, 0, -0.32]} castShadow>
        <capsuleGeometry args={[0.09, 0.5, 4, 8]} />
        <meshStandardMaterial color="#2f7f8f" roughness={0.8} />
      </mesh>
      {/* head */}
      <mesh position={[0, 1.72, 0]} castShadow>
        <sphereGeometry args={[0.26, 20, 16]} />
        <meshStandardMaterial color="#e0b090" roughness={0.85} />
      </mesh>
      {/* fisherman hat */}
      <mesh position={[0, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.44, 0.46, 0.05, 20]} />
        <meshStandardMaterial color="#f2c14e" roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.0, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.28, 0.22, 20]} />
        <meshStandardMaterial color="#f2c14e" roughness={0.7} />
      </mesh>

      {prompt && !open && (
        <Html position={[0, 2.5, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
          <div className="pointer-events-none whitespace-nowrap rounded-full border border-white/30 bg-slate-900/70 px-3 py-1 text-[13px] font-semibold text-slate-50 shadow-lg backdrop-blur-sm">
            Press E to talk
          </div>
        </Html>
      )}
    </group>
  );
}
