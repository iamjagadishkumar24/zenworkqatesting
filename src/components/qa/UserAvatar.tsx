import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const urlCache = new Map<string, { url: string; expires: number }>();

function getInitials(name?: string | null, email?: string | null) {
  const n = (name ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = (email ?? "").trim();
  if (e) return e.slice(0, 2).toUpperCase();
  return "U";
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const GRADIENTS = [
  ["#6366f1", "#a855f7"],
  ["#06b6d4", "#3b82f6"],
  ["#10b981", "#0ea5e9"],
  ["#f59e0b", "#ef4444"],
  ["#ec4899", "#8b5cf6"],
  ["#14b8a6", "#22c55e"],
  ["#f97316", "#eab308"],
  ["#0ea5e9", "#6366f1"],
  ["#84cc16", "#10b981"],
  ["#d946ef", "#3b82f6"],
];

export function gradientFor(seed: string) {
  const idx = hashString(seed || "u") % GRADIENTS.length;
  const [a, b] = GRADIENTS[idx];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

const sizes: Record<string, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-7 w-7 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-24 w-24 text-2xl",
};

export type UserAvatarProps = {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: keyof typeof sizes;
  className?: string;
};

async function resolveSignedUrl(path: string): Promise<string | null> {
  if (/^https?:\/\//i.test(path)) return path;
  const now = Date.now();
  const cached = urlCache.get(path);
  if (cached && cached.expires > now) return cached.url;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, expires: now + 55 * 60 * 1000 });
  return data.signedUrl;
}

export function UserAvatar({ name, email, avatarUrl, size = "md", className }: UserAvatarProps) {
  const seed = (email || name || "user").toLowerCase();
  const initials = useMemo(() => getInitials(name, email), [name, email]);
  const gradient = useMemo(() => gradientFor(seed), [seed]);
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    if (!avatarUrl) return;
    void resolveSignedUrl(avatarUrl).then((u) => { if (!cancelled) setResolved(u); });
    return () => { cancelled = true; };
  }, [avatarUrl]);

  return (
    <div
      className={cn(
        "grid place-items-center overflow-hidden rounded-full font-semibold text-white shrink-0 select-none",
        sizes[size],
        className,
      )}
      style={!resolved ? { background: gradient } : undefined}
      aria-label={name || email || "User"}
    >
      {resolved ? (
        <img src={resolved} alt={name || email || "User"} className="h-full w-full object-cover" />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}