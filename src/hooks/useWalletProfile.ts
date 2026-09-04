import { useCallback, useEffect, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { toast } from "sonner";
import { useProfileStore } from "./useProfileStore";
import { buildAuthMessage, type WalletProof } from "@/lib/walletAuth";
import { ensureProfile } from "@/lib/profile.functions";

/**
 * Syncs the connected wallet with the player profile: asks for one ownership
 * signature per session, then loads (or creates) the profile row.
 */
export function useWalletProfile() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { proof, setAddress, setProof, setProfile, setLoading, reset } = useProfileStore();
  const busy = useRef(false);

  useEffect(() => {
    if (!isConnected || !address) {
      reset();
      return;
    }
    setAddress(address.toLowerCase());
  }, [address, isConnected, reset, setAddress]);

  const authenticate = useCallback(async (): Promise<WalletProof | null> => {
    if (!address) return null;
    if (proof && proof.address.toLowerCase() === address.toLowerCase()) return proof;
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
  }, [address, proof, setLoading, setProfile, setProof, signMessageAsync]);

  return { authenticate };
}
