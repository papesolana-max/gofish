import { useFrame, useThree } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { WEATHER, useWeather, type WeatherPreset } from "@/hooks/useWeather";
import { clock, dayNightAt, TINT_WEIGHT } from "@/hooks/useDayNight";
import { playThunder, setWeatherAmbience, setWeatherLevels } from "@/lib/weatherAudio";

const damp = (cur: number, to: number, k: number, dt: number) =>
  cur + (to - cur) * (1 - Math.exp(-k * dt));

/* ------------------------------------------------------------------ */
/* Overcast cloud ceiling: a large dome-ish plane with fbm cloud cover  */
/* ------------------------------------------------------------------ */

const cloudVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const cloudFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec3 vWorld;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uSpeed;
  uniform vec3  uColor;
  uniform vec3  uLight;
  uniform float uFlash;

  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p){
    float a = 0.5, s = 0.0;
    mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; i++) { s += a * gnoise(p); p = r * p * 2.02; a *= 0.5; }
    return s;
  }

  void main() {
    vec2 p = vWorld.xz * 0.006;
    float t = uTime * uSpeed;
    float base = fbm(p + vec2(t, t * 0.35));
    float detail = fbm(p * 3.1 - vec2(t * 1.4, t * 0.6));
    float d = base * 0.75 + detail * 0.35;

    float cover = smoothstep(0.42, 0.78, d);
    float wisp  = smoothstep(0.30, 0.62, d) * 0.45;
    float a = clamp(cover + wisp, 0.0, 1.0) * uOpacity;

    // fade out near the horizon edge of the plane so it blends with the sky
    float edge = 1.0 - smoothstep(0.28, 0.5, distance(vUv, vec2(0.5)));
    a *= edge;

    float lit = 0.55 + 0.55 * smoothstep(0.35, 0.9, d);
    vec3 col = mix(uColor * 0.72, uLight, lit);
    col += uFlash * vec3(0.9, 0.93, 1.0);

    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

function CloudCeiling({ flash }: { flash: React.MutableRefObject<number> }) {
  const kind = useWeather((s) => s.kind);
  const target = WEATHER[kind];
  const mat = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOpacity: { value: WEATHER.cerah.cloudOpacity },
      uSpeed: { value: WEATHER.cerah.cloudSpeed },
      uColor: { value: new THREE.Color(WEATHER.cerah.cloudColor) },
      uLight: { value: new THREE.Color("#ffffff") },
      uFlash: { value: 0 },
    }),
    [],
  );

  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.05);
    const u = mat.current?.uniforms;
    if (!u) return;
    (u["uTime"]!.value as number) += dt;
    (u["uOpacity"]!.value as number) = damp(u["uOpacity"]!.value as number, target.cloudOpacity, 1.5, dt);
    (u["uSpeed"]!.value as number) = damp(u["uSpeed"]!.value as number, target.cloudSpeed, 1.5, dt);
    (u["uColor"]!.value as THREE.Color).lerp(new THREE.Color(target.cloudColor), 1 - Math.exp(-1.5 * dt));
    (u["uFlash"]!.value as number) = flash.current * 0.8;
    // keep the deck centred on the camera
    const cam = state.camera.position;
    const mesh = mat.current!.userData["mesh"] as THREE.Mesh | undefined;
    if (mesh) {
      mesh.position.x = cam.x;
      mesh.position.z = cam.z;
    }
  });

  return (
    <mesh
      rotation-x={Math.PI / 2}
      position={[0, 78, 0]}
      renderOrder={-1}
      ref={(m) => {
        if (m && mat.current) mat.current.userData["mesh"] = m;
      }}
    >
      <planeGeometry args={[900, 900, 1, 1]} />
      <shaderMaterial
        ref={mat}
        vertexShader={cloudVert}
        fragmentShader={cloudFrag}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        fog={false}
      />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Rain: falling streaks kept around the camera                         */
/* ------------------------------------------------------------------ */

const MAX_DROPS = 5000;
const AREA = 70;
const TOP = 42;

function Rain() {
  const kind = useWeather((s) => s.kind);
  const target = WEATHER[kind];
  const amount = useRef(0);
  const lines = useRef<THREE.LineSegments>(null);

  const { geometry, positions } = useMemo(() => {
    const positions = new Float32Array(MAX_DROPS * 2 * 3);
    for (let i = 0; i < MAX_DROPS; i++) {
      const x = (Math.random() - 0.5) * AREA;
      const y = Math.random() * TOP;
      const z = (Math.random() - 0.5) * AREA;
      positions.set([x, y, z, x, y - 0.9, z], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry: g, positions };
  }, []);

  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.05);
    amount.current = damp(amount.current, target.rain, 2.2, dt);
    const active = Math.floor(amount.current * MAX_DROPS);
    geometry.setDrawRange(0, active * 2);
    if (lines.current) {
      lines.current.visible = active > 4;
      const m = lines.current.material as THREE.LineBasicMaterial;
      m.opacity = 0.18 + amount.current * 0.42;
      const cam = state.camera.position;
      lines.current.position.x = cam.x;
      lines.current.position.z = cam.z;
    }
    if (active < 1) return;

    const speed = Math.max(target.rainSpeed, 12) * dt;
    const drift = target.wind * dt * 4;
    const len = 0.6 + target.rainSpeed * 0.03;
    for (let i = 0; i < active; i++) {
      const a = i * 6;
      let y = positions[a + 1]! - speed;
      let x = positions[a]! + drift;
      if (y < -2) {
        y = TOP + Math.random() * 8;
        x = (Math.random() - 0.5) * AREA;
        positions[a + 2] = (Math.random() - 0.5) * AREA;
        positions[a + 5] = positions[a + 2]!;
      }
      if (x > AREA / 2) x -= AREA;
      positions[a] = x;
      positions[a + 1] = y;
      positions[a + 3] = x - target.wind * 0.12;
      positions[a + 4] = y - len;
    }
    (geometry.attributes["position"] as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <lineSegments ref={lines} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color="#cfe4f2" transparent opacity={0.35} depthWrite={false} fog={false} />
    </lineSegments>
  );
}

/* ------------------------------------------------------------------ */
/* Atmosphere driver: sky, fog, lights, lightning                       */
/* ------------------------------------------------------------------ */

function Atmosphere({ flash }: { flash: React.MutableRefObject<number> }) {
  const kind = useWeather((s) => s.kind);
  const target = WEATHER[kind];
  const { scene } = useThree();

  const sky = useRef<any>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const bolt = useRef<THREE.PointLight>(null);
  const nextStrike = useRef(3);
  const state = useRef<WeatherPreset>({ ...WEATHER.cerah });
  const fogColor = useMemo(() => new THREE.Color(WEATHER.cerah.fogColor), []);
  const sunColor = useMemo(() => new THREE.Color(WEATHER.cerah.sunColor), []);
  const dayTint = useMemo(() => new THREE.Color("#ffffff"), []);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    const k = 1.6;
    const s = state.current;

    s.fogDensity = damp(s.fogDensity, target.fogDensity, k, dt);
    s.ambient = damp(s.ambient, target.ambient, k, dt);
    s.hemi = damp(s.hemi, target.hemi, k, dt);
    s.sun = damp(s.sun, target.sun, k, dt);
    s.turbidity = damp(s.turbidity, target.turbidity, k, dt);
    s.rayleigh = damp(s.rayleigh, target.rayleigh, k, dt);
    s.mieCoefficient = damp(s.mieCoefficient, target.mieCoefficient, k, dt);
    const lerp = 1 - Math.exp(-k * dt);
    fogColor.lerp(new THREE.Color(target.fogColor), lerp);
    sunColor.lerp(new THREE.Color(target.sunColor), lerp);

    // audio levels follow the smoothed weather state
    s.rain = damp(s.rain, target.rain, k, dt);
    s.wind = damp(s.wind, target.wind / 3.2, k, dt);
    setWeatherLevels(s.rain, s.wind);

    // lightning
    if (target.lightning) {
      nextStrike.current -= dt;
      if (nextStrike.current <= 0) {
        nextStrike.current = 2.5 + Math.random() * 6;
        flash.current = 1;
        playThunder();
      }
    }
    flash.current = Math.max(0, flash.current - dt * 3.2);
    const f = flash.current * flash.current;

    // Day cycle sits on top: brightness scales the weather lighting and the
    // tint blends over the weather colours without owning any preset field.
    const day = dayNightAt(clock.hour, dayTint);
    const b = day.brightness;

    const fog = scene.fog as THREE.FogExp2 | null;
    if (fog) {
      fog.density = s.fogDensity;
      fog.color
        .copy(fogColor)
        .lerp(day.tint, TINT_WEIGHT)
        .lerp(new THREE.Color("#ffffff"), f * 0.6);
    }
    if (ambient.current) ambient.current.intensity = s.ambient * b + f * 1.4;
    if (hemi.current) hemi.current.intensity = s.hemi * b;
    if (sun.current) {
      sun.current.intensity = s.sun * b + f * 0.8;
      sun.current.color.copy(sunColor).lerp(day.tint, TINT_WEIGHT);
    }
    if (bolt.current) bolt.current.intensity = f * 900;


    const m = sky.current?.material as THREE.ShaderMaterial | undefined;
    if (m?.uniforms) {
      (m.uniforms["turbidity"]!.value as number) = s.turbidity;
      (m.uniforms["rayleigh"]!.value as number) = s.rayleigh;
      (m.uniforms["mieCoefficient"]!.value as number) = s.mieCoefficient;
      // 1.0 is identity, so overcast/storm skies keep their natural gray.
      s.skySaturation = damp(s.skySaturation, target.skySaturation, k, dt);
      const sat = m.uniforms["uSaturation"];
      if (sat) (sat.value as number) = s.skySaturation * b;
      // The dome itself is the night sky, so the tint applies at full weight.
      const nightMix = m.uniforms["uNightMix"];
      if (nightMix) (nightMix.value as number) = 1 - b;
      const nightColor = m.uniforms["uNightColor"];
      if (nightColor) (nightColor.value as THREE.Color).copy(day.tint);
    }
  });

  // ACES tone mapping desaturates the atmosphere shader into a washed-out
  // white. Re-inject saturation after the tone mapping step so clear weather
  // reads as a proper sky blue instead of pale gray.
  useEffect(() => {
    const m = sky.current?.material as THREE.ShaderMaterial | undefined;
    if (!m?.fragmentShader || m.fragmentShader.includes("uSaturation")) return;
    m.uniforms = {
      ...m.uniforms,
      uSaturation: { value: 2.1 },
      uNightMix: { value: 0 },
      uNightColor: { value: new THREE.Color("#1d2c5c") },
    };
    m.fragmentShader =
      "uniform float uSaturation;\nuniform float uNightMix;\nuniform vec3 uNightColor;\n" +
      m.fragmentShader.replace(
        "#include <colorspace_fragment>",
        /* glsl */ `
        float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor.rgb = max(mix(vec3(lum), gl_FragColor.rgb, uSaturation), 0.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uNightColor, clamp(uNightMix, 0.0, 1.0));
        #include <colorspace_fragment>
      `,
      );
    m.needsUpdate = true;
  }, []);

  return (
    <>
      <Sky ref={sky} sunPosition={target.sunPosition} distance={4000} />
      <fogExp2 attach="fog" args={[WEATHER.cerah.fogColor, WEATHER.cerah.fogDensity]} />

      <ambientLight ref={ambient} intensity={WEATHER.cerah.ambient} />
      <hemisphereLight ref={hemi} args={["#cfe9ff", "#2b6a86", WEATHER.cerah.hemi]} />
      <directionalLight
        ref={sun}
        position={[40, 60, 30]}
        target-position={[0, 0, -30]}
        intensity={WEATHER.cerah.sun}
        color={WEATHER.cerah.sunColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-80}
        shadow-camera-right={80}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-far={220}
      />
      <pointLight ref={bolt} position={[-24, 60, -30]} intensity={0} color="#dce9ff" distance={400} decay={2} />
    </>
  );
}

export function Weather() {
  const flash = useRef(0);
  const kind = useWeather((s) => s.kind);
  useEffect(() => {
    setWeatherAmbience(kind);
  }, [kind]);
  return (
    <>
      <Atmosphere flash={flash} />
      <CloudCeiling flash={flash} />
      <Rain />
    </>
  );
}
