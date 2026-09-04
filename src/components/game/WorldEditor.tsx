import { useEffect, useRef, useState } from "react";
import {
  deleteAsset,
  extOf,
  listAssets,
  putAsset,
  SUPPORTED_EXT,
} from "@/lib/assetLibrary";
import { useWorldStore, type EditorMode, type Vec3, type WorldLayout } from "@/hooks/useWorldStore";
import { canBakeToProject, uploadModelToProject } from "@/lib/projectAssets";

const MODES: EditorMode[] = ["translate", "rotate", "scale"];
const MODE_LABEL: Record<EditorMode, string> = {
  translate: "Move",
  rotate: "Rotate",
  scale: "Scale",
};

function NumRow({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: Vec3;
  step: number;
  onChange: (v: Vec3) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {(["X", "Y", "Z"] as const).map((axis, i) => (
        <label key={axis} className="flex min-w-0 flex-1 items-center gap-1">
          <span className="text-[10px] text-slate-500">{axis}</span>
          <input
            type="number"
            step={step}
            value={Number(value[i]?.toFixed(3) ?? 0)}
            onChange={(e) => {
              const next = [...value] as Vec3;
              next[i] = Number(e.target.value);
              onChange(next);
            }}
            className="w-full min-w-0 rounded-md border border-white/15 bg-slate-950/60 px-1.5 py-1 text-[11px] text-slate-100 outline-none focus:border-sky-400/70"
          />
        </label>
      ))}
    </div>
  );
}

