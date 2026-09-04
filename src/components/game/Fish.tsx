import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

/** Blocky low-poly fish: body + wagging tail + fins. */
export function FishMesh({
  color = "#7fc7e8",
  scale = 1,
  wagSpeed = 12,
}: {
  color?: string;
  scale?: number;
  wagSpeed?: number;
}) {
  const tail = useRef<THREE.Group>(null);
  const fin = useRef<THREE.Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (tail.current) tail.current.rotation.y = Math.sin(t * wagSpeed) * 0.7;
    if (fin.current) fin.current.rotation.x = Math.sin(t * wagSpeed * 0.7) * 0.5;
  });

  return (
    <group scale={scale}>
      <mesh castShadow>
        <sphereGeometry args={[0.5, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh scale={[1.7, 0.85, 0.55]} castShadow>
        <sphereGeometry args={[0.5, 12, 10]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.15} />
      </mesh>
      {/* belly */}
      <mesh position={[0.05, -0.14, 0]} scale={[1.35, 0.5, 0.42]}>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshStandardMaterial color="#f3f0e6" roughness={0.5} />
      </mesh>
      {/* eyes */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0.62, 0.12, s * 0.18]}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshStandardMaterial color="#12161c" />
        </mesh>
      ))}
      {/* dorsal fin */}
      <group ref={fin} position={[-0.05, 0.34, 0]}>
        <mesh castShadow>
          <coneGeometry args={[0.22, 0.42, 4]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </group>
      {/* tail */}
      <group ref={tail} position={[-0.82, 0, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <coneGeometry args={[0.34, 0.6, 3]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** Ambient surface fish removed — no fish may leap out of the water. */
export function FishSchool() {
  return null;
}
