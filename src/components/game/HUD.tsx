import {
  Clock,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  Moon,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import { useGameStore } from "@/hooks/useGameStore";
import { useWeather, WEATHER, type WeatherKind } from "@/hooks/useWeather";
import { useDayNight, dayLabelFor, type DayLabel } from "@/hooks/useDayNight";
import type { Rarity } from "@/lib/fishRules";

const DAY_ICON = {
  Dawn: Sunrise,
  Day: Sun,
  Dusk: Sunset,
  Night: Moon,
} satisfies Record<DayLabel, typeof Sun>;

const WEATHER_ICON: Record<WeatherKind, typeof Sun> = {
  cerah: Sun,
  berawan: Cloud,
  berkabut: CloudFog,
  hujan: CloudRain,
  badai: CloudLightning,
};

/** 12-hour clock label, e.g. "11:07 PM". */
function formatClock(hour: number) {
  const h = Math.floor(((hour % 24) + 24) % 24);
  const m = Math.floor((((hour % 1) + 1) % 1) * 60);
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}



const RARITY_BADGE: Record<Rarity, string> = {
  common: "border-slate-400/40 bg-slate-400/20 text-slate-100",
  rare: "border-sky-400/50 bg-sky-500/20 text-sky-100",
  epic: "border-violet-400/50 bg-violet-500/20 text-violet-100",
  legendary: "border-orange-400/50 bg-orange-500/20 text-orange-100",
  mythic: "border-amber-300/60 bg-gradient-to-r from-amber-500/30 to-red-500/30 text-amber-100",
};

export function HUD() {
  const { phase, message, score, totalWeight, last } = useGameStore();
  const bite = phase === "bite";
  const rarity = (last?.isMonster ? "mythic" : last?.rarity) as Rarity | undefined;
  const weatherKind = useWeather((s) => s.kind);
  const hour = useDayNight((s) => s.hour);
  const dayLabel = dayLabelFor(hour);
  const DayIcon = DAY_ICON[dayLabel];
  const WeatherIcon = WEATHER_ICON[weatherKind];




  return (
    <div className="pointer-events-none fixed inset-0 z-10 select-none">
      {phase === "caught" && last?.isMonster && (
        <div
          key={score}
          className="animate-monster-flash fixed inset-0 z-50"
          aria-hidden="true"
        />
      )}
      <div className="flex items-start justify-between p-4 sm:p-6">
        <div className="rounded-2xl border border-white/25 bg-slate-900/45 px-4 py-3 text-slate-50 shadow-lg backdrop-blur-md">
          <h1 className="text-base font-semibold tracking-tight sm:text-lg">Koleo Island</h1>
          <p className="mt-1 text-xs text-slate-200/80">
            Caught <span className="font-semibold text-slate-50">{score}</span> · Total{" "}
            <span className="font-semibold text-slate-50">{totalWeight} kg</span>
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          {last && (
            <div className="rounded-2xl border border-white/25 bg-slate-900/45 px-4 py-3 text-right text-slate-50 shadow-lg backdrop-blur-md">
              <p className="text-[11px] uppercase tracking-widest text-slate-300/80">Latest</p>
              <p className="text-sm font-semibold">{last.name}</p>
              <p className="text-xs text-slate-200/80">{last.weight} kg</p>
              {rarity && (
                <span
                  className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${RARITY_BADGE[rarity]}`}
                >
                  {rarity}
                </span>
              )}

            </div>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3 px-4">
        {bite && (
          <div className="animate-pulse rounded-full bg-red-500/90 px-6 py-2 text-lg font-bold tracking-wide text-white shadow-xl">
            ! BITE !
          </div>
        )}
        <div className="rounded-full border border-white/25 bg-slate-900/50 px-5 py-2 text-center text-sm text-slate-50 shadow-lg backdrop-blur-md">
          {message}
        </div>
        <p className="text-[11px] text-slate-900/60">
          WASD = move · SPACE = jump · ENTER / left click = cast &amp; reel · E = board/leave boat · R = stow/draw rod · right click = rotate
          camera · scroll = zoom
        </p>
      </div>

      {/* Bottom-left status: weather + time of day */}
      <div className="absolute bottom-4 left-4 flex flex-col items-start gap-1.5 text-slate-50 drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
        <div className="flex items-center gap-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/25 bg-slate-900/55 shadow-lg backdrop-blur-md">
            <DayIcon size={16} />
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/25 bg-slate-900/55 shadow-lg backdrop-blur-md">
            <WeatherIcon size={16} />
          </span>
          <span className="rounded-lg border border-white/25 bg-slate-900/55 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest shadow-lg backdrop-blur-md">
            {WEATHER[weatherKind].label}
          </span>
        </div>
        <p className="text-2xl font-extrabold tracking-tight">Koleo Island</p>
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Clock size={15} />
          <span className="tabular-nums">{formatClock(hour)}</span>
          <span className="text-slate-200/80">· {dayLabel}</span>
        </div>
      </div>


    </div>
  );
}
