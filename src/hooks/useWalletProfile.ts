import { useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { toast } from "sonner";
import { useProfileStore } from "./useProfileStore";
import {
  buildAuthMessage,
  clearStoredProof,
  loadStoredProof,
  storeProof,
  type WalletProof,
} from "@/lib/walletAuth";
import { ensureProfile } from "@/lib/profile.functions";

/**
 * Syncs the connected wallet with the player profile. The ownership signature
 * is cached in localStorage for 24h and re-requested automatically as soon as
 * the wallet connects, so catches are always persisted — even right after a
 * page reload, without opening the profile panel first.
 */
export function useWalletProfile() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { proof, setAddress, setProof, setProfile, setLoading, reset } = useProfileStore();
  const busy = useRef(false);
  const autoTried = useRef<string | null>(null);

  const authenticate = useCallback(async (): Promise<WalletProof | null> => {
    if (!address) return null;
    const current = useProfileStore.getState().proof;
    if (current && current.address.toLowerCase() === address.toLowerCase()) return current;

    const cached = loadStoredProof(address);
    if (cached) {
      setProof(cached);
      try {
        setProfile(await ensureProfile({ data: cached }));
        return cached;
      } catch {
        // stale/rejected cache — fall through to a fresh signature
        clearStoredProof();
        setProof(null);
      }
    }

    if (busy.current) return null;
    busy.current = true;
    setLoading(true);
    try {
      const issuedAt = new Date().toISOString();
      const signature = await signMessageAsync({
        message: buildAuthMessage(address, issuedAt),
      });
      const next: WalletProof = { address, issuedAt, signature };
      setProof(next);
      storeProof(next);
      const row = await ensureProfile({ data: next });
      setProfile(row);
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not verify your wallet.";
      toast.error(message);
      return null;
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [address, setLoading, setProfile, setProof, signMessageAsync]);

  useEffect(() => {
    if (!isConnected || !address) {
      autoTried.current = null;
      reset();
      return;
    }
    setAddress(address.toLowerCase());
    const key = address.toLowerCase();
    if (autoTried.current === key) return;
    autoTried.current = key;
    void authenticate();
  }, [address, authenticate, isConnected, reset, setAddress]);

  return { authenticate, proof };
}
