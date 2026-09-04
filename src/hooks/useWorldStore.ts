import { create } from "zustand";
import { extOf, type AssetRecord } from "@/lib/assetLibrary";
import { canBakeToProject, fetchProjectLayout, saveLayoutToProject } from "@/lib/projectAssets";
import seedLayout from "@/data/worldLayout.json";

export type Vec3 = [number, number, number];

export interface WorldObject {
  id: string;
  name: string;
  /** id of an uploaded asset in IndexedDB (device-local, does NOT survive clone/remix) */
  assetId?: string;
  /** direct URL / project path, e.g. "/models/island.glb" (survives clone/remix) */
  url?: string;
  ext: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  /** player can stand on it (ground raycast) */
  walkable: boolean;
  /** blocks the player (bounding box) */
  solid: boolean;
  visible: boolean;
}

export interface WorldLayout {
  version: 1;
  /** epoch ms of the last change; used to pick the newest source on load */
  updatedAt?: number;
  objects: WorldObject[];
}

const STORAGE_KEY = "world-layout-v1";

function readSeed(): WorldLayout {
  const s = seedLayout as Partial<WorldLayout>;
  return { version: 1, updatedAt: s.updatedAt ?? 0, objects: Array.isArray(s.objects) ? s.objects : [] };
}

function readLocal(): WorldLayout | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorldLayout>;
    if (!Array.isArray(parsed.objects)) return null;
    return { version: 1, updatedAt: parsed.updatedAt ?? 1, objects: parsed.objects };
  } catch {
    return null;
  }
}

/**
 * Merge the project file (src/data/worldLayout.json, survives clone/remix)
 * with this browser's localStorage. A UNION by id is used on purpose: a stale
 * tab must never be able to delete objects that another tab already baked.
 */
function mergeLayouts(a: WorldLayout | null, b: WorldLayout | null): WorldLayout {
  const empty: WorldLayout = { version: 1, updatedAt: 0, objects: [] };
  if (!a) return b ?? empty;
  if (!b) return a;
  const newer = (b.updatedAt ?? 0) >= (a.updatedAt ?? 0) ? b : a;
  const older = newer === b ? a : b;
  const byId = new Map<string, WorldObject>();
  for (const o of older.objects) byId.set(o.id, o);
  for (const o of newer.objects) byId.set(o.id, o);
  return {
    version: 1,
    updatedAt: Math.max(a.updatedAt ?? 0, b.updatedAt ?? 0),
    objects: [...byId.values()],
  };
}


function loadLayout(): WorldLayout {
  return mergeLayouts(readSeed(), readLocal());
}


function persistLocal(layout: WorldLayout) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* quota / private mode — the project bake is the real store */
  }
}

