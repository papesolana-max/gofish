/**
 * Model binaries live in the repository at `public/models/*.glb` (Draco +
 * WebP compressed), so they work identically when running locally, after a
 * clone, or after a remix — no external CDN involved.
 */
export function resolveModelUrl(url: string): string {
  return url;
}
