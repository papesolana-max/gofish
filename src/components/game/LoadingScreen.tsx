import { useProgress } from "@react-three/drei";
import { useEffect, useState } from "react";
import banner from "@/assets/loading-banner.jpg";

/**
 * Full-screen loading overlay shown while the ~27 MB of GLB models download
 * and the Draco decoder finishes. Fades out once assets are ready.
 */
export function LoadingScreen() {
  const { progress, active } = useProgress();
  const [hidden, setHidden] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!active && progress >= 100) {
      const a = window.setTimeout(() => setDone(true), 350);
      const b = window.setTimeout(() => setHidden(true), 1100);
      return () => {
        window.clearTimeout(a);
        window.clearTimeout(b);
      };
    }
    return undefined;
  }, [active, progress]);

  if (hidden) return null;

  const pct = Math.min(100, Math.round(progress));

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-slate-950 transition-opacity duration-700 ${
        done ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      role="status"
      aria-live="polite"
    >
      {/* Full-page banner image */}
      <div className="relative flex-1 overflow-hidden">
        <img
          src={banner}
          alt="An angler on a small-island pier with blocky fish leaping from the sea"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
      </div>

      {/* Loading info anchored at the bottom */}
      <div className="relative z-10 -mt-20 px-6 pb-10">
        <div className="mx-auto w-full max-w-3xl">
          <div className="text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-50 drop-shadow">Loading the island…</h2>
            <p className="mt-1 text-sm text-slate-200/90 drop-shadow">
              Preparing the sea, the pier, and everyone living under the waves
            </p>
          </div>

          {/* Progress bar with a fish swimming along it */}
          <div className="relative mt-7">
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800/80 backdrop-blur">
              <div
                className="h-full rounded-full bg-sky-400 transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div
              className="absolute -top-4 -translate-x-1/2 transition-[left] duration-300 ease-out"
              style={{ left: `${pct}%` }}
            >
              <span className="animate-fish-swim block text-2xl leading-none drop-shadow">🐟</span>
            </div>
          </div>

          <p className="mt-4 text-center text-sm font-medium tabular-nums text-sky-300">{pct}%</p>
        </div>
      </div>
    </div>
  );
}
