import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { undoImport } from "../actions";
import { ImportForm } from "./ImportForm";

export const metadata = { title: "Import" };

export default async function ImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("admin", "/admin/import");
  const { data: batches } = await supabase.from("import_batches").select("*").order("created_at", { ascending: false });
  return (
    <>
      <Notice ok={sp.ok} error={sp.error} />
      <p className="small"><Link href="/admin">← Admin</Link></p>
      <h1>Import past applications</h1>
      <p>
        Bring in applications from a spreadsheet, such as the 2025+ inventory pulled from the email archive. In Google
        Sheets choose <em>File → Download → Comma-separated values (.csv)</em>, then pick that file below. You will see a
        preview first, and nothing is saved until you press Import. Every import can be undone.
      </p>
      <p className="small">
        Column names are matched loosely (for example &quot;Sail #&quot; or &quot;Sail Number&quot;). Each row needs a sail number or a boat name; boats without a sail number show “Sail # needed” until it is filled in.{" "}
        <a href="/import-template.csv" download>Download a template</a> to see every column the import understands.
      </p>
      <ImportForm />
      <h2>Past imports</h2>
      {(batches ?? []).length === 0 ? <p className="muted">None yet.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>When</th><th>File</th><th className="num">Rows</th><th></th></tr></thead>
            <tbody>
              {(batches ?? []).map((b: { id: string; created_at: string; file_name: string | null; row_count: number; undone_at: string | null }) => (
                <tr key={b.id}>
                  <td>{formatDateTime(b.created_at)}</td><td>{b.file_name}</td><td className="num">{b.row_count}</td>
                  <td>{b.undone_at ? <span className="muted small">Undone {formatDateTime(b.undone_at)}</span> : (
                    <form action={undoImport}>
                      <input type="hidden" name="batch_id" value={b.id} />
                      <SubmitButton className="button secondary" confirm="Undo this import? Everything it added will be removed. Applications that have since been worked on are removed too.">Undo import</SubmitButton>
                    </form>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
