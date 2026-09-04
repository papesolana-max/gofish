import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Ocean } from "./Ocean";
import { WorldObjects } from "./WorldObjects";
import { WorldEditor } from "./WorldEditor";
import { Boat } from "./Boat";
import { FishSchool } from "./Fish";
import { Angler } from "./Angler";
import { HUD } from "./HUD";
import { LoadingScreen } from "./LoadingScreen";
import { Weather } from "./Weather";
import { RainImpacts } from "./RainImpacts";
import { WeatherCycleController } from "./WeatherCycleController";
import { WEATHER, useWeather } from "@/hooks/useWeather";
import { useDayNight, dayNightAt, TINT_WEIGHT } from "@/hooks/useDayNight";
import { useFishData } from "@/hooks/useFishData";

import { player } from "@/hooks/usePlayer";
import { resumeWeatherAudio } from "@/lib/weatherAudio";
import { WalletButton } from "../wallet/WalletButton";
import { ProfilePanel } from "../profile/ProfilePanel";
import { Merchant } from "./Merchant";
import { MerchantDialog } from "./MerchantDialog";

/** Keeps the orbit pivot glued to the character so the camera follows them. */
function FollowTarget({
  controls,
}: {
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.05);
    const c = controls.current;
    if (!c) return;
    const t = c.target;
    const k = 1 - Math.exp(-8 * dt);
    const nx = t.x + (player.pos.x - t.x) * k;
    const ny = t.y + (player.pos.y + 3 - t.y) * k;
    const nz = t.z + (player.pos.z - t.z) * k;
    // Move the camera by the same delta so it travels with the character
    // instead of only re-aiming at them.
    state.camera.position.x += nx - t.x;
    state.camera.position.y += ny - t.y;
    state.camera.position.z += nz - t.z;
    t.set(nx, ny, nz);
    c.update();
  });

  return null;
}

export function GameCanvas() {
  const controls = useRef<OrbitControlsImpl>(null);
  const kind = useWeather((s) => s.kind);
  const hour = useDayNight((s) => s.hour);
  const backdrop = new THREE.Color(WEATHER[kind].backdrop)
    .lerp(dayNightAt(hour).tint, TINT_WEIGHT)
    .getStyle();
  useFishData();


  // Browsers may suspend WebAudio after focus/background transitions. Resume
  // on every relevant gesture, in capture phase so gameplay handlers always
  // see an initialized context, and again whenever the page becomes active.
  useEffect(() => {
    const start = () => resumeWeatherAudio();
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
    };
    window.addEventListener("pointerdown", start, { capture: true });
    window.addEventListener("touchstart", start, { capture: true, passive: true });
    window.addEventListener("keydown", start, { capture: true });
    window.addEventListener("focus", start);
    window.addEventListener("pageshow", start);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerdown", start, { capture: true });
      window.removeEventListener("touchstart", start, { capture: true });
      window.removeEventListener("keydown", start, { capture: true });
      window.removeEventListener("focus", start);
      window.removeEventListener("pageshow", start);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 transition-colors duration-700"
      style={{ backgroundColor: backdrop }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [-1.5, 8.6, 25.5], fov: 55 }}
        gl={{ antialias: true }}
      >
        <Weather />
        <WeatherCycleController />

        <Environment>
          <Lightformer intensity={1.6} position={[0, 12, 0]} scale={[24, 24, 1]} color="#ffffff" />
          <Lightformer
            intensity={0.9}
            color="#7fc8e8"
            position={[-14, 2, -6]}
            rotation-y={Math.PI / 2}
            scale={[40, 4, 1]}
          />
        </Environment>

        <Ocean />
        <RainImpacts />
        <WorldObjects />
        <Boat />
        <FishSchool />
        <Angler />

        <OrbitControls
          ref={controls}
          makeDefault
          target={[0, 3.66, 12]}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          zoomSpeed={0.9}
          minDistance={6}
          maxDistance={70}
          minPolarAngle={0.3}
          maxPolarAngle={Math.PI / 2.15}
          mouseButtons={{
            LEFT: -1 as unknown as THREE.MOUSE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
        />
        <FollowTarget controls={controls} />
        <Merchant />

        <EffectComposer multisampling={4}>
          <Bloom
            intensity={0.5}
            luminanceThreshold={1.5}
            luminanceSmoothing={0.1}
            mipmapBlur={false}
            radius={0.35}
          />
        </EffectComposer>

      </Canvas>
      <HUD />
      <WorldEditor />
      <LoadingScreen />

      <div className="pointer-events-none fixed right-4 top-4 z-40">
        <WalletButton />
      </div>
      <ProfilePanel />
      <MerchantDialog />
    </div>
  );
}
