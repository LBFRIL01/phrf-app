"use server";
import { back, requireRole } from "@/lib/auth";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const intOrNull = (v: string) => (v === "" ? null : Number.parseInt(v, 10));
const appPath = (id: string) => `/committee/applications/${id}`;

export async function castVote(f: FormData) {
  const id = s(f, "application_id");
  const { supabase, profile } = await requireRole("committee", appPath(id));
  const recused = f.get("recused") === "on";
  const rating = intOrNull(s(f, "proposed_rating"));
  if (!recused && (rating === null || Number.isNaN(rating))) back(appPath(id), "error", "Enter a proposed rating, or tick recuse.");
  const { error } = await supabase.from("votes").upsert(
    { application_id: id, member_id: profile.id, proposed_rating: recused ? null : rating,
      adjustments: s(f, "adjustments") || null, comment: s(f, "comment") || null, recused },
    { onConflict: "application_id,member_id" },
  );
  if (error) back(appPath(id), "error", error.message);
  back(appPath(id), "ok", recused ? "You are recused from this application." : "Your vote is saved. You can change it until voting closes.");
}

export async function removeVote(f: FormData) {
  const id = s(f, "application_id");
  const { supabase, profile } = await requireRole("committee", appPath(id));
  const { error } = await supabase.from("votes").delete().eq("application_id", id).eq("member_id", profile.id);
  if (error) back(appPath(id), "error", error.message);
  back(appPath(id), "ok", "Your vote was removed.");
}

export async function addComment(f: FormData) {
  const id = s(f, "application_id");
  const { supabase, profile } = await requireRole("committee", appPath(id));
  const body = s(f, "body");
  if (!body) back(appPath(id), "error", "Write something first.");
  const { error } = await supabase.from("comments").insert({ application_id: id, author_id: profile.id, body });
  if (error) back(appPath(id), "error", error.message);
  back(appPath(id) + "#discussion", "ok", "Comment posted.");
}

export async function toggleComment(f: FormData) {
  const id = s(f, "application_id");
  const { supabase } = await requireRole("committee", appPath(id));
  const hide = s(f, "hide") === "1";
  const { error } = await supabase.from("comments").update({ hidden_at: hide ? new Date().toISOString() : null }).eq("id", s(f, "comment_id"));
  if (error) back(appPath(id), "error", error.message);
  back(appPath(id) + "#discussion", "ok", hide ? "Comment hidden." : "Comment shown again.");
}

export async function toggleAttachment(f: FormData) {
  const id = s(f, "application_id");
  const { supabase } = await requireRole("committee", appPath(id));
  const hide = s(f, "hide") === "1";
  const { error } = await supabase.from("attachments").update({ hidden_at: hide ? new Date().toISOString() : null }).eq("id", s(f, "attachment_id"));
  if (error) back(appPath(id), "error", error.message);
  back(appPath(id), "ok", hide ? "File hidden. It is kept, and you can show it again." : "File shown again.");
}

export async function setStatus(f: FormData) {
  const id = s(f, "application_id");
  const { supabase } = await requireRole("chair", appPath(id));
  const { error } = await supabase.rpc("set_application_status", {
    p_app: id, p_status: s(f, "status"), p_deadline: s(f, "deadline") || null, p_note: s(f, "note") || null,
  });
  if (error) back(appPath(id), "error", error.message);
  back(appPath(id), "ok", "Status updated.");
}

export async function finalize(f: FormData) {
  const id = s(f, "application_id");
  const { supabase } = await requireRole("chair", appPath(id));
  const rating = intOrNull(s(f, "rating"));
  if (rating === null || Number.isNaN(rating)) back(appPath(id), "error", "Enter the final rating as a whole number.");
  const { error } = await supabase.rpc("finalize_application", {
    p_app: id, p_rating: rating, p_configuration: s(f, "configuration") || "Spinnaker",
    p_adjustments: s(f, "adjustments") || null, p_notes: s(f, "notes") || null,
    p_effective: s(f, "effective") || null, p_expires: s(f, "expires") || null,
  });
  if (error) back(appPath(id), "error", error.message);
  back(appPath(id), "ok", `Rating ${rating} issued and published. Use "Undo rating" if this was a mistake.`);
}

export async function reopen(f: FormData) {
  const id = s(f, "application_id");
  const { supabase } = await requireRole("chair", appPath(id));
  const { error } = await supabase.rpc("reopen_application", { p_app: id, p_reason: s(f, "reason") || null });
  if (error) back(appPath(id), "error", error.message);
  back(appPath(id), "ok", "Rating undone. Any rating it replaced is back in force, and voting is open again.");
}

export async function updateApplicationInfo(f: FormData) {
  const id = s(f, "application_id");
  const { supabase } = await requireRole("chair", appPath(id));
  const { error } = await supabase.from("applications").update({
    folder_url: s(f, "folder_url") || null, review_deadline: s(f, "review_deadline") || null,
  }).eq("id", id);
  if (error) back(appPath(id), "error", error.message);
  back(appPath(id), "ok", "Saved.");
}

const BOAT_FIELDS = ["sail_number", "name", "make", "model", "year", "hull_number", "loa_ft", "lwl_ft", "beam_ft",
  "draft_ft", "displacement_lb", "rig", "keel", "propeller", "home_port", "notes"] as const;
const NUMERIC = new Set(["year", "loa_ft", "lwl_ft", "beam_ft", "draft_ft", "displacement_lb"]);

export async function updateBoat(f: FormData) {
  const id = s(f, "boat_id");
  const path = `/committee/boats/${id}`;
  const { supabase } = await requireRole("committee", path);
  const patch: Record<string, string | number | null> = {};
  for (const k of BOAT_FIELDS) {
    const v = s(f, k);
    if (NUMERIC.has(k)) {
      const n = v === "" ? null : Number(v);
      if (n !== null && Number.isNaN(n)) back(path, "error", `${k.replace("_", " ")} must be a number.`);
      patch[k] = n;
    } else patch[k] = v || null;
  }
  if (!patch.sail_number) back(path, "error", "Sail number is required.");
  const { data: before } = await supabase.from("boats").select("*").eq("id", id).single();
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of BOAT_FIELDS) {
    const old = before?.[k] ?? null;
    if (String(old ?? "") !== String(patch[k] ?? "")) changes[k] = { from: old, to: patch[k] };
  }
  if (!Object.keys(changes).length) back(path, "ok", "Nothing changed.");
  const { error } = await supabase.from("boats").update(patch).eq("id", id);
  if (error) back(path, "error", error.message);
  await supabase.rpc("log_boat_edit", { p_boat: id, p_changes: changes });
  back(path, "ok", "Boat record saved. The previous values are kept in the history below.");
}
