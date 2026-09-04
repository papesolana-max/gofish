/** Data-driven catch rules. All numbers come from the database tables; the
 *  constants below are only a boot-time snapshot used until the fetch lands. */

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic";

export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];

export interface FishSpecies {
  id: string;
  name: string;
  color: string;
  rarity: Rarity | null;
  min_weight_kg: number;
  max_weight_kg: number;
  is_monster: boolean;
  base_price_per_kg: number;
}

export interface Mutation {
  key: string;
  label: string;
  multiplier: number;
  drop_weight: number;
}

export interface RarityMultiplier {
  [rarity: string]: number | undefined;
}

export interface RodTier {
  id: string;
  name: string;
  max_catch_weight_kg: number;
}

export interface BaitTier {
  id: string;
  name: string;
  rarity_multiplier: RarityMultiplier;
}

export interface WeatherEffect {
  weather_kind: string;
  bite_window_seconds: number;
  rarity_multiplier: RarityMultiplier;
}

export interface WeatherCycleConfig {
  change_interval_seconds: number;
  weights: Record<string, number>;
}

export interface FishData {
  species: FishSpecies[];
  rarityWeights: Record<string, number>;
  rods: RodTier[];
  baits: BaitTier[];
  weather: Record<string, WeatherEffect>;
  config: Record<string, number>;
  weatherCycle: WeatherCycleConfig;
  mutations: Mutation[];
}

/** Active gear. A future shop swaps these ids; the formula stays untouched. */
export const ACTIVE_ROD_TIER = "common";
export const ACTIVE_BAIT_TIER = "basic_bait";

export const DEFAULT_BITE_WINDOW = 1.6;

/** Offline fallback mirroring the seeded rows. */
export const FALLBACK_FISH_DATA: FishData = {
  species: [
    { id: "clownfish", name: "Clownfish", color: "#f5a623", rarity: "common", min_weight_kg: 5, max_weight_kg: 40, is_monster: false, base_price_per_kg: 4 },
    { id: "mackerel", name: "Mackerel", color: "#8fd0e8", rarity: "rare", min_weight_kg: 35, max_weight_kg: 120, is_monster: false, base_price_per_kg: 6 },
    { id: "scad", name: "Scad", color: "#a7e0b0", rarity: "epic", min_weight_kg: 100, max_weight_kg: 300, is_monster: false, base_price_per_kg: 9 },
    { id: "red_snapper", name: "Red Snapper", color: "#e8734a", rarity: "legendary", min_weight_kg: 280, max_weight_kg: 650, is_monster: false, base_price_per_kg: 14 },
    { id: "baby_tuna", name: "Baby Tuna", color: "#5b7fa6", rarity: "mythic", min_weight_kg: 600, max_weight_kg: 1300, is_monster: false, base_price_per_kg: 22 },
    { id: "ancient_leviathan", name: "Ancient Leviathan", color: "#1e46b4", rarity: "mythic", min_weight_kg: 1200, max_weight_kg: 3000, is_monster: true, base_price_per_kg: 40 },
  ],
  rarityWeights: { common: 100, rare: 45, epic: 18, legendary: 6, mythic: 2 },
  rods: [
    { id: "common", name: "Common Rod", max_catch_weight_kg: 100 },
    { id: "rare", name: "Rare Rod", max_catch_weight_kg: 300 },
    { id: "epic", name: "Epic Rod", max_catch_weight_kg: 600 },
    { id: "legendary", name: "Legendary Rod", max_catch_weight_kg: 1000 },
    { id: "mythic", name: "Mythic Rod", max_catch_weight_kg: 2500 },
  ],
  baits: [
    {
      id: "basic_bait",
      name: "Basic Bait",
      rarity_multiplier: { common: 1, rare: 1, epic: 1, legendary: 1, mythic: 1 },
    },
  ],
  weather: {
    cerah: { weather_kind: "cerah", bite_window_seconds: 1.6, rarity_multiplier: {} },
    berawan: { weather_kind: "berawan", bite_window_seconds: 1.6, rarity_multiplier: {} },
    berkabut: { weather_kind: "berkabut", bite_window_seconds: 1.3, rarity_multiplier: { epic: 1.3, legendary: 1.3, mythic: 1.3 } },
    hujan: { weather_kind: "hujan", bite_window_seconds: 1.1, rarity_multiplier: { epic: 1.3, legendary: 1.5, mythic: 1.5 } },
    badai: { weather_kind: "badai", bite_window_seconds: 0.9, rarity_multiplier: { legendary: 1.8, mythic: 2.5 } },
  },
  config: { monster_catch_chance: 0.02, day_length_seconds: 720 },
  weatherCycle: {
    change_interval_seconds: 240,
    weights: { cerah: 40, berawan: 25, berkabut: 15, hujan: 12, badai: 8 },
  },
  mutations: [
    { key: "none", label: "Normal", multiplier: 1, drop_weight: 55 },
    { key: "big", label: "Big", multiplier: 1.2, drop_weight: 15 },
    { key: "dark", label: "Dark", multiplier: 1.3, drop_weight: 10 },
    { key: "albino", label: "Albino", multiplier: 1.4, drop_weight: 7 },
    { key: "sparkling", label: "Sparkling", multiplier: 1.5, drop_weight: 5 },
  ],
};

/** Module-level snapshot so the render loop can read rules synchronously. */
let current: FishData = FALLBACK_FISH_DATA;

export function setFishData(data: FishData) {
  current = data;
}

export function getFishData(): FishData {
  return current;
}

export function biteWindowFor(weatherKind: string): number {
  return current.weather[weatherKind]?.bite_window_seconds ?? DEFAULT_BITE_WINDOW;
}

export function mult(map: RarityMultiplier | undefined, rarity: string): number {
  const v = map?.[rarity];
  return typeof v === "number" && v > 0 ? v : 1;
}

/** Weighted mutation roll from the mutations table. */
export function rollMutation(): Mutation {
  const list = current.mutations.length ? current.mutations : FALLBACK_FISH_DATA.mutations;
  const total = list.reduce((a, m) => a + Math.max(0, m.drop_weight), 0);
  if (total <= 0) return list[0]!;
  let roll = Math.random() * total;
  for (const m of list) {
    roll -= Math.max(0, m.drop_weight);
    if (roll <= 0) return m;
  }
  return list[list.length - 1]!;
}

export function mutationFor(key: string): Mutation | undefined {
  return current.mutations.find((m) => m.key === key);
}

/** Sell price = base price per kg x weight x mutation multiplier (rounded). */
export function priceFor(speciesId: string, weightKg: number, mutationKey = "none"): number {
  const s = current.species.find((x) => x.id === speciesId);
  const m = mutationFor(mutationKey);
  return Math.round((s?.base_price_per_kg ?? 0) * weightKg * (m?.multiplier ?? 1));
}
