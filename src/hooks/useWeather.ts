import { create } from "zustand";

export type WeatherKind = "cerah" | "berawan" | "berkabut" | "hujan" | "badai";

export interface WeatherPreset {
  label: string;
  /** drei <Sky /> tuning */
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  /** sky saturation boost (1 = untouched, used to keep clear skies blue) */
  skySaturation: number;
  sunPosition: [number, number, number];
  /** atmosphere */
  fogColor: string;
  fogDensity: number;
  /** lighting */
  ambient: number;
  hemi: number;
  sun: number;
  sunColor: string;
  /** cloud deck */
  cloudOpacity: number;
  cloudColor: string;
  cloudSpeed: number;
  /** precipitation */
  rain: number; // 0..1 amount
  rainSpeed: number;
  wind: number;
  lightning: boolean;
  /** page backdrop behind the canvas */
  backdrop: string;
  /** ocean body colours (shallow -> mid -> deep) and the horizon haze */
  waterShallow: string;
  waterMid: string;
  waterDeep: string;
  waterHorizon: string;
}

export const WEATHER: Record<WeatherKind, WeatherPreset> = {
  cerah: {
    label: "Clear",
    // Deeper rayleigh + low turbidity keeps the dome a saturated sky blue
    // instead of the washed-out white ACES tone mapping tends to produce.
    turbidity: 1.6,
    rayleigh: 3.4,
    mieCoefficient: 0.003,
    skySaturation: 2.1,
    sunPosition: [30, 22, 18],
    fogColor: "#b8e0f7",
    fogDensity: 0.0045,
    ambient: 0.55,
    hemi: 0.7,
    sun: 2.1,
    sunColor: "#fff3d9",
    cloudOpacity: 0.28,
    cloudColor: "#ffffff",
    cloudSpeed: 0.08,
    rain: 0,
    rainSpeed: 0,
    wind: 0,
    lightning: false,
    backdrop: "#7ecbf5",
    waterShallow: "#7ff0e2",
    waterMid: "#3fd8d2",
    waterDeep: "#12a2b4",
    waterHorizon: "#b9dff3",
  },
  berawan: {
    label: "Cloudy",
    turbidity: 9,
    rayleigh: 2.1,
    mieCoefficient: 0.009,
    skySaturation: 1,
    sunPosition: [22, 12, 20],
    fogColor: "#b8d4e8",
    fogDensity: 0.0075,
    ambient: 0.5,
    hemi: 0.6,
    sun: 1.1,
    sunColor: "#ecefF2",
    cloudOpacity: 0.72,
    cloudColor: "#e8edf2",
    cloudSpeed: 0.14,
    rain: 0,
    rainSpeed: 0,
    wind: 0.2,
    lightning: false,
    backdrop: "#9fc3e0",
    waterShallow: "#63cfc9",
    waterMid: "#33b2b4",
    waterDeep: "#0e8698",
    waterHorizon: "#a9cade",
  },
  berkabut: {
    label: "Foggy",
    turbidity: 14,
    rayleigh: 2.7,
    mieCoefficient: 0.015,
    skySaturation: 1,
    sunPosition: [18, 8, 22],
    fogColor: "#c9e0f0",
    fogDensity: 0.0055,
    ambient: 0.72,
    hemi: 0.8,
    sun: 0.6,
    sunColor: "#e6eaec",
    cloudOpacity: 0.6,
    cloudColor: "#dfe5e8",
    cloudSpeed: 0.05,
    rain: 0,
    rainSpeed: 0,
    wind: 0.05,
    lightning: false,
    backdrop: "#c2d8eb",
    waterShallow: "#a3d8d3",
    waterMid: "#74c0c1",
    waterDeep: "#479aa5",
    waterHorizon: "#c9e0f0",
  },
  hujan: {
    label: "Rain",
    turbidity: 16,
    rayleigh: 2.9,
    mieCoefficient: 0.017,
    skySaturation: 1,
    sunPosition: [14, 7, 24],
    fogColor: "#8aaec6",
    fogDensity: 0.009,
    ambient: 0.42,
    hemi: 0.5,
    sun: 0.55,
    sunColor: "#bcc7d2",
    cloudOpacity: 0.9,
    cloudColor: "#9aa7b3",
    cloudSpeed: 0.24,
    rain: 0.6,
    rainSpeed: 26,
    wind: 1.2,
    lightning: false,
    backdrop: "#6e8aa0",
    waterShallow: "#57a8ab",
    waterMid: "#2f8a95",
    waterDeep: "#11697c",
    waterHorizon: "#8aaec6",
  },
  badai: {
    label: "Storm",
    turbidity: 20,
    rayleigh: 3.5,
    mieCoefficient: 0.024,
    skySaturation: 1,
    sunPosition: [8, 4, 26],
    fogColor: "#526b7d",
    fogDensity: 0.013,
    ambient: 0.3,
    hemi: 0.35,
    sun: 0.35,
    sunColor: "#9aa6b4",
    cloudOpacity: 1,
    cloudColor: "#5f6c79",
    cloudSpeed: 0.45,
    rain: 1,
    rainSpeed: 40,
    wind: 3.2,
    lightning: true,
    backdrop: "#405a6e",
    waterShallow: "#407a85",
    waterMid: "#235f6e",
    waterDeep: "#0c4553",
    waterHorizon: "#526b7d",
  },
};

interface WeatherStore {
  kind: WeatherKind;
  setKind: (k: WeatherKind) => void;
}

export const useWeather = create<WeatherStore>((set) => ({
  kind: "cerah",
  setKind: (kind) => set({ kind }),
}));
