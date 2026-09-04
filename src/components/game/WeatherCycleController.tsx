import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { useWeather, WEATHER, type WeatherKind } from "@/hooks/useWeather";
import { useDayNight } from "@/hooks/useDayNight";
import { getFishData } from "@/lib/fishRules";

const KINDS = Object.keys(WEATHER) as WeatherKind[];

function pickWeather(weights: Record<string, number>): WeatherKind {
  const entries = KINDS.map((k) => [k, Math.max(0, Number(weights[k] ?? 0))] as const);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return "cerah";
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}

/** Advances the in-game clock and rolls the weather on an interval.
 *  Renders nothing. */
export function WeatherCycleController() {
  const elapsed = useRef(0);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    useDayNight.getState().advance(dt);

    const cycle = getFishData().weatherCycle;
    const interval = cycle.change_interval_seconds > 0 ? cycle.change_interval_seconds : 240;
    elapsed.current += dt;
    if (elapsed.current < interval) return;
    elapsed.current = 0;
    useWeather.getState().setKind(pickWeather(cycle.weights));
  });

  return null;
}
