import type { SupabaseClient } from "@supabase/supabase-js";
import { KIND_LABEL, type FileKind } from "@/lib/upload";
import { formatDate } from "@/lib/labels";

interface Attachment {
  id: string; storage_path: string; file_name: string; content_type: string | null;
  size_bytes: number | null; kind: FileKind; created_at: string; hidden_at: string | null;
}

/** Shows an application's files with short-lived private download links. */
export async function AttachmentList({ supabase, applicationId, hideAction, showHidden }: {
  supabase: SupabaseClient; applicationId: string;
  hideAction?: (formData: FormData) => Promise<void>; showHidden?: boolean;
}) {
  const { data } = await supabase.from("attachments").select("*").eq("application_id", applicationId).order("created_at");
  const all = (data ?? []) as Attachment[];
  const files = all.filter((a) => showHidden || !a.hidden_at);
  if (!files.length) return <p className="muted">No files yet.</p>;
  const { data: signed } = await supabase.storage.from("attachments").createSignedUrls(files.map((f) => f.storage_path), 60 * 60);
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl ?? undefined]));
  return (
    <div className="files">
      {files.map((f) => {
        const url = urls.get(f.storage_path);
        const isImage = f.content_type?.startsWith("image/");
        return (
          <div className="file" key={f.id} style={f.hidden_at ? { opacity: 0.5 } : undefined}>
            {isImage && url && (
              <a href={url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={f.file_name} loading="lazy" />
              </a>
            )}
            <div><a href={url} target="_blank" rel="noreferrer">{f.file_name}</a></div>
            <div className="muted small">{KIND_LABEL[f.kind]} · {formatDate(f.created_at)}{f.size_bytes ? ` · ${Math.ceil(f.size_bytes / 1024)} KB` : ""}</div>
            {hideAction && (
              <form action={hideAction}>
                <input type="hidden" name="application_id" value={applicationId} />
                <input type="hidden" name="attachment_id" value={f.id} />
                <input type="hidden" name="hide" value={f.hidden_at ? "0" : "1"} />
                <button className="linkish small" type="submit">{f.hidden_at ? "Show again" : "Hide"}</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
