import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasRole } from "@/lib/labels";
import type { Profile, Role } from "@/lib/types";

/** Who is looking at this page (or nobody). Cached for one page render. */
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null };
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { supabase, user, profile: (data as Profile | null) ?? null };
});

/** Sends people to sign in, or away, when they lack the role a page needs. */
export async function requireRole(min: Role, nextPath: string) {
  const viewer = await getViewer();
  if (!viewer.user || !viewer.profile) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!hasRole(viewer.profile.role, min)) redirect("/?error=" + encodeURIComponent("That page is for the rating committee."));
  return viewer as typeof viewer & { profile: Profile };
}

/** Redirects back to a page with a message the page shows in a banner. */
export function back(path: string, kind: "ok" | "error", message: string): never {
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  redirect(`${base}${sep}${kind}=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`);
}
