/**
 * Local asset library.
 *
 * Uploaded model/texture files are stored as blobs in IndexedDB so a layout the
 * user saved keeps working after a reload (a blob: URL would be dead by then).
 * Each asset gets a stable id; the world layout only references the id.
 */

export interface AssetRecord {
  id: string;
  name: string;
  ext: string;
  size: number;
  addedAt: number;
}

interface StoredAsset extends AssetRecord {
  blob: Blob;
}

const DB_NAME = "world-assets";
const STORE = "files";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const SUPPORTED_EXT = [
  "glb",
  "gltf",
  "fbx",
  "obj",
  "stl",
  "ply",
  "dae",
  "3mf",
  "vox",
] as const;

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export async function putAsset(file: File): Promise<AssetRecord> {
  const rec: StoredAsset = {
    id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    ext: extOf(file.name),
    size: file.size,
    addedAt: Date.now(),
    blob: file,
  };
  await tx("readwrite", (s) => s.put(rec) as IDBRequest<IDBValidKey>);
  return { id: rec.id, name: rec.name, ext: rec.ext, size: rec.size, addedAt: rec.addedAt };
}

export async function listAssets(): Promise<AssetRecord[]> {
  const all = await tx<StoredAsset[]>("readonly", (s) => s.getAll() as IDBRequest<StoredAsset[]>);
  return all
    .map(({ id, name, ext, size, addedAt }) => ({ id, name, ext, size, addedAt }))
    .sort((a, b) => a.addedAt - b.addedAt);
}

export async function deleteAsset(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
  const u = urlCache.get(id);
  if (u) {
    URL.revokeObjectURL(u);
    urlCache.delete(id);
  }
}

const urlCache = new Map<string, string>();

/** Stable object URL for a stored asset (created once per session). */
export async function assetUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const rec = await tx<StoredAsset | undefined>(
    "readonly",
    (s) => s.get(id) as IDBRequest<StoredAsset | undefined>,
  );
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}
