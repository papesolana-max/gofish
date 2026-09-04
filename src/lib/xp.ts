/** XP curve mirroring the database: level N requires 100 * (N-1)^2 total XP. */

export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return 100 * (n - 1) * (n - 1);
}

export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
}

export interface XpProgress {
  level: number;
  total: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP needed to finish the current level. */
  span: number;
  percent: number;
}

export function xpProgressFor(xp: number | null | undefined): XpProgress {
  const total = Math.max(0, Math.round(Number(xp ?? 0)));
  const level = levelForXp(total);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = Math.max(1, next - floor);
  const into = Math.min(span, total - floor);
  return { level, total, into, span, percent: Math.round((into / span) * 100) };
}

/** XP awarded for a catch — mirrors public.xp_for_rarity + mutation multiplier. */
export function xpForCatch(rarity: string, mutationMultiplier = 1): number {
  const base =
    rarity === "common" ? 10
    : rarity === "rare" ? 25
    : rarity === "epic" ? 60
    : rarity === "legendary" ? 150
    : rarity === "mythic" ? 400
    : 5;
  return Math.max(1, Math.round(base * mutationMultiplier));
}