function uid() {
  return `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export type EditorMode = "translate" | "rotate" | "scale";
export type BakeState = "idle" | "pending" | "saving" | "saved" | "error";

interface WorldStore {
  objects: WorldObject[];
  updatedAt: number;
  assets: AssetRecord[];
  editing: boolean;
  selectedId: string | null;
  mode: EditorMode;
  /** true while there are changes not yet written to the project file */
  dirty: boolean;
  bakeState: BakeState;
  bakeError: string | null;
  lastBakedAt: number;
  /** bumped whenever the whole layout is swapped, so colliders refresh */
  epoch: number;

  setEditing: (v: boolean) => void;
  toggleEditing: () => void;
  setMode: (m: EditorMode) => void;
  select: (id: string | null) => void;
  setAssets: (a: AssetRecord[]) => void;

  addObject: (init: Partial<WorldObject> & { name: string }) => string;
  updateObject: (id: string, patch: Partial<WorldObject>) => void;
  duplicateObject: (id: string) => void;
  removeObject: (id: string) => void;

  /** Force an immediate bake into src/data/worldLayout.json. */
  save: () => Promise<boolean>;
  reload: () => void;
  clearAll: () => void;
  importLayout: (objects: WorldObject[]) => void;
  /** Dev only: pull the freshest project file (in case another tab / device baked it). */
  syncFromProject: () => Promise<void>;
}

const initial = loadLayout();

let bakeTimer: ReturnType<typeof setTimeout> | null = null;
let bakeInFlight: Promise<boolean> | null = null;
let bakeAgain = false;
/** Set only for intentional deletions, so the server accepts a smaller layout. */
let forceNextBake = false;

export const useWorldStore = create<WorldStore>((set, get) => {
  /** Every mutation goes through here: localStorage now, project file shortly after. */
  const commit = (objects: WorldObject[], extra: Partial<WorldStore> = {}) => {
    const updatedAt = Date.now();
    persistLocal({ version: 1, updatedAt, objects });
    set({ objects, updatedAt, dirty: true, bakeState: canBakeToProject ? "pending" : "idle", ...extra });
    if (canBakeToProject) scheduleBake();
  };

  const runBake = async (): Promise<boolean> => {
    if (bakeInFlight) {
      bakeAgain = true;
      return bakeInFlight;
    }
    bakeInFlight = (async () => {
      let ok = false;
      do {
        bakeAgain = false;
        const { objects, updatedAt } = get();
        set({ bakeState: "saving" });
        const force = forceNextBake;
        forceNextBake = false;
        const res = await saveLayoutToProject({ version: 1, updatedAt, objects } satisfies WorldLayout, { force });

        ok = res.ok;
        if (res.ok) {
          // Only clear dirty if nothing changed while we were saving.
          const changed = get().updatedAt !== updatedAt;
          set({ bakeState: "saved", bakeError: null, lastBakedAt: updatedAt, dirty: changed });
        } else {
          set({ bakeState: "error", bakeError: res.error });
        }
      } while (bakeAgain);
      return ok;
    })();
    try {
      return await bakeInFlight;
    } finally {
      bakeInFlight = null;
    }
  };

  const scheduleBake = () => {
    if (bakeTimer) clearTimeout(bakeTimer);
    bakeTimer = setTimeout(() => {
      bakeTimer = null;
      void runBake();
    }, 700);
  };

  return {
    objects: initial.objects,
    updatedAt: initial.updatedAt ?? 0,
    assets: [],
    editing: false,
    selectedId: null,
    mode: "translate",
    dirty: false,
    bakeState: "idle",
    bakeError: null,
    lastBakedAt: initial.updatedAt ?? 0,
    epoch: 0,

    setEditing: (editing) => set({ editing, selectedId: editing ? get().selectedId : null }),
    toggleEditing: () => get().setEditing(!get().editing),
    setMode: (mode) => set({ mode }),
    select: (selectedId) => set({ selectedId }),
    setAssets: (assets) => set({ assets }),

    addObject: (init) => {
      const id = uid();
      const obj: WorldObject = {
        id,
        name: init.name,
        ext: init.ext ?? extOf(init.url ?? init.name),
        position: init.position ?? [0, 0, 0],
        rotation: init.rotation ?? [0, 0, 0],
        scale: init.scale ?? [1, 1, 1],
        walkable: init.walkable ?? true,
        solid: init.solid ?? false,
        visible: init.visible ?? true,
        ...(init.assetId ? { assetId: init.assetId } : {}),
        ...(init.url ? { url: init.url } : {}),
      };
      commit([...get().objects, obj], { selectedId: id });
      return id;
    },

    updateObject: (id, patch) =>
      commit(get().objects.map((o) => (o.id === id ? { ...o, ...patch } : o))),

    duplicateObject: (id) => {
      const src = get().objects.find((o) => o.id === id);
      if (!src) return;
      const copy: WorldObject = {
        ...src,
        id: uid(),
        name: `${src.name} (copy)`,
        position: [src.position[0] + 4, src.position[1], src.position[2] + 4],
      };
      commit([...get().objects, copy], { selectedId: copy.id });
    },

    removeObject: (id) => {
      forceNextBake = true;
      commit(
        get().objects.filter((o) => o.id !== id),
        { selectedId: get().selectedId === id ? null : get().selectedId },
      );
    },


    save: async () => {
      const { objects, updatedAt } = get();
      persistLocal({ version: 1, updatedAt, objects });
      if (!canBakeToProject) {
        set({ dirty: false });
        return false;
      }
      if (bakeTimer) {
        clearTimeout(bakeTimer);
        bakeTimer = null;
      }
      return runBake();
    },

    reload: () => {
      const l = loadLayout();
      set({
        objects: l.objects,
        updatedAt: l.updatedAt ?? 0,
        selectedId: null,
        dirty: false,
        epoch: get().epoch + 1,
      });
    },

    clearAll: () => {
      forceNextBake = true;
      commit([], { selectedId: null, epoch: get().epoch + 1 });
    },

    importLayout: (objects) => {
      forceNextBake = true;
      commit(objects, { selectedId: null, epoch: get().epoch + 1 });
    },


    syncFromProject: async () => {
      const remote = await fetchProjectLayout<WorldLayout>();
      if (!remote || !Array.isArray(remote.objects)) return;
      const cur = get();
      const merged = mergeLayouts({ version: 1, updatedAt: cur.updatedAt, objects: cur.objects }, remote);
      const sameAsState =
        merged.objects.length === cur.objects.length &&
        JSON.stringify(merged.objects) === JSON.stringify(cur.objects);
      if (!sameAsState) {
        persistLocal(merged);
        set({
          objects: merged.objects,
          updatedAt: merged.updatedAt ?? Date.now(),
          selectedId: null,
          epoch: cur.epoch + 1,
        });
      }
      // Make sure the project file ends up holding the merged truth.
      if (!sameAsState || merged.objects.length !== remote.objects.length || cur.dirty) scheduleBake();
    },

  };
});

// Flush a pending autosave when the tab is being closed / refreshed.
if (typeof window !== "undefined" && canBakeToProject) {
  window.addEventListener("pagehide", () => {
    if (!bakeTimer) return;
    clearTimeout(bakeTimer);
    bakeTimer = null;
    const { objects, updatedAt } = useWorldStore.getState();
    const body = JSON.stringify({ version: 1, updatedAt, objects });
    navigator.sendBeacon?.("/__world/layout", new Blob([body], { type: "application/json" }));
  });
}