export function WorldEditor() {
  const s = useWorldStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const selected = s.objects.find((o) => o.id === s.selectedId) ?? null;

  useEffect(() => {
    listAssets().then(s.setAssets);
    void useWorldStore.getState().syncFromProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const localOnly = s.objects.filter((o) => o.assetId && !o.url).length;

  // Toggle the editor with "P" (avoids the gameplay keys).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.code === "KeyP") {
        e.preventDefault();
        useWorldStore.getState().toggleEditing();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy("Uploading…");
    let baked = 0;
    let local = 0;
    const errors: string[] = [];
    for (const f of Array.from(files)) {
      const ext = extOf(f.name);
      if (!SUPPORTED_EXT.includes(ext as (typeof SUPPORTED_EXT)[number])) {
        errors.push(`${f.name}: unsupported format`);
        continue;
      }
      // 1) save into the project source (public/models/) so it follows clone/remix
      const res = await uploadModelToProject(f);
      if (res.ok) {
        // If a large binary was rejected by the repository earlier, preserve
        // the recovered transform and reconnect it to the new CDN URL.
        const recovered = useWorldStore
          .getState()
          .objects.find((object) => object.url === res.value.legacyUrl);
        if (recovered) s.updateObject(recovered.id, { url: res.value.url });
        else s.addObject({ name: f.name, url: res.value.url, ext });
        baked += 1;
        continue;
      }
      // 2) fallback: store blob on this device only — and make that explicit
      errors.push(`${f.name}: ${res.error}`);
      await putAsset(f);
      local += 1;
    }
    s.setAssets(await listAssets());
    const parts: string[] = [];
    if (baked) parts.push(`${baked} model baked permanently & placed.`);
    if (local) parts.push(`${local} model ONLY on this device (won't carry over on clone/remix).`);
    if (errors.length) parts.push(`Bake failed: ${errors.join("; ")}`);
    setBusy(parts.join(" ") || null);
    if (!errors.length) setTimeout(() => setBusy(null), 4000);
  };

  const onSave = async () => {
    setBusy("Saving to project…");
    const ok = await s.save();
    setBusy(
      ok
        ? "Layout saved to src/data/worldLayout.json ✔"
        : canBakeToProject
          ? `Could not write to project code: ${useWorldStore.getState().bakeError ?? "?"}`
          : "Saved on this device only (production mode).",
    );
    setTimeout(() => setBusy(null), 4000);
  };

  const onExport = () => {
    const payload: WorldLayout = { version: 1, objects: s.objects };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "world-layout.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onCopyJson = async () => {
    const payload: WorldLayout = { version: 1, objects: s.objects };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setBusy("JSON copied — paste it into src/data/worldLayout.json to keep it on clone/remix");
    } catch {
      setBusy("Could not copy, use Export JSON");
    }
    setTimeout(() => setBusy(null), 4000);
  };


  const onImport = async (file: File | null) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as WorldLayout;
      if (Array.isArray(parsed.objects)) s.importLayout(parsed.objects);
    } catch {
      setBusy("Invalid layout file");
      setTimeout(() => setBusy(null), 2000);
    }
  };

  if (!s.editing) {
    return null;
  }

  return (
    <div className="pointer-events-auto fixed left-4 top-4 z-30 flex max-h-[92vh] w-[330px] flex-col overflow-hidden rounded-2xl border border-white/20 bg-slate-950/85 text-slate-100 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <h2 className="text-sm font-semibold">World Editor</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onSave}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              s.bakeState === "error"
                ? "bg-rose-500 text-slate-950 hover:bg-rose-400"
                : s.dirty || s.bakeState === "saving"
                  ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                  : "bg-white/10"
            }`}
            title="Autosave is on — this button forces a save now"
          >
            {s.bakeState === "saving"
              ? "Saving…"
              : s.bakeState === "pending"
                ? "Save •"
                : s.bakeState === "error"
                  ? "Retry"
                  : s.dirty
                    ? "Save"
                    : "Saved ✓"}
          </button>
          <button
            onClick={() => s.setEditing(false)}
            className="rounded-lg bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* ---- assets ------------------------------------------------ */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Model Assets
          </h3>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={SUPPORTED_EXT.map((e) => `.${e}`).join(",")}
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg border border-dashed border-white/25 px-3 py-2 text-[11px] text-slate-300 hover:border-sky-400/70 hover:text-slate-50"
          >
            + Import file ({SUPPORTED_EXT.join(", ")})
          </button>

          <div className="flex gap-1">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="/models/island.glb or URL"
              className="min-w-0 flex-1 rounded-lg border border-white/15 bg-slate-900/70 px-2 py-1.5 text-[11px] outline-none focus:border-sky-400/70"
            />
            <button
              onClick={() => {
                if (!urlInput.trim()) return;
                const url = urlInput.trim();
                s.addObject({
                  name: url.split("/").pop() ?? url,
                  url,
                  ext: extOf(url) || "glb",
                });
                setUrlInput("");
              }}
              className="rounded-lg bg-sky-500 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-sky-400"
            >
              Add
            </button>
          </div>

          <ul className="space-y-1">
            {s.assets.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/50 px-2 py-1.5"
              >
                <span className="min-w-0 flex-1 truncate text-[11px]" title={a.name}>
                  {a.name}
                </span>
                <button
                  onClick={() =>
                    s.addObject({ name: a.name, assetId: a.id, ext: a.ext })
                  }
                  className="rounded-md bg-sky-500/90 px-2 py-0.5 text-[10px] font-semibold text-slate-950 hover:bg-sky-400"
                >
                  Place
                </button>
                <button
                  onClick={async () => {
                    await deleteAsset(a.id);
                    s.setAssets(await listAssets());
                  }}
                  className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] hover:bg-rose-500/80"
                >
                  🗑
                </button>
              </li>
            ))}
            {s.assets.length === 0 && (
              <li className="text-[11px] text-slate-500">No imported assets yet.</li>
            )}
          </ul>
        </section>

        {/* ---- placed objects ---------------------------------------- */}
        <section className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Objects in World ({s.objects.length})
          </h3>
          <ul className="space-y-1">
            {s.objects.map((o) => (
              <li key={o.id}>
                <button
                  onClick={() => s.select(o.id === s.selectedId ? null : o.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] transition-colors ${
                    o.id === s.selectedId
                      ? "border-sky-400/80 bg-sky-500/20"
                      : "border-white/10 bg-slate-900/50 hover:bg-slate-900/80"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  <span className="text-[10px] text-slate-400">{o.ext}</span>
                </button>
              </li>
            ))}
            {s.objects.length === 0 && (
              <li className="text-[11px] text-slate-500">
                World is empty — import a model then click “Place”.
              </li>
            )}
          </ul>
        </section>

        {/* ---- inspector --------------------------------------------- */}
        {selected && (
          <section className="space-y-2 rounded-xl border border-white/10 bg-slate-900/60 p-2">
            <div className="flex items-center gap-1">
              <input
                value={selected.name}
                onChange={(e) => s.updateObject(selected.id, { name: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-white/15 bg-slate-950/60 px-2 py-1 text-[11px] outline-none focus:border-sky-400/70"
              />
              <button
                onClick={() => s.duplicateObject(selected.id)}
                className="rounded-md bg-white/10 px-2 py-1 text-[10px] hover:bg-white/20"
              >
                Duplicate
              </button>
              <button
                onClick={() => s.removeObject(selected.id)}
                className="rounded-md bg-rose-500/80 px-2 py-1 text-[10px] font-semibold hover:bg-rose-500"
              >
                Delete
              </button>
            </div>

            <div className="flex gap-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => s.setMode(m)}
                  className={`flex-1 rounded-md px-2 py-1 text-[10px] font-semibold ${
                    s.mode === m ? "bg-sky-500 text-slate-950" : "bg-white/10 hover:bg-white/20"
                  }`}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>

            <NumRow
              label="Position"
              step={0.5}
              value={selected.position}
              onChange={(position) => s.updateObject(selected.id, { position })}
            />
            <NumRow
              label="Rotation"
              step={0.05}
              value={selected.rotation}
              onChange={(rotation) => s.updateObject(selected.id, { rotation })}
            />
            <NumRow
              label="Scale"
              step={0.1}
              value={selected.scale}
              onChange={(scale) => s.updateObject(selected.id, { scale })}
            />
            <div className="flex items-center gap-1">
              <span className="w-12 shrink-0 text-[10px] uppercase tracking-wider text-slate-400">
                Scale =
              </span>
              <input
                type="number"
                step={0.1}
                value={Number(selected.scale[0].toFixed(3))}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  s.updateObject(selected.id, { scale: [v, v, v] });
                }}
                className="w-full rounded-md border border-white/15 bg-slate-950/60 px-1.5 py-1 text-[11px] outline-none focus:border-sky-400/70"
              />
            </div>

            <div className="flex flex-wrap gap-3 pt-1 text-[11px]">
              {(
                [
                  ["walkable", "Walkable"],
                  ["solid", "Blocks"],
                  ["visible", "Visible"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={selected[key]}
                    onChange={(e) => s.updateObject(selected.id, { [key]: e.target.checked })}
                    className="accent-sky-400"
                  />
                  {label}
                </label>
              ))}
            </div>
          </section>
        )}

        {/* ---- layout io --------------------------------------------- */}
        <section className="flex flex-wrap gap-1 border-t border-white/10 pt-2">
          <button
            onClick={onExport}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] hover:bg-white/20"
          >
            Export JSON
          </button>
          <button
            onClick={onCopyJson}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] hover:bg-white/20"
          >
            Copy JSON
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => onImport(e.target.files?.[0] ?? null)}
          />

          <button
            onClick={() => importRef.current?.click()}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] hover:bg-white/20"
          >
            Import JSON
          </button>
          <button
            onClick={s.reload}
            className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] hover:bg-white/20"
          >
            Load Saved
          </button>
          <button
            onClick={s.clearAll}
            className="rounded-lg bg-rose-500/70 px-2.5 py-1 text-[11px] font-semibold hover:bg-rose-500"
          >
            Clear All
          </button>
        </section>

        {localOnly > 0 && (
          <p className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-relaxed text-amber-200">
            {localOnly} object(s) use local-only assets (IndexedDB) and will NOT carry over on clone/remix.
            Re-import the files via “Import file” so they are stored in public/models/.
          </p>
        )}
        <p className={`text-[10px] leading-relaxed ${s.bakeState === "error" ? "text-rose-300" : "text-slate-400"}`}>
          {busy ??
            (s.bakeState === "error"
              ? `Project autosave FAILED: ${s.bakeError}. Changes only exist in this browser.`
              : canBakeToProject
                ? "Autosave on: every change is written to src/data/worldLayout.json and imported models are copied to public/models/ — both carry over on clone/remix."
                : "Production mode: changes only persist on this device. Use the editor in preview so edits are baked into the project.")}
        </p>
      </div>
    </div>
  );
}
