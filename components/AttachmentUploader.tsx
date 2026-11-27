"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { KIND_LABEL, uploadFiles, type FileKind } from "@/lib/upload";

export function AttachmentUploader({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<FileKind>("photo");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem("files") as HTMLInputElement;
    const files = Array.from(input.files ?? []).map((file) => ({ file, kind }));
    if (!files.length) return;
    setError(null);
    setBusy(`Uploading 0 of ${files.length}…`);
    const problems = await uploadFiles(createClient(), applicationId, files, (d, t) => setBusy(`Uploading ${d} of ${t}…`));
    setBusy(null);
    input.value = "";
    if (problems.length) setError(problems.join(" "));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="row" style={{ marginTop: 12 }}>
      <label>
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as FileKind)}>
          {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </label>
      <label style={{ flex: "1 1 220px" }}>Add files<input type="file" name="files" multiple /></label>
      <button className="button secondary" disabled={!!busy}>{busy ?? "Upload"}</button>
      {error && <p className="notice error" style={{ flexBasis: "100%" }}>{error}</p>}
    </form>
  );
}
