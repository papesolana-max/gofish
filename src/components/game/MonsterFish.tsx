import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { SEA_CX, SEA_CZ } from "./worldConfig";
import { isOverLand } from "@/lib/worldPhysics";
import { waterHeight } from "./Ocean";

/**
 * Monster laut purba: tubuh biru gelap, rahang raksasa penuh gigi, mata menyala.
 * Base length ~4 unit pada scale=1 (kepala di +X, ekor di -X).
 */
export function MonsterFishMesh({
  scale = 1,
  jawOpen = 0.25,
  wagSpeed = 1.6,
}: {
  scale?: number;
  /** 0 = mulut tertutup, 1 = menganga penuh */
  jawOpen?: number;
  wagSpeed?: number;
}) {
  const upperJaw = useRef<THREE.Group>(null);
  const lowerJaw = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const finL = useRef<THREE.Group>(null);
  const finR = useRef<THREE.Group>(null);
  const open = useRef(jawOpen);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    open.current += (jawOpen - open.current) * (1 - Math.exp(-6 * dt));
    const o = open.current;
    if (upperJaw.current) upperJaw.current.rotation.z = -o * 0.5 - 0.04;
    if (lowerJaw.current) lowerJaw.current.rotation.z = o * 0.62 + 0.05;
    if (tail.current) tail.current.rotation.y = Math.sin(t * wagSpeed) * 0.55;
    if (finL.current) finL.current.rotation.x = 0.4 + Math.sin(t * wagSpeed * 0.8) * 0.35;
    if (finR.current) finR.current.rotation.x = -0.4 - Math.sin(t * wagSpeed * 0.8) * 0.35;
  });

  // gigi: baris atas & bawah, besar di depan
  const teeth = useMemo(() => {
    const rows: Array<{ x: number; z: number; h: number; r: number }> = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const x = 1.5 - k * 1.25;
      const z = 0.34 - k * 0.1;
      const h = 0.42 - k * 0.2;
      const r = 0.1 - k * 0.04;
      rows.push({ x, z, h, r });
      rows.push({ x, z: -z, h, r });
    }
    return rows;
  }, []);

  const bodyMat = (
    <meshStandardMaterial color="#1e46b4" roughness={0.42} metalness={0.22} />
  );

  return (
    <group scale={scale}>
      {/* badan */}
      <mesh scale={[1.55, 0.82, 0.78]} position={[-0.35, 0, 0]} castShadow>
        <sphereGeometry args={[1, 20, 16]} />
        {bodyMat}
      </mesh>
      {/* pangkal ekor */}
      <mesh position={[-1.9, 0.02, 0]} scale={[0.75, 0.42, 0.34]} castShadow>
        <sphereGeometry args={[1, 14, 12]} />
        {bodyMat}
      </mesh>
      {/* perut lebih terang */}
      <mesh position={[-0.3, -0.42, 0]} scale={[1.3, 0.42, 0.6]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshStandardMaterial color="#7fc4e6" roughness={0.55} />
      </mesh>

      {/* kepala */}
      <mesh position={[0.85, 0.06, 0]} scale={[0.85, 0.72, 0.7]} castShadow>
        <sphereGeometry args={[1, 18, 14]} />
        {bodyMat}
      </mesh>

      {/* interior mulut */}
      <mesh position={[1.15, -0.02, 0]} scale={[0.62, 0.42, 0.5]}>
        <sphereGeometry args={[1, 14, 12]} />
        <meshStandardMaterial color="#5a1020" roughness={0.9} />
      </mesh>

      {/* rahang atas */}
      <group ref={upperJaw} position={[0.75, 0.08, 0]}>
        <mesh position={[0.6, 0.16, 0]} scale={[0.95, 0.3, 0.62]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
          {bodyMat}
        </mesh>
        {teeth.map((tt, i) => (
          <mesh key={`u${i}`} position={[tt.x - 0.75 + 0.6, -0.05, tt.z]} rotation={[0, 0, Math.PI]}>
            <coneGeometry args={[tt.r, tt.h, 6]} />
            <meshStandardMaterial color="#f2ecdc" roughness={0.35} />
          </mesh>
        ))}
      </group>

      {/* rahang bawah */}
      <group ref={lowerJaw} position={[0.75, -0.18, 0]}>
        <mesh position={[0.6, -0.14, 0]} scale={[0.92, 0.26, 0.58]} castShadow>
          <sphereGeometry args={[1, 16, 12]} />
          {bodyMat}
        </mesh>
        {teeth.map((tt, i) => (
          <mesh key={`l${i}`} position={[tt.x - 0.75 + 0.6, 0.02, tt.z * 0.95]}>
            <coneGeometry args={[tt.r, tt.h, 6]} />
            <meshStandardMaterial color="#f2ecdc" roughness={0.35} />
          </mesh>
        ))}
      </group>

      {/* mata menyala */}
      {[-1, 1].map((s) => (
        <group key={s} position={[1.18, 0.42, s * 0.42]}>
          <mesh>
            <sphereGeometry args={[0.19, 14, 14]} />
            <meshStandardMaterial
              color="#0d2b33"
              emissive="#38e6ff"
              emissiveIntensity={3.2}
              toneMapped={false}
            />
          </mesh>
          <mesh position={[0.12, 0, 0]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshStandardMaterial color="#06131a" />
          </mesh>
        </group>
      ))}

      {/* sirip punggung */}
      <mesh position={[-0.5, 0.78, 0]} rotation={[0, 0, -0.15]} castShadow>
        <coneGeometry args={[0.5, 1.15, 4]} />
        <meshStandardMaterial color="#16307d" roughness={0.6} />
      </mesh>

      {/* sirip dada */}
      <group ref={finL} position={[0.15, -0.25, 0.62]}>
        <mesh rotation={[0.4, 0, 0.3]} castShadow>
          <coneGeometry args={[0.3, 0.9, 4]} />
          <meshStandardMaterial color="#16307d" roughness={0.6} />
        </mesh>
      </group>
      <group ref={finR} position={[0.15, -0.25, -0.62]}>
        <mesh rotation={[-0.4, 0, 0.3]} castShadow>
          <coneGeometry args={[0.3, 0.9, 4]} />
          <meshStandardMaterial color="#16307d" roughness={0.6} />
        </mesh>
      </group>

      {/* ekor */}
      <group ref={tail} position={[-2.35, 0.02, 0]}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <coneGeometry args={[0.95, 1.5, 3]} />
          <meshStandardMaterial color="#16307d" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

/** Monster berpatroli jauh dari pulau, sesekali melompat dramatis. */
export function MonsterSwimmer({
  radius = 40,
  speed = 0.07,
  phase = 0.8,
  scale = 9,
  leapEvery = 22,
}: {
  radius?: number;
  speed?: number;
  phase?: number;
  scale?: number;
  leapEvery?: number;
}) {
  const g = useRef<THREE.Group>(null);
  const leapRef = useRef(0);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = phase + t * speed;
    const x = SEA_CX + Math.cos(a) * radius;
    const z = SEA_CZ + Math.sin(a) * radius;
    const surface = waterHeight(x, z, t);

    const cycle = (t + phase * 5) % leapEvery;
    const dur = 3.2;
    const leaping = cycle < dur;
    const k = leaping ? cycle / dur : 0;
    const arc = leaping ? Math.sin(k * Math.PI) * scale * 1.5 : 0;
    leapRef.current = leaping ? Math.sin(k * Math.PI) : 0;

    if (!g.current) return;
    // Never let a fish surface over the island — hide it while the ring
    // passes over land (2 unit pad keeps it clear of the shoreline).
    const overLand = isOverLand(x, z);
    g.current.visible = leaping && !overLand;
    g.current.position.set(x, surface - scale * 0.8 + arc, z);
    g.current.rotation.y = -a + Math.PI;
    g.current.rotation.z = leaping ? Math.cos(k * Math.PI) * 0.75 : 0;
  });

  return (
    <group ref={g} visible={false}>
      <MonsterFishMesh scale={scale} jawOpen={0.8} wagSpeed={1.2} />
    </group>
  );
}
