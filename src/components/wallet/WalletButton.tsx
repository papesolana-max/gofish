import { useEffect, useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { Wallet } from "lucide-react";
import { formatUnits } from "viem";
import { robinhoodChain } from "@/lib/chains";
import { useProfileStore } from "@/hooks/useProfileStore";
import { useWalletProfile } from "@/hooks/useWalletProfile";
import { supabase } from "@/integrations/supabase/client";
import goldLogo from "@/assets/logo-gold.png";
import coinsLogo from "@/assets/logo-coins.png";
import { xpProgressFor } from "@/lib/xp";

/** Round profile avatar: uploaded photo when available, initials otherwise, with a level badge. */
function ProfileAvatar({ size = "h-9 w-9" }: { size?: string }) {
  const profile = useProfileStore((s) => s.profile);
  const loading = useProfileStore((s) => s.loading);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const path = profile?.avatar_url;
    if (!path) {
      setAvatarUrl(null);
      return;
    }
    void supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 24 * 7)
      .then(({ data }) => {
        if (!cancelled) setAvatarUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.avatar_url]);

  const initials = (profile?.display_name || profile?.username || "A").slice(0, 2).toUpperCase();
  const level = profile?.level ?? 1;

  return (
    <span
      className={`relative block ${size} shrink-0 rounded-full border border-white/25 bg-slate-800/80 text-xs font-semibold text-slate-50`}
    >
      <span className="block h-full w-full overflow-hidden rounded-full">
        {avatarUrl ? (
          <img src={avatarUrl} alt="Profile picture" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            {loading ? "…" : initials}
          </span>
        )}
      </span>
      <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-white/30 bg-emerald-600 px-0.5 text-[9px] font-bold leading-none text-white shadow">
        {level}
      </span>
    </span>
  );
}

function BalanceRow({ symbol, value, logo }: { symbol: string; value: string; logo: string }) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1 text-[11px] leading-tight">
      <span className="flex items-center gap-1.5 font-medium text-slate-300">
        <img src={logo} alt={`${symbol} logo`} className="h-5 w-5 rounded-full object-cover" />
        {symbol}
      </span>
      <span className="font-semibold tabular-nums text-slate-50">{value}</span>
    </div>
  );
}

/** Normalizes zero balances so every token shows a single "0" when empty. */
function displayBalance(value: string | number) {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return n === 0 ? "0" : String(value);
}

export function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { authenticate } = useWalletProfile();
  const profile = useProfileStore((s) => s.profile);
  const loading = useProfileStore((s) => s.loading);
  const setPanelOpen = useProfileStore((s) => s.setPanelOpen);
  const xp = xpProgressFor(profile?.xp);

  const { data: ethBalance } = useBalance({
    address,
    chainId: robinhoodChain.id,
    query: { enabled: isConnected && chainId === robinhoodChain.id },
  });

  const wrongNetwork = isConnected && chainId !== robinhoodChain.id;
  const connector = connectors.find((c) => c.id === "injected") ?? connectors[0];

  const pill =
    "pointer-events-auto rounded-full border border-white/25 bg-slate-900/55 px-4 py-2 text-sm font-medium text-slate-50 shadow-lg backdrop-blur-md transition-colors hover:bg-slate-900/75 disabled:opacity-60";

  if (!isConnected) {
    return (
      <button
        className={`${pill} flex items-center gap-2`}
        disabled={isPending || !connector}
        onClick={() => connector && connect({ connector, chainId: robinhoodChain.id })}
      >
        <Wallet className="h-4 w-4" aria-hidden />
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
    );
  }

  if (wrongNetwork) {
    return (
      <button
        className={`${pill} bg-amber-500/80 hover:bg-amber-500`}
        disabled={switching}
        onClick={() => switchChain({ chainId: robinhoodChain.id })}
      >
        {switching ? "Switching…" : "Switch to Robinhood Chain"}
      </button>
    );
  }

  const ethValue = displayBalance(
    ethBalance ? Number.parseFloat(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(4) : "0"
  );

  return (
    <div className="pointer-events-auto w-44 overflow-hidden rounded-xl border border-white/20 bg-slate-900/60 shadow-lg backdrop-blur-md">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          if (!profile) {
            const ok = await authenticate();
            if (!ok) return;
          }
          setPanelOpen(true);
        }}
        className="flex w-full items-center gap-2 border-b border-white/10 px-2.5 py-2 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
        title="Open profile"
      >
        <ProfileAvatar />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-50">
            {profile?.display_name || profile?.username || "Set up profile"}
          </span>
          <span className="block text-[10px] text-slate-400">
            Level {profile?.level ?? 1} &middot; {xp.into.toLocaleString()}/{xp.span.toLocaleString()} XP
          </span>
          <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full rounded-full bg-sky-400" style={{ width: `${xp.percent}%` }} />
          </span>
        </span>
      </button>
      <div className="divide-y divide-white/5">
        <BalanceRow symbol="ETH" value={ethValue} logo="/logo-eth.png" />
        <BalanceRow symbol="USDG" value={displayBalance("0.00")} logo="/logo-usdg.png" />
        <BalanceRow symbol="GOLD" value={displayBalance(0)} logo={goldLogo} />
        <BalanceRow symbol="COINS" value={displayBalance(Number(profile?.coins ?? 0).toLocaleString())} logo={coinsLogo} />
      </div>
    </div>
  );
}
