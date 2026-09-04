import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildAuthMessage, SIGNATURE_MAX_AGE_MS } from "./walletAuth";

const proofSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  issuedAt: z.string(),
  signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
});

type Proof = z.infer<typeof proofSchema>;

/** Verifies the wallet signature and returns the lowercase address it proves. */
async function verifyProof(proof: Proof): Promise<string> {
  const issued = Date.parse(proof.issuedAt);
  if (Number.isNaN(issued) || Math.abs(Date.now() - issued) > SIGNATURE_MAX_AGE_MS) {
    throw new Error("Signature expired. Please reconnect your wallet.");
  }
  const { verifyMessage } = await import("viem");
  const ok = await verifyMessage({
    address: proof.address as `0x${string}`,
    message: buildAuthMessage(proof.address, proof.issuedAt),
    signature: proof.signature as `0x${string}`,
  });
  if (!ok) throw new Error("Invalid wallet signature.");
  return proof.address.toLowerCase();
}

function shortId(address: string) {
  return address.slice(2, 8);
}

export const ensureProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const existing = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("wallet_address", wallet)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return existing.data;

    let username = `angler_${shortId(wallet)}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const created = await supabaseAdmin
        .from("profiles")
        .insert({
          wallet_address: wallet,
          username,
          display_name: `Angler ${shortId(wallet)}`,
        })
        .select("*")
        .single();
      if (!created.error) return created.data;
      if (created.error.code !== "23505") throw new Error(created.error.message);
      username = `angler_${shortId(wallet)}${Math.floor(Math.random() * 1000)}`;
    }
    throw new Error("Could not create a profile. Please try again.");
  });

const updateSchema = z.object({
  proof: proofSchema,
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(20, "Username must be at most 20 characters.")
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers and underscores only."),
  displayName: z.string().trim().max(40, "Display name is too long."),
  avatarPath: z.string().nullable().optional(),
});

export const updateProfile = createServerFn({ method: "POST" })
  .validator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data.proof);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const taken = await supabaseAdmin
      .from("profiles")
      .select("wallet_address")
      .ilike("username", data.username)
      .neq("wallet_address", wallet)
      .maybeSingle();
    if (taken.error) throw new Error(taken.error.message);
    if (taken.data) throw new Error("That username is already taken.");

    const patch: { username: string; display_name: string; avatar_url?: string | null } = {
      username: data.username,
      display_name: data.displayName,
    };
    if (data.avatarPath !== undefined) patch.avatar_url = data.avatarPath ?? null;

    const updated = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("wallet_address", wallet)
      .select("*")
      .single();
    if (updated.error) {
      if (updated.error.code === "23505") throw new Error("That username is already taken.");
      throw new Error(updated.error.message);
    }
    return updated.data;
  });

const uploadSchema = z.object({
  proof: proofSchema,
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  /** Base64 encoded image payload, without the data-URL prefix. */
  base64: z.string().min(1).max(8_000_000),
});

export const uploadAvatar = createServerFn({ method: "POST" })
  .validator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data.proof);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const binary = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (binary.byteLength > 5 * 1024 * 1024) throw new Error("Image must be smaller than 5 MB.");

    const ext = data.contentType.split("/")[1] ?? "png";
    const path = `${wallet}/avatar-${Date.now()}.${ext}`;

    const uploaded = await supabaseAdmin.storage
      .from("avatars")
      .upload(path, binary, { contentType: data.contentType, upsert: true });
    if (uploaded.error) throw new Error(uploaded.error.message);

    return { path };
  });

const recordCatchSchema = z.object({
  proof: proofSchema,
  rarity: z.enum(["common", "rare", "epic", "legendary", "mythic"]),
  speciesId: z.string().min(1).max(60),
  weightKg: z.number().positive().max(100000),
  mutationKey: z.string().min(1).max(40),
});

/** Increments the fish_{rarity} counter on the caller's profile. */
export const recordCatch = createServerFn({ method: "POST" })
  .validator((input: unknown) => recordCatchSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data.proof);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // record_catch inserts the inventory row and increments fish_{rarity}
    // atomically in one server-side statement pair.
    const updated = await supabaseAdmin.rpc("record_catch", {
      _wallet: wallet,
      _rarity: data.rarity,
      _species_id: data.speciesId,
      _weight_kg: data.weightKg,
      _mutation_key: data.mutationKey,
    });
    if (updated.error) throw new Error(updated.error.message);
    return updated.data;
  });

/** Returns the caller's unsold fish, newest first. */
export const getInventory = createServerFn({ method: "POST" })
  .validator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin
      .from("fish_inventory_items")
      .select("id, species_id, weight_kg, mutation_key, caught_at")
      .eq("wallet_address", wallet)
      .order("caught_at", { ascending: false })
      .limit(500);
    if (res.error) throw new Error(res.error.message);
    return (res.data ?? []).map((r) => ({ ...r, weight_kg: Number(r.weight_kg) }));
  });

const sellSchema = z.object({
  proof: proofSchema,
  itemId: z.string().uuid().nullable().optional(),
  speciesId: z.string().min(1).max(60).nullable().optional(),
  sellAll: z.boolean().optional(),
});

/** Sells one fish, every fish of a species, or the whole bucket. */
export const sellFish = createServerFn({ method: "POST" })
  .validator((input: unknown) => sellSchema.parse(input))
  .handler(async ({ data }) => {
    const wallet = await verifyProof(data.proof);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The generated arg types are non-nullable, but the SQL function treats
    // NULL as "not filtering by this key".
    const res = await supabaseAdmin.rpc("sell_fish", {
      _wallet: wallet,
      _item_id: (data.itemId ?? null) as string,
      _species_id: (data.speciesId ?? null) as string,
      _sell_all: data.sellAll ?? false,
    });
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });
