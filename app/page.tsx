import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/labels";
import { Notice } from "@/components/Notice";

export const dynamic = "force-dynamic";

interface PublicRating {
  boat_id: string; sail_number: string; boat_name: string | null; make: string | null; model: string | null;
  year: number | null; rating: number; configuration: string; effective_on: string; expires_on: string | null;
}

export default async function RatingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_ratings");
  const all = (data ?? []) as PublicRating[];
  const rows = q
    ? all.filter((r) => [r.sail_number, r.boat_name, r.make, r.model].some((v) => v?.toLowerCase().includes(q)))
    : all;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Notice ok={sp.ok} error={sp.error} />
      <h1>Current ratings</h1>
      <p className="muted">
        PHRF ratings in seconds per mile. Need a rating? <Link href="/apply">Apply online</Link>.
      </p>
      <form className="row" role="search" style={{ marginBottom: 12 }}>
        <label style={{ flex: "1 1 260px" }}>
          Search
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Sail number, boat name or design" />
        </label>
        <button className="button" type="submit">Search</button>
        {q && <Link className="button secondary" href="/">Clear</Link>}
      </form>
      {error && <p className="notice error">Could not load ratings: {error.message}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Sail</th><th>Boat</th><th>Design</th><th className="num">Rating</th><th className="hide-sm">Config</th><th className="hide-sm">Valid</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.boat_id + r.configuration}>
                <td>{r.sail_number}</td>
                <td>{r.boat_name}</td>
                <td>{[r.make, r.model].filter(Boolean).join(" ")}{r.year ? ` (${r.year})` : ""}{r.configuration !== "Spinnaker" && <div className="small muted show-sm">{r.configuration}</div>}</td>
                <td className="num"><strong>{r.rating}</strong></td>
                <td className="hide-sm">{r.configuration}</td>
                <td className="small hide-sm">
                  {formatDate(r.effective_on)}
                  {r.expires_on && <> to {formatDate(r.expires_on)}{r.expires_on < today && <span className="badge badge-needs_info" style={{ marginLeft: 6 }}>Expired</span>}</>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted">{q ? "No boats match that search." : "No ratings published yet."}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {all.length > 0 && (
        <p className="small"><a href="/ratings.csv">Download this list as a spreadsheet (CSV)</a> for scoring software such as Sailwave.</p>
      )}
    </>
  );
}
