"use server";
import { back, requireRole } from "@/lib/auth";

export async function saveMyProfile(f: FormData) {
  const { supabase, profile } = await requireRole("owner", "/my");
  const full_name = String(f.get("full_name") ?? "").trim();
  const phone = String(f.get("phone") ?? "").trim() || null;
  if (!full_name) back("/my", "error", "Please enter your name.");
  const { error } = await supabase.from("profiles").update({ full_name, phone }).eq("id", profile.id);
  if (error) back("/my", "error", error.message);
  back("/my", "ok", "Your details are saved.");
}
