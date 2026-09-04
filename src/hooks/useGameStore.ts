import { create } from "zustand";
import {
  ACTIVE_BAIT_TIER,
  ACTIVE_ROD_TIER,
  getFishData,
  mult,
  rollMutation,
  type FishSpecies,
  type Rarity,
} from "@/lib/fishRules";

export type Phase = "idle" | "cast" | "waiting" | "bite" | "reel" | "caught";

export interface FishCatch {
  speciesId: string;
  name: string;
  mutationKey: string;
  mutationLabel: string;
  weight: number;
  color: string;
  rarity?: Rarity | null;
  isMonster?: boolean;
}

function rollWeight(s: FishSpecies) {
  return Number((s.min_weight_kg + Math.random() * (s.max_weight_kg - s.min_weight_kg)).toFixed(2));
}

function toCatch(s: FishSpecies): FishCatch {
  const m = rollMutation();
  return {
    speciesId: s.id,
    name: s.name,
    mutationKey: m.key,
    mutationLabel: m.label,
    color: s.color,
    weight: rollWeight(s),
    rarity: s.rarity,
    ...(s.is_monster ? { isMonster: true } : {}),
  };
}

/**
 * Data-driven roll: monster chance from game_config, pool filtered by the
 * active rod's weight cap, then weighted by rarity × bait × weather.
 */
export function rollFish(weatherKind = "cerah"): FishCatch {
  const data = getFishData();
  const monster = data.species.find((s) => s.is_monster);
  const chance = data.config["monster_catch_chance"] ?? 0;
  if (monster && Math.random() < chance) return toCatch(monster);

  const rod = data.rods.find((r) => r.id === ACTIVE_ROD_TIER);
  const cap = rod?.max_catch_weight_kg ?? Infinity;
  const bait = data.baits.find((b) => b.id === ACTIVE_BAIT_TIER);
  const weather = data.weather[weatherKind];

  const pool = data.species.filter((s) => !s.is_monster && s.min_weight_kg <= cap);
  if (pool.length === 0) return toCatch(data.species[0] ?? (monster as FishSpecies));

  const weights = pool.map((s) => {
    const r = s.rarity ?? "common";
    const base = data.rarityWeights[r] ?? 1;
    return Math.max(0, base * mult(bait?.rarity_multiplier, r) * mult(weather?.rarity_multiplier, r));
  });
  const total = weights.reduce((a, b) => a + b, 0);

  let pick = pool[pool.length - 1]!;
  if (total > 0) {
    let roll = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) {
        pick = pool[i]!;
        break;
      }
    }
  }

  return toCatch(pick);
}

/** Fire-and-forget profile counter sync. Never blocks or breaks gameplay. */
function syncCatchToProfile(f: FishCatch) {
  const rarity: Rarity = f.isMonster ? "mythic" : ((f.rarity ?? "common") as Rarity);
  void (async () => {
    try {
      const { useProfileStore } = await import("@/hooks/useProfileStore");
      const proof = useProfileStore.getState().proof;
      if (!proof) {
        const { toast } = await import("sonner");
        toast.error("Catch not saved — connect your wallet and sign to sync your profile.");
        return;
      }
      const { recordCatch } = await import("@/lib/profile.functions");
      const profile = await recordCatch({
        data: {
          proof,
          rarity,
          speciesId: f.speciesId,
          weightKg: f.weight,
          mutationKey: f.mutationKey,
        },
      });
      if (profile) useProfileStore.getState().setProfile(profile);
    } catch (error) {
      const { toast } = await import("sonner");
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Could not save your catch: ${message}`);
    }
  })();
}





interface GameStore {
  phase: Phase;
  message: string;
  score: number;
  totalWeight: number;
  last: FishCatch | null;
  /** true = rod stowed on back */
  rodStowed: boolean;
  setPhase: (p: Phase) => void;
  setMessage: (m: string) => void;
  setRodStowed: (v: boolean) => void;
  toggleRodStowed: () => void;
  landFish: (f: FishCatch) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  phase: "idle",
  message: "Press SPACE to cast your line",
  score: 0,
  totalWeight: 0,
  last: null,
  rodStowed: false,
  setPhase: (phase) => set({ phase }),
  setMessage: (message) => set({ message }),
  setRodStowed: (rodStowed) => set({ rodStowed }),
  toggleRodStowed: () => set((s) => ({ rodStowed: !s.rodStowed })),
  landFish: (f) => {
    syncCatchToProfile(f);
    set((s) => ({
      score: s.score + 1,
      totalWeight: Number((s.totalWeight + f.weight).toFixed(2)),
      last: f,
    }));
  },
}));

