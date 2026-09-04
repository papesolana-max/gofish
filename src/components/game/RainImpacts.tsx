import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { WEATHER, useWeather } from "@/hooks/useWeather";
import { playImpact } from "@/lib/weatherAudio";

/** island silhouette: returns surface height, or null when the point is water */
function landHeight(x: number, z: number): number | null {
  const r = Math.hypot(x, z);
  // dock planks
  if (Math.abs(x) < 1.15 && z > 5.4 && z < 11.2) return 0.68;
  if (r < 5.6) return 1.25; // grass cap
  if (r < 9.0) return 0.75; // beach
  return null;
}

const POOL = 420;
const SPREAD = 30;

const ringVert = /* glsl */ `
  attribute vec3 aOrigin;
  attribute float aStart;
  attribute float aLand;
  uniform float uTime;
  varying float vAlpha;
  varying float vLand;
  void main() {
    float life = aLand > 0.5 ? 0.42 : 0.8;
    float age = uTime - aStart;
    float t = age / life;
    float alive = step(0.0, age) * step(t, 1.0);
    float grow = aLand > 0.5 ? 0.55 : 1.15;
    float scale = mix(0.05, grow, sqrt(max(t, 0.0))) * alive;
    vAlpha = (1.0 - t) * alive;
    vLand = aLand;
    vec3 p = position * scale + aOrigin;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }
`;

const ringFrag = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  varying float vLand;
  void main() {
    if (vAlpha < 0.01) discard;
    vec3 water = vec3(0.92, 0.98, 1.0);
    vec3 sand  = vec3(0.85, 0.80, 0.68);
    vec3 col = mix(water, sand, vLand);
    gl_FragColor = vec4(col, vAlpha * (vLand > 0.5 ? 0.45 : 0.6));
  }
`;

const domeVert = /* glsl */ `
  attribute vec3 aOrigin;
  attribute float aStart;
  attribute float aLand;
  uniform float uTime;
  varying float vAlpha;
  void main() {
    float life = 0.3;
    float age = uTime - aStart;
    float t = age / life;
    float alive = step(0.0, age) * step(t, 1.0);
    float up = sin(t * 3.1415) ;
    vec3 s = vec3(0.055 + t * 0.05, 0.03 + up * 0.28, 0.055 + t * 0.05) * alive;
    vAlpha = (1.0 - t) * alive * (aLand > 0.5 ? 0.35 : 1.0);
    vec3 p = position * s + aOrigin;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  }
`;

const domeFrag = /* glsl */ `
  precision highp float;
  varying float vAlpha;
  void main() {
    if (vAlpha < 0.01) discard;
    gl_FragColor = vec4(vec3(0.95, 0.99, 1.0), vAlpha * 0.7);
  }
`;

export function RainImpacts() {
  const kind = useWeather((s) => s.kind);
  const target = WEATHER[kind];

  const amount = useRef(0);
  const cursor = useRef(0);
  const carry = useRef(0);
  const soundCool = useRef(0);

  const { ring, dome, aOrigin, aStart, aLand } = useMemo(() => {
    const aOrigin = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3), 3);
    const aStart = new THREE.InstancedBufferAttribute(new Float32Array(POOL).fill(-99), 1);
    const aLand = new THREE.InstancedBufferAttribute(new Float32Array(POOL), 1);
    aOrigin.setUsage(THREE.DynamicDrawUsage);
    aStart.setUsage(THREE.DynamicDrawUsage);
    aLand.setUsage(THREE.DynamicDrawUsage);

    const flat = new THREE.RingGeometry(0.62, 1, 20).rotateX(-Math.PI / 2);
    const ring = new THREE.InstancedBufferGeometry();
    ring.copy(flat as unknown as THREE.InstancedBufferGeometry);
    ring.instanceCount = POOL;
    ring.setAttribute("aOrigin", aOrigin);
    ring.setAttribute("aStart", aStart);
    ring.setAttribute("aLand", aLand);

    const blob = new THREE.SphereGeometry(1, 8, 6);
    const dome = new THREE.InstancedBufferGeometry();
    dome.copy(blob as unknown as THREE.InstancedBufferGeometry);
    dome.instanceCount = POOL;
    dome.setAttribute("aOrigin", aOrigin);
    dome.setAttribute("aStart", aStart);
    dome.setAttribute("aLand", aLand);

    return { ring, dome, aOrigin, aStart, aLand };
  }, []);

  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.05);
    const time = state.clock.elapsedTime;
    uniforms.uTime.value = time;

    amount.current = amount.current + (target.rain - amount.current) * (1 - Math.exp(-2.2 * dt));
    soundCool.current -= dt;
    if (amount.current < 0.02) return;

    const cam = state.camera.position;
    carry.current += amount.current * 190 * dt;
    let spawn = Math.floor(carry.current);
    carry.current -= spawn;
    spawn = Math.min(spawn, 40);

    for (let i = 0; i < spawn; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * SPREAD;
      const x = cam.x + Math.cos(a) * r;
      const z = cam.z + Math.sin(a) * r;
      const h = landHeight(x, z);
      const idx = cursor.current;
      cursor.current = (cursor.current + 1) % POOL;
      aOrigin.array[idx * 3] = x;
      aOrigin.array[idx * 3 + 1] = (h ?? 0) + 0.02;
      aOrigin.array[idx * 3 + 2] = z;
      aStart.array[idx] = time + Math.random() * 0.05;
      aLand.array[idx] = h === null ? 0 : 1;

      if (soundCool.current <= 0 && r < 16 && Math.random() < 0.35) {
        soundCool.current = 0.045 + Math.random() * 0.07;
        playImpact(h === null, 0.5 + amount.current * 0.7);
      }
    }
    aOrigin.needsUpdate = true;
    aStart.needsUpdate = true;
    aLand.needsUpdate = true;
  });

  return (
    <group>
      <mesh geometry={ring} frustumCulled={false} renderOrder={2}>
        <shaderMaterial
          vertexShader={ringVert}
          fragmentShader={ringFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={dome} frustumCulled={false} renderOrder={3}>
        <shaderMaterial
          vertexShader={domeVert}
          fragmentShader={domeFrag}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
