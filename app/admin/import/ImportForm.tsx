"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { mapRows, type ImportProblem, type ImportRow } from "@/lib/import";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/labels";

export function ImportForm() {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setRows(null); setError(null);
    if (!file) return;
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: "greedy",
      complete: (res) => {
        const out = mapRows(res.data);
        setRows(out.rows); setProblems(out.problems); setUnmatched(out.unmatched);
      },
      error: (err) => setError(err.message),
    });
  }

  const errors = problems.filter((p) => p.level === "error");
  async function doImport() {
    if (!rows) return;
    setBusy(true); setError(null);
    const { error } = await createClient().rpc("import_applications", { p_rows: rows, p_file_name: fileName });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setRows(null);
    router.push(`/admin/import?ok=${encodeURIComponent(`Imported ${rows.length} applications from ${fileName}.`)}`);
    router.refresh();
  }

  return (
    <div className="card stack">
      <label>Spreadsheet (.csv)<input type="file" accept=".csv,text/csv" onChange={onFile} /></label>
      {error && <p className="notice error">{error}</p>}
      {rows && (
        <>
          <p><strong>{rows.length}</strong> applications found in {fileName}.
            {unmatched.length > 0 && <span className="muted"> These columns will be kept as extra details: {unmatched.join(", ")}.</span>}</p>
          {problems.length > 0 && (
            <div className={errors.length ? "notice error" : "notice warn"}>
              {errors.length > 0 && <p style={{ marginTop: 0 }}><strong>Fix these {errors.length} problem(s) in the spreadsheet and pick the file again:</strong></p>}
              <ul style={{ margin: 0 }}>{problems.map((p, i) => <li key={i}>Row {p.row}: {p.message}</li>)}</ul>
            </div>
          )}
          <div className="table-wrap" style={{ maxHeight: 420, overflow: "auto" }}>
            <table className="small">
              <thead><tr><th>#</th><th>Sail</th><th>Boat</th><th>Design</th><th>Owner</th><th>Received</th><th>Type</th><th>Status</th><th className="num">Rating</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td><td>{r.sail_number || <span className="badge badge-needs_info">needed</span>}</td><td>{r.boat_name}</td><td>{[r.make, r.model].filter(Boolean).join(" ")}</td>
                    <td>{r.owner_name}{r.owner_email && <div className="muted">{r.owner_email}</div>}</td>
                    <td>{r.received_on}</td><td>{TYPE_LABEL[r.type]}</td><td>{STATUS_LABEL[r.status]}</td><td className="num">{r.rating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Boats are matched to existing records by sail number and owners by email, so nothing is duplicated. Rated rows also publish the rating.</p>
          <div className="row">
            <button className="button" onClick={doImport} disabled={busy || errors.length > 0 || rows.length === 0}>
              {busy ? "Importing…" : `Import ${rows.length} applications`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
