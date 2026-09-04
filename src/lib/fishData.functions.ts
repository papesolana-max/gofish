import { createServerFn } from "@tanstack/react-start";
import type {
  BaitTier,
  FishData,
  FishSpecies,
  Mutation,
  RodTier,
  WeatherCycleConfig,
  WeatherEffect,
} from "./fishRules";
import { FALLBACK_FISH_DATA } from "./fishRules";

/** Public read-only game rules. Safe for anonymous callers. */
export const getFishData = createServerFn({ method: "GET" }).handler(async (): Promise<FishData> => {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });

  const [species, rarity, rods, baits, weather, config, cycle, mutations] = await Promise.all([
    supabase
      .from("fish_species")
      .select("id, name, color, rarity, min_weight_kg, max_weight_kg, is_monster, base_price_per_kg"),
    supabase.from("rarity_base_weights").select("rarity, base_weight"),
    supabase.from("rod_tiers").select("id, name, max_catch_weight_kg"),
    supabase.from("bait_tiers").select("id, name, rarity_multiplier"),
    supabase.from("weather_effects").select("weather_kind, bite_window_seconds, rarity_multiplier"),
    supabase.from("game_config").select("key, value"),
    supabase
      .from("weather_cycle_config")
      .select("change_interval_seconds, weights")
      .eq("id", "default")
      .maybeSingle(),
    supabase.from("mutations").select("key, label, multiplier, drop_weight"),
  ]);

  const firstError = [species, rarity, rods, baits, weather, config, cycle, mutations].find((r) => r.error)?.error;
  if (firstError) {
    // Transient upstream problems (gateway clock skew -> "JWT issued at future",
    // network blips) must never blank-screen the game: serve the bundled rules.
    console.error("[getFishData] falling back to bundled rules:", firstError.message);
    return FALLBACK_FISH_DATA;
  }
  if (!species.data || species.data.length === 0) return FALLBACK_FISH_DATA;

  const rarityWeights: Record<string, number> = {};
  for (const row of (rarity.data ?? []) as Array<{ rarity: string; base_weight: number }>) {
    rarityWeights[row.rarity] = Number(row.base_weight);
  }

  const weatherMap: Record<string, WeatherEffect> = {};
  for (const row of (weather.data ?? []) as WeatherEffect[]) {
    weatherMap[row.weather_kind] = {
      weather_kind: row.weather_kind,
      bite_window_seconds: Number(row.bite_window_seconds),
      rarity_multiplier: row.rarity_multiplier ?? {},
    };
  }

  const cfg: Record<string, number> = {};
  for (const row of (config.data ?? []) as Array<{ key: string; value: number }>) {
    cfg[row.key] = Number(row.value);
  }

  return {
    species: ((species.data ?? []) as FishSpecies[]).map((s) => ({
      ...s,
      min_weight_kg: Number(s.min_weight_kg),
      max_weight_kg: Number(s.max_weight_kg),
      base_price_per_kg: Number(s.base_price_per_kg),
    })),
    rarityWeights,
    rods: ((rods.data ?? []) as RodTier[]).map((r) => ({
      ...r,
      max_catch_weight_kg: Number(r.max_catch_weight_kg),
    })),
    baits: ((baits.data ?? []) as BaitTier[]).map((b) => ({
      ...b,
      rarity_multiplier: b.rarity_multiplier ?? {},
    })),
    weather: weatherMap,
    config: cfg,
    weatherCycle: {
      change_interval_seconds: Number(
        (cycle.data as WeatherCycleConfig | null)?.change_interval_seconds ?? 240,
      ),
      weights:
        ((cycle.data as WeatherCycleConfig | null)?.weights as Record<string, number> | undefined) ??
        { cerah: 40, berawan: 25, berkabut: 15, hujan: 12, badai: 8 },
    },
    mutations: ((mutations.data ?? []) as Mutation[]).map((m) => ({
      ...m,
      multiplier: Number(m.multiplier),
      drop_weight: Number(m.drop_weight),
    })),
  };
});
