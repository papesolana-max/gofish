/** Shared helpers for the wallet-signature ownership proof. */

export const SIGNATURE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function buildAuthMessage(address: string, issuedAt: string) {
  return [
    "Fishing Island — profile authentication",
    `Wallet: ${address.toLowerCase()}`,
    `Issued at: ${issuedAt}`,
    "",
    "Signing this message proves you own this wallet. It costs no gas.",
  ].join("\n");
}

export interface WalletProof {
  address: string;
  issuedAt: string;
  signature: string;
}
