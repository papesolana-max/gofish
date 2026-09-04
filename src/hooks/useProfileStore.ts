import { create } from "zustand";
import type { Tables } from "@/integrations/supabase/types";
import type { WalletProof } from "@/lib/walletAuth";

export type Profile = Tables<"profiles">;

interface ProfileStore {
  address: string | null;
  proof: WalletProof | null;
  profile: Profile | null;
  loading: boolean;
  panelOpen: boolean;
  setAddress: (address: string | null) => void;
  setProof: (proof: WalletProof | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  setPanelOpen: (open: boolean) => void;
  reset: () => void;
}

export const useProfileStore = create<ProfileStore>((set) => ({
  address: null,
  proof: null,
  profile: null,
  loading: false,
  panelOpen: false,
  setAddress: (address) => set({ address }),
  setProof: (proof) => set({ proof }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  reset: () => set({ address: null, proof: null, profile: null, loading: false, panelOpen: false }),
}));
