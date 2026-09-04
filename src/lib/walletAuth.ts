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

const PROOF_STORAGE_KEY = "fishing-island-wallet-proof-v1";

function isFresh(proof: WalletProof) {
  const issued = Date.parse(proof.issuedAt);
  return !Number.isNaN(issued) && Date.now() - issued < SIGNATURE_MAX_AGE_MS - 60_000;
}

/** Reads the cached proof for `address` (24h validity), or null. */
export function loadStoredProof(address: string): WalletProof | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PROOF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WalletProof;
    if (!parsed?.address || !parsed.signature || !parsed.issuedAt) return null;
    if (parsed.address.toLowerCase() !== address.toLowerCase()) return null;
    if (!isFresh(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeProof(proof: WalletProof) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PROOF_STORAGE_KEY, JSON.stringify(proof));
  } catch {
    /* private mode / quota — proof simply stays in memory */
  }
}

export function clearStoredProof() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(PROOF_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
