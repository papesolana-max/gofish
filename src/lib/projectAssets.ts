/**
 * Client helpers that talk to the dev-only "bake into project" endpoints
 * (see plugins/worldAssetsDev.ts). In the dev/preview environment the model
 * file is written into public/models/ and the layout into
 * src/data/worldLayout.json, so both become part of the code and survive
 * clone / remix.
 */

export const canBakeToProject = import.meta.env.DEV;

export type BakeResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export interface UploadedProjectModel {
  url: string;
  legacyUrl: string;
}

export async function uploadModelToProject(file: File): Promise<BakeResult<UploadedProjectModel>> {
  if (!canBakeToProject) return { ok: false, error: "Bake hanya tersedia di mode preview/dev." };
  try {
    const res = await fetch(`/__world/model?name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      body: file,
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const data = (await res.json()) as { url?: string; legacyUrl?: string };
    if (!data.url) return { ok: false, error: "Server tidak mengembalikan URL model." };
    return { ok: true, value: { url: data.url, legacyUrl: data.legacyUrl ?? data.url } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function saveLayoutToProject(
  payload: unknown,
  opts: { force?: boolean } = {},
): Promise<BakeResult<number>> {
  if (!canBakeToProject) return { ok: false, error: "Bake hanya tersedia di mode preview/dev." };
  try {
    const res = await fetch(`/__world/layout${opts.force ? "?force=1" : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: await readError(res) };
    const data = (await res.json()) as { updatedAt?: number };
    return { ok: true, value: data.updatedAt ?? Date.now() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}


/** Read the layout currently baked in the project (dev only). */
export async function fetchProjectLayout<T>(): Promise<T | null> {
  if (!canBakeToProject) return null;
  try {
    const res = await fetch("/__world/layout", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
