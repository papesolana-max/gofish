import { create } from "zustand";
import * as THREE from "three";
import { getFishData } from "@/lib/fishRules";

/** Visual tuning anchors for the day cycle. Not game balance, so they stay in
 *  code: brightness multiplies the weather lighting, tint blends over colors. */
interface Anchor {
  hour: number;
  brightness: number;
  tint: string;
}

export const DAY_ANCHORS: Anchor[] = [
  { hour: 0, brightness: 0.35, tint: "#1d2c5c" },
  { hour: 6, brightness: 0.7, tint: "#ffb066" },
  { hour: 12, brightness: 1.0, tint: "#ffffff" },
  { hour: 18, brightness: 0.7, tint: "#ff9a5a" },
  { hour: 24, brightness: 0.35, tint: "#1d2c5c" },
];

export const DEFAULT_DAY_LENGTH_SECONDS = 720;
/** How strongly the day tint colours the weather palette. */
export const TINT_WEIGHT = 0.3;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

const ANCHOR_COLORS = DAY_ANCHORS.map((a) => new THREE.Color(a.tint));

export function dayLengthSeconds(): number {
  const v = getFishData().config["day_length_seconds"];
  return typeof v === "number" && v > 0 ? v : DEFAULT_DAY_LENGTH_SECONDS;
}

/** Smooth brightness + tint for a given in-game hour. */
export function dayNightAt(hour: number, out = new THREE.Color()) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < DAY_ANCHORS.length - 2 && h >= DAY_ANCHORS[i + 1]!.hour) i++;
  const a = DAY_ANCHORS[i]!;
  const b = DAY_ANCHORS[i + 1]!;
  const t = smoothstep((h - a.hour) / (b.hour - a.hour));
  out.copy(ANCHOR_COLORS[i]!).lerp(ANCHOR_COLORS[i + 1]!, t);
  return { brightness: a.brightness + (b.brightness - a.brightness) * t, tint: out };
}

export type DayLabel = "Dawn" | "Day" | "Dusk" | "Night";

export function dayLabelFor(hour: number): DayLabel {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 5 && h < 7) return "Dawn";
  if (h >= 7 && h < 17) return "Day";
  if (h >= 17 && h < 19) return "Dusk";
  return "Night";
}

interface DayNightStore {
  hour: number;
  advance: (dt: number) => void;
}

/** Frame-precise clock. The store mirrors it in coarse steps so HUD
 *  subscribers don't re-render every frame. */
export const clock = { hour: 7 };

export const useDayNight = create<DayNightStore>((set, get) => ({
  hour: 7,
  advance: (dt) => {
    clock.hour = (clock.hour + (dt / dayLengthSeconds()) * 24) % 24;
    if (Math.abs(clock.hour - get().hour) > 0.05) set({ hour: clock.hour });
  },
}));
