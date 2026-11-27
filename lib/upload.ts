import type { SupabaseClient } from "@supabase/supabase-js";

export type FileKind = "photo" | "sail_measurements" | "certificate" | "payment" | "other";
export const KIND_LABEL: Record<FileKind, string> = {
  photo: "Photo",
  sail_measurements: "Sail measurements",
  certificate: "Prior certificate",
  payment: "Payment",
  other: "Other",
};
export const MAX_FILE_MB = 25;

/** Uploads files to an application's private folder and records them. Returns any problems. */
export async function uploadFiles(
  supabase: SupabaseClient, applicationId: string, files: { file: File; kind: FileKind }[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const problems: string[] = [];
  const { data: { user } } = await supabase.auth.getUser();
  let done = 0;
  for (const { file, kind } of files) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      problems.push(`${file.name} is larger than ${MAX_FILE_MB} MB and was skipped.`);
      continue;
    }
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${applicationId}/${crypto.randomUUID()}-${safe}`;
    const { error: upErr } = await supabase.storage.from("attachments").upload(path, file, {
      contentType: file.type || undefined, upsert: false,
    });
    if (upErr) { problems.push(`${file.name}: ${upErr.message}`); continue; }
    const { error: rowErr } = await supabase.from("attachments").insert({
      application_id: applicationId, storage_path: path, file_name: file.name,
      content_type: file.type || null, size_bytes: file.size, kind, uploaded_by: user?.id,
    });
    if (rowErr) problems.push(`${file.name}: ${rowErr.message}`);
    onProgress?.(++done, files.length);
  }
  return problems;
}
