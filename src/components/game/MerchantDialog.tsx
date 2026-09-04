import { useCallback, useEffect, useState } from "react";
import { X, Coins, Fish as FishIcon, Loader2 } from "lucide-react";
import { useMerchant } from "@/hooks/useMerchant";
import { useProfileStore } from "@/hooks/useProfileStore";
import { getFishData, mutationFor, priceFor } from "@/lib/fishRules";
import { getInventory, sellFish } from "@/lib/profile.functions";

interface InventoryItem {
  id: string;
  species_id: string;
  weight_kg: number;
  mutation_key: string;
  caught_at: string;
}

const SMALL_TALK = [
  "The reef's been generous this week. Bring me anything with fins.",
  "Storms scare the tourists off, but the big ones bite hardest then.",
  "A sparkling catch fetches half again the coin. Keep your eyes open.",
  "Heaviest fish I ever bought? A leviathan. Nearly sank my scales.",
];

function speciesName(id: string) {
  return getFishData().species.find((s) => s.id === id)?.name ?? id;
}

export function MerchantDialog() {
  const open = useMerchant((s) => s.open);
  const setOpen = useMerchant((s) => s.setOpen);
  const proof = useProfileStore((s) => s.proof);
  const profile = useProfileStore((s) => s.profile);
  const setProfile = useProfileStore((s) => s.setProfile);

  const [stage, setStage] = useState<"greeting" | "sell" | "talk">("greeting");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talk, setTalk] = useState(SMALL_TALK[0]!);

  const refresh = useCallback(async () => {
    if (!proof) return;
    setLoading(true);
    setError(null);
    try {
      setItems((await getInventory({ data: proof })) as InventoryItem[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your catch.");
    } finally {
      setLoading(false);
    }
  }, [proof]);

  useEffect(() => {
    if (!open) {
      setStage("greeting");
      return;
    }
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const total = items.reduce(
    (a, i) => a + priceFor(i.species_id, i.weight_kg, i.mutation_key),
    0,
  );

  const doSell = async (payload: { itemId?: string; speciesId?: string; sellAll?: boolean }) => {
    if (!proof) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await sellFish({ data: { proof, ...payload } });
      if (updated) setProfile(updated);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The sale failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const bySpecies = new Map<string, InventoryItem[]>();
  for (const i of items) {
    const list = bySpecies.get(i.species_id) ?? [];
    list.push(i);
    bySpecies.set(i.species_id, list);
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 pb-10 backdrop-blur-[2px]">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-slate-900/90 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-400/20 text-amber-300">
            <FishIcon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-50">Marlo, Fish Merchant</p>
            <p className="truncate text-[11px] text-slate-400">Koleo Island dock stall</p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-xs font-semibold text-amber-300">
            <Coins className="h-3.5 w-3.5" aria-hidden />
            {Math.round(Number(profile?.coins ?? 0)).toLocaleString()}
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[46vh] overflow-y-auto px-4 py-4">
          {!proof ? (
            <p className="text-sm text-slate-300">
              "Connect your wallet first, angler — I only trade with registered crews."
            </p>
          ) : stage === "greeting" ? (
            <p className="text-sm leading-relaxed text-slate-200">
              "Welcome to my stall! I buy anything you pull out of these waters — the
              heavier and the stranger, the better the coin."
            </p>
          ) : stage === "talk" ? (
            <p className="text-sm leading-relaxed text-slate-200">"{talk}"</p>
          ) : loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Weighing your catch…
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-slate-300">"Empty basket. Go land me something!"</p>
          ) : (
            <div className="space-y-4">
              {[...bySpecies.entries()].map(([sid, list]) => {
                const groupValue = list.reduce(
                  (a, i) => a + priceFor(i.species_id, i.weight_kg, i.mutation_key),
                  0,
                );
                return (
                  <div key={sid} className="rounded-xl border border-white/10 bg-white/[0.03]">
                    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
                      <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-300">
                        {speciesName(sid)} · {list.length}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => doSell({ speciesId: sid })}
                        className="rounded-md bg-amber-400/90 px-2.5 py-1 text-[11px] font-semibold text-slate-900 transition-colors hover:bg-amber-300 disabled:opacity-50"
                      >
                        Sell all · {groupValue.toLocaleString()}
                      </button>
                    </div>
                    <ul className="divide-y divide-white/5">
                      {list.map((i) => {
                        const m = mutationFor(i.mutation_key);
                        const price = priceFor(i.species_id, i.weight_kg, i.mutation_key);
                        return (
                          <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                            <span className="flex-1 text-slate-200">
                              {i.weight_kg.toFixed(2)} kg
                              {m && m.key !== "none" && (
                                <span className="ml-2 rounded bg-fuchsia-400/15 px-1.5 py-0.5 text-[10px] font-semibold text-fuchsia-300">
                                  {m.label} ×{m.multiplier}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => doSell({ itemId: i.id })}
                              className="rounded-md border border-white/15 px-2 py-1 font-semibold text-amber-300 transition-colors hover:bg-white/10 disabled:opacity-50"
                            >
                              Sell · {price.toLocaleString()}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
          {stage !== "sell" && (
            <button
              type="button"
              disabled={!proof}
              onClick={() => setStage("sell")}
              className="rounded-lg bg-amber-400/90 px-3 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-amber-300 disabled:opacity-50"
            >
              Sell my fish
            </button>
          )}
          {stage === "sell" && items.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => doSell({ sellAll: true })}
              className="rounded-lg bg-amber-400/90 px-3 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-amber-300 disabled:opacity-50"
            >
              Sell everything · {total.toLocaleString()}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setTalk(SMALL_TALK[Math.floor(Math.random() * SMALL_TALK.length)]!);
              setStage("talk");
            }}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10"
          >
            Just chat
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-auto rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10"
          >
            Goodbye
          </button>
        </div>
      </div>
    </div>
  );
}
