import { create } from "zustand";

interface MerchantStore {
  /** true while the player stands close enough to press E */
  near: boolean;
  /** true while the dialog overlay is open */
  open: boolean;
  setNear: (near: boolean) => void;
  setOpen: (open: boolean) => void;
}

export const useMerchant = create<MerchantStore>((set) => ({
  near: false,
  open: false,
  setNear: (near) => set({ near }),
  setOpen: (open) => set({ open }),
}));

/** Where the merchant stands, just in front of the FISHSHOP stall. */
export const MERCHANT_POS: [number, number] = [8.6, 9.6];
export const MERCHANT_TALK_DIST = 5.5;
