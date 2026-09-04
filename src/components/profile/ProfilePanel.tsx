import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Fish, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useProfileStore } from "@/hooks/useProfileStore";
import { updateProfile, uploadAvatar } from "@/lib/profile.functions";
import { xpProgressFor } from "@/lib/xp";

const RARITIES = [
  { key: "fish_common", label: "Common", tone: "bg-slate-500/25 text-slate-100" },
  { key: "fish_rare", label: "Rare", tone: "bg-sky-500/25 text-sky-100" },
  { key: "fish_epic", label: "Epic", tone: "bg-violet-500/25 text-violet-100" },
  { key: "fish_legendary", label: "Legendary", tone: "bg-amber-500/25 text-amber-100" },
  { key: "fish_mythic", label: "Mythic", tone: "bg-rose-500/25 text-rose-100" },
] as const;

async function signedAvatarUrl(path: string) {
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? null;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function ProfilePanel() {
  const { panelOpen, setPanelOpen, profile, setProfile, proof } = useProfileStore();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const xpProgress = xpProgressFor(profile?.xp);

  useEffect(() => {
    if (!profile) return;
    setUsername(profile.username);
    setDisplayName(profile.display_name ?? "");
    setAvatarPath(profile.avatar_url);
  }, [profile]);

  useEffect(() => {
    let cancelled = false;
    if (!avatarPath) {
      setAvatarUrl(null);
      return;
    }
    void signedAvatarUrl(avatarPath).then((url) => {
      if (!cancelled) setAvatarUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarPath]);

  if (!profile) return null;

  const onPickFile = async (file: File) => {
    if (!proof) return;
    setUploading(true);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const contentType = file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif";
      const { path } = await uploadAvatar({ data: { proof, base64, contentType } });
      setAvatarPath(path);
      toast.success("Avatar uploaded. Don't forget to save.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Avatar upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const onSave = async () => {
    if (!proof) return;
    setSaving(true);
    setError(null);
    try {
      const row = await updateProfile({
        data: { proof, username: username.trim(), displayName: displayName.trim(), avatarPath },
      });
      setProfile(row);
      toast.success("Profile saved.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not save your profile.";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const initials = (profile.display_name || profile.username || "A").slice(0, 2).toUpperCase();

  return (
    <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Angler Profile</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {profile.wallet_address}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile picture" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-muted-foreground">
                {initials}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPickFile(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload photo
            </Button>
            <p className="text-xs text-muted-foreground">PNG, JPG, WEBP or GIF up to 5 MB.</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              placeholder="your_username"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              placeholder="How other anglers see you"
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2 rounded-lg border border-border px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Level</span>
              <span className="font-semibold">{profile.level}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${xpProgress.percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
              <span>{xpProgress.into.toLocaleString()} / {xpProgress.span.toLocaleString()} XP</span>
              <span>Total {xpProgress.total.toLocaleString()} XP</span>
            </div>
          </div>
        </div>


        <div className="space-y-2">
          <p className="text-sm font-medium">Fish caught</p>
          <div className="space-y-1.5">
            {RARITIES.map((r) => (
              <div
                key={r.key}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${r.tone}`}
              >
                <span className="flex items-center gap-2">
                  <Fish className="h-4 w-4" aria-hidden />
                  {r.label}
                </span>
                <span className="font-semibold tabular-nums">{profile[r.key]}</span>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </DialogContent>
    </Dialog>
  );
}
