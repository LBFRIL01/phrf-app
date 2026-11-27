"use server";
import { back, requireRole } from "@/lib/auth";
import type { Role } from "@/lib/types";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function setRole(f: FormData) {
  const { supabase } = await requireRole("admin", "/admin");
  const { error } = await supabase.rpc("set_member_role", { p_profile: s(f, "profile_id"), p_role: s(f, "role") as Role });
  if (error) back("/admin", "error", error.message);
  back("/admin", "ok", "Role updated.");
}

export async function saveSettings(f: FormData) {
  const { supabase } = await requireRole("admin", "/admin");
  const n = (k: string) => Number.parseInt(s(f, k), 10);
  const patch = { org_name: s(f, "org_name") || "South Texas PHRF", quorum: n("quorum"), review_days: n("review_days"), rating_valid_months: n("rating_valid_months") };
  if ([patch.quorum, patch.review_days, patch.rating_valid_months].some((v) => !(v > 0))) back("/admin", "error", "Numbers must be 1 or more.");
  const { error } = await supabase.from("settings").update(patch).eq("id", 1);
  if (error) back("/admin", "error", error.message);
  back("/admin", "ok", "Settings saved.");
}

export async function undoImport(f: FormData) {
  const { supabase } = await requireRole("admin", "/admin/import");
  const { error } = await supabase.rpc("undo_import", { p_batch: s(f, "batch_id") });
  if (error) back("/admin/import", "error", error.message);
  back("/admin/import", "ok", "Import undone. Everything it added has been removed.");
}
