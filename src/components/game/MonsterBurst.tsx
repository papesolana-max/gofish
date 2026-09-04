import * as THREE from "three";

/**
 * Efek "cosmic burst" saat monster menerobos keluar laut:
 * - pilar cahaya raksasa menembak ke langit (additive, memudar)
 * - streak/serpihan cahaya vertikal yang naik dengan kecepatan berbeda
 * - cincin kejut melebar di permukaan air
 * - percikan air putih (spray) yang jatuh secara parabola
 *
 * Group ini digerakkan secara imperatif dari Angler lewat `animateBurst`.
 */

export const BURST_SPARKS = 30;
export const BURST_STREAKS = 14;
export const BURST_DROPS = 26;
export const BURST_RINGS = 4;
const BEAM_H = 170;

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

/** semua material efek: additive, tidak tertutup air/objek lain */
function fx(color: string, additive = true) {
  return (
    <meshBasicMaterial
      color={color}
      transparent
      opacity={0}
      blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      depthWrite={false}
      depthTest={false}
      side={THREE.DoubleSide}
      toneMapped={false}
    />
  );
}

export function MonsterBurstMesh() {
  return (
    <group renderOrder={999}>
      {/* pilar luar (hijau-cyan), melebar ke atas seperti kabut cahaya */}
      <mesh name="beamOuter" position={[0, BEAM_H / 2, 0]} renderOrder={999}>
        <cylinderGeometry args={[11, 4.2, BEAM_H, 28, 1, true]} />
        {fx("#2fe9a6")}
      </mesh>
      {/* pilar tengah (ungu) */}
      <mesh name="beamMid" position={[0, BEAM_H / 2, 0]} renderOrder={1000}>
        <cylinderGeometry args={[5.4, 2.0, BEAM_H, 22, 1, true]} />
        {fx("#a05dff")}
      </mesh>
      {/* inti putih menyilaukan */}
      <mesh name="beamCore" position={[0, BEAM_H / 2, 0]} renderOrder={1001}>
        <cylinderGeometry args={[1.7, 0.6, BEAM_H, 14, 1, true]} />
        {fx("#ffffff")}
      </mesh>

      {/* streak cahaya vertikal yang naik */}
      {Array.from({ length: BURST_STREAKS }, (_, i) => (
        <mesh key={`streak${i}`} name={`streak${i}`} renderOrder={1000}>
          <planeGeometry args={[0.6, 10]} />
          {fx(i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? "#6dffcb" : "#c58bff")}
        </mesh>
      ))}

      {/* cincin kejut di permukaan */}
      {Array.from({ length: BURST_RINGS }, (_, i) => (
        <mesh
          key={`ring${i}`}
          name={`ring${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={999}
        >
          <ringGeometry args={[0.9, 1, 64]} />
          {fx(i % 2 === 0 ? "#8fffdd" : "#d9a7ff")}
        </mesh>
      ))}

      {/* percikan cahaya */}
      {Array.from({ length: BURST_SPARKS }, (_, i) => (
        <mesh key={`spark${i}`} name={`spark${i}`} renderOrder={1001}>
          <sphereGeometry args={[1, 6, 6]} />
          {fx(i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? "#5dffc4" : "#c88bff")}
        </mesh>
      ))}

      {/* percikan AIR (putih, normal blending, terlihat natural) */}
      {Array.from({ length: BURST_DROPS }, (_, i) => (
        <mesh key={`drop${i}`} name={`drop${i}`} renderOrder={998}>
          <sphereGeometry args={[1, 7, 7]} />
          {fx("#f2fbff", false)}
        </mesh>
      ))}

      <pointLight name="light" color="#7dffd2" intensity={0} distance={120} decay={1.6} />
    </group>
  );
}

/** k = 0..1 progres efek (0 = monster menembus permukaan), t = waktu global */
export function animateBurst(g: THREE.Group, k: number, t: number) {
  const setOp = (name: string, op: number) => {
    const m = g.getObjectByName(name) as THREE.Mesh | undefined;
    if (!m) return;
    (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, op);
    m.visible = op > 0.002;
  };

  const beamIn = easeOut(Math.min(k / 0.1, 1)); // pilar menyala sangat cepat
  const fade = 1 - Math.pow(Math.max(0, (k - 0.45) / 0.55), 1.5);
  const flicker = 0.85 + Math.sin(t * 40) * 0.08 + Math.sin(t * 23) * 0.07;
  const beamA = beamIn * fade * flicker;

  setOp("beamOuter", beamA * 0.35);
  setOp("beamMid", beamA * 0.6);
  setOp("beamCore", beamA * 0.95);
  for (const n of ["beamOuter", "beamMid", "beamCore"]) {
    const m = g.getObjectByName(n) as THREE.Mesh | undefined;
    if (m) {
      const grow = 0.4 + beamIn * 0.6;
      m.scale.set(grow + Math.sin(t * 9) * 0.05, beamIn, grow + Math.cos(t * 7) * 0.05);
      m.rotation.y = t * (n === "beamCore" ? 3 : n === "beamMid" ? -1.6 : 0.8);
    }
  }


  // streak vertikal: naik cepat, memanjang, lalu hilang
  for (let i = 0; i < BURST_STREAKS; i++) {
    const s = g.getObjectByName(`streak${i}`) as THREE.Mesh | undefined;
    if (!s) continue;
    const off = (i % 5) * 0.05;
    const sk = Math.max(0, Math.min(1, (k - off) / 0.7));
    const a = (i / BURST_STREAKS) * Math.PI * 2 + i * 0.9;
    const rad = 2.5 + (i % 4) * 2.2;
    const e = easeOut(sk);
    s.position.set(Math.cos(a) * rad, 4 + e * (60 + (i % 6) * 18), Math.sin(a) * rad);
    s.scale.set(0.5 + (i % 3) * 0.35, 1.4 + e * 3.4, 1);
    s.rotation.y = a + Math.PI / 2;
    setOp(`streak${i}`, sk > 0 && sk < 1 ? (1 - sk) * 0.95 : 0);
  }

  for (let i = 0; i < BURST_RINGS; i++) {
    const rk = Math.max(0, Math.min(1, (k - i * 0.07) / 0.75));
    const r = 3 + easeOut(rk) * (30 + i * 10);
    const ring = g.getObjectByName(`ring${i}`) as THREE.Mesh | undefined;
    if (ring) {
      ring.scale.setScalar(r);
      ring.position.y = 0.35 + i * 0.15;
      setOp(`ring${i}`, rk > 0 && rk < 1 ? (1 - rk) * 0.85 : 0);
    }
  }

  for (let i = 0; i < BURST_SPARKS; i++) {
    const s = g.getObjectByName(`spark${i}`) as THREE.Mesh | undefined;
    if (!s) continue;
    const sk = Math.max(0, Math.min(1, (k - 0.02) / 0.85));
    const a = (i / BURST_SPARKS) * Math.PI * 2 + i * 0.37;
    const spd = 12 + (i % 5) * 5;
    const up = 26 + (i % 4) * 11;
    const e = easeOut(sk);
    s.position.set(
      Math.cos(a) * spd * e,
      up * e - 22 * sk * sk, // parabola: naik lalu jatuh
      Math.sin(a) * spd * e,
    );
    s.scale.setScalar(Math.max(0.001, (1 - sk) * (0.6 + (i % 3) * 0.3)));
    setOp(`spark${i}`, sk > 0 && sk < 1 ? 1 - sk : 0);
  }

  // percikan air: keluar melengkung dari permukaan lalu jatuh kembali
  for (let i = 0; i < BURST_DROPS; i++) {
    const d = g.getObjectByName(`drop${i}`) as THREE.Mesh | undefined;
    if (!d) continue;
    const dk = Math.max(0, Math.min(1, k / 0.6));
    const a = (i / BURST_DROPS) * Math.PI * 2 + i * 1.13;
    const spd = 6 + (i % 6) * 3.4;
    const up = 16 + (i % 5) * 6;
    const y = up * dk - 30 * dk * dk;
    d.position.set(Math.cos(a) * spd * dk, Math.max(0, y), Math.sin(a) * spd * dk);
    const sc = (0.5 + (i % 4) * 0.28) * (1 - dk * 0.5);
    d.scale.set(sc, sc * (1 + dk * 1.2), sc);
    setOp(`drop${i}`, dk > 0 && dk < 1 ? (1 - dk) * 0.9 : 0);
  }

  const light = g.getObjectByName("light") as THREE.PointLight | undefined;
  if (light) {
    light.intensity = beamA * 600;
    light.position.y = 8;
  }
}
