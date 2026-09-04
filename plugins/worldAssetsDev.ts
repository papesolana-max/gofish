import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

const ROOT = process.cwd();
const MODEL_DIR = path.resolve(ROOT, "public/models");
// Large model binaries are externalized to the asset CDN; only small pointer
// JSON files live in the repo. They live under src/models (not public/models)
// because Vite cannot import or glob-import files from the public directory.
const LAYOUT_FILE = path.resolve(ROOT, "src/data/worldLayout.json");

const ALLOWED_EXT = new Set([
  "glb", "gltf", "fbx", "obj", "stl", "ply", "dae", "3mf", "vox", "bin", "png", "jpg", "jpeg", "webp", "ktx2",
]);
const MAX_MODEL_BYTES = 200 * 1024 * 1024;

function safeBase(raw: string) {
  const base = path.basename(raw);
  const i = base.lastIndexOf(".");
  const stem = (i < 0 ? base : base.slice(0, i)).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "model";
  const ext = (i < 0 ? "" : base.slice(i + 1)).toLowerCase().replace(/[^a-z0-9]/g, "");
  return { stem, ext };
}

function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_MODEL_BYTES) {
        reject(new Error("file terlalu besar (maks 200 MB)"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Atomic write: tmp file + rename so a crash never leaves a half-written file. */
async function writeAtomic(file: string, data: Buffer | string) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

interface LayoutFile {
  version: 1;
  updatedAt: number;
  objects: unknown[];
}

interface LooseObj {
  id?: unknown;
  name?: unknown;
  position?: unknown;
  rotation?: unknown;
  scale?: unknown;
}

function validateLayout(parsed: unknown): { ok: true; value: LayoutFile } | { ok: false; error: string } {
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "layout bukan objek" };
  const p = parsed as { objects?: unknown; updatedAt?: unknown };
  if (!Array.isArray(p.objects)) return { ok: false, error: "layout.objects harus array" };
  for (const [i, o] of (p.objects as unknown[]).entries()) {
    if (!o || typeof o !== "object") return { ok: false, error: `objek #${i} tidak valid` };
    const r = o as LooseObj;
    if (typeof r.id !== "string" || typeof r.name !== "string") return { ok: false, error: `objek #${i} tanpa id/nama` };
    for (const v of [r.position, r.rotation, r.scale]) {
      if (!Array.isArray(v) || v.length !== 3 || v.some((n) => typeof n !== "number" || !Number.isFinite(n)))
        return { ok: false, error: `objek "${r.name}" transform tidak valid` };
    }
  }
  return {
    ok: true,
    value: { version: 1, updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(), objects: p.objects },
  };
}

// Vite reports `file` with forward slashes even on Windows, while
// path.resolve() above produces backslashes there. Normalize both sides
// before comparing, otherwise this check silently fails to match on
// Windows and every autosave triggers a full HMR reload (which resets the
// in-memory editor state, kicking the user out of the edit panel).
const toPosix = (p: string) => p.split(path.sep).join("/");
const LAYOUT_FILE_POSIX = toPosix(LAYOUT_FILE);
const MODEL_DIR_POSIX = toPosix(MODEL_DIR);
const isOurs = (file: string) => {
  const f = toPosix(file);
  return f === LAYOUT_FILE_POSIX || f.startsWith(`${MODEL_DIR_POSIX}/`);
};

/**
 * Dev-only endpoints that "bake" editor uploads into the project source:
 *  - POST /__world/model?name=foo.glb  -> writes the raw file straight into
 *    public/models/foo-<hash>.glb (no external CDN / CLI involved, so it
 *    works with a plain `vite dev` / `bun dev` on any machine)
 *  - POST /__world/layout              -> writes src/data/worldLayout.json (validated, atomic)
 *  - GET  /__world/layout              -> returns the current baked layout
 * Both live in the repo, so they survive clone / remix.
 */
export function worldAssetsDev(): Plugin {
  return {
    name: "world-assets-dev",
    apply: "serve",
    // Our own writes must not trigger HMR / full page reloads (autosave would
    // otherwise reload the game every time the user moves an object).
    hotUpdate({ file }) {
      if (isOurs(file)) return [];
      return undefined;
    },
    handleHotUpdate({ file }) {
      if (isOurs(file)) return [];
      return undefined;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        const json = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify(body));
        };

        // Serve freshly written models immediately (Vite only scans public/ at boot).
        if (req.method === "GET" && url.startsWith("/models/")) {
          const name = path.basename(decodeURIComponent(url.split("?")[0] ?? ""));
          const file = path.join(MODEL_DIR, name);
          try {
            const data = await readFile(file);
            res.setHeader("content-type", "model/gltf-binary");
            // Filenames embed a content hash, so they are immutable: let the
            // browser cache them forever and refreshes skip re-downloading.
            res.setHeader("cache-control", "public, max-age=31536000, immutable");
            res.end(data);
            return;
          } catch {
            return next();
          }
        }

        if (!url.startsWith("/__world/")) return next();

        try {
          if (url.startsWith("/__world/layout")) {
            if (req.method === "GET") {
              try {
                const raw = await readFile(LAYOUT_FILE, "utf8");
                return json(200, JSON.parse(raw));
              } catch {
                return json(200, { version: 1, updatedAt: 0, objects: [] });
              }
            }
            if (req.method === "POST") {
              const buf = await readBody(req);
              let parsed: unknown;
              try {
                parsed = JSON.parse(buf.toString("utf8"));
              } catch {
                return json(400, { error: "JSON tidak valid" });
              }
              const v = validateLayout(parsed);
              if (!v.ok) return json(400, { error: v.error });

              // Guard against a stale tab wiping objects another tab baked:
              // keep a backup and refuse a destructive shrink unless forced.
              let prev: LayoutFile | null = null;
              try {
                prev = JSON.parse(await readFile(LAYOUT_FILE, "utf8")) as LayoutFile;
              } catch {
                prev = null;
              }
              const force = new URL(url, "http://local").searchParams.get("force") === "1";
              if (prev && Array.isArray(prev.objects) && prev.objects.length > v.value.objects.length && !force) {
                return json(409, {
                  error: `penulisan ditolak: file punya ${prev.objects.length} objek, kiriman hanya ${v.value.objects.length}`,
                  count: prev.objects.length,
                });
              }
              if (prev && Array.isArray(prev.objects) && prev.objects.length) {
                await writeAtomic(
                  path.resolve(ROOT, "src/data/worldLayout.backup.json"),
                  `${JSON.stringify(prev, null, 2)}\n`,
                );
              }
              await writeAtomic(LAYOUT_FILE, `${JSON.stringify(v.value, null, 2)}\n`);
              return json(200, { ok: true, updatedAt: v.value.updatedAt, count: v.value.objects.length });
            }

          }

          if (url.startsWith("/__world/model") && req.method === "POST") {
            const q = new URL(url, "http://local").searchParams;
            const { stem, ext } = safeBase(q.get("name") ?? "model.glb");
            if (!ALLOWED_EXT.has(ext)) return json(400, { error: `ekstensi .${ext} tidak didukung` });
            const buf = await readBody(req);
            if (!buf.length) return json(400, { error: "empty body" });
            const hash = createHash("sha1").update(buf).digest("hex").slice(0, 8);
            const name = `${stem}-${hash}.${ext}`;
            const destFile = path.join(MODEL_DIR, name);
            const legacyUrl = `/models/${name}`;

            // Reuse a previously imported immutable asset when the same file is
            // imported again (same content hash -> same filename).
            try {
              await readFile(destFile);
              return json(200, { url: legacyUrl, legacyUrl, name, size: buf.length });
            } catch {
              // Not imported yet.
            }

            // LOCAL MODE: no external asset CDN / "lovable-assets" CLI involved.
            // The binary is written straight into public/models/ so the model
            // lives entirely in this repo and works with a plain `vite dev`.
            await writeAtomic(destFile, buf);
            return json(200, { url: legacyUrl, legacyUrl, name, size: buf.length });
          }
        } catch (err) {
          return json(500, { error: err instanceof Error ? err.message : String(err) });
        }
        return next();
      });
    },
  };
}