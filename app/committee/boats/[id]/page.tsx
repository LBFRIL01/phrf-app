import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { TYPE_LABEL, boatTitle, formatDate, formatDateTime } from "@/lib/labels";
import type { Application, Boat, Rating } from "@/lib/types";
import { Notice } from "@/components/Notice";
import { StatusBadge } from "@/components/StatusBadge";
import { SubmitButton } from "@/components/SubmitButton";
import { updateBoat } from "../../actions";

export const metadata = { title: "Boat" };

const FIELDS: [keyof Boat, string, string?][] = [
  ["sail_number", "Sail number *"], ["name", "Name"], ["make", "Builder"], ["model", "Model"], ["year", "Year", "numeric"],
  ["hull_number", "Hull number"], ["loa_ft", "LOA (ft)", "decimal"], ["lwl_ft", "LWL (ft)", "decimal"], ["beam_ft", "Beam (ft)", "decimal"],
  ["draft_ft", "Draft (ft)", "decimal"], ["displacement_lb", "Displacement (lb)", "numeric"], ["rig", "Rig"], ["keel", "Keel"],
  ["propeller", "Propeller"], ["home_port", "Home port"],
];

export default async function BoatPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireRole("committee", `/committee/boats/${id}`);
  const { data } = await supabase.from("boats").select("*, boat_owners(relation, since, until, owners(*))").eq("id", id).maybeSingle();
  if (!data) notFound();
  const boat = data as Boat & { boat_owners: { relation: string; since: string | null; until: string | null; owners: { id: string; full_name: string; email: string | null; phone: string | null } }[] };
  const [{ data: ratings }, { data: apps }, { data: edits }] = await Promise.all([
    supabase.from("ratings").select("*, applications(number)").eq("boat_id", id).order("created_at", { ascending: false }),
    supabase.from("applications").select("*").eq("boat_id", id).order("received_at", { ascending: false }),
    supabase.from("activity").select("*, profiles(full_name, email)").eq("boat_id", id).eq("action", "boat_edited").order("at", { ascending: false }),
  ]);

  return (
    <>
      <Notice ok={sp.ok} error={sp.error} />
      <p className="small"><Link href="/committee/boats">← All boats</Link></p>
      <h1>{boatTitle(boat)}</h1>

      <div className="two-col">
        <div>
          <h2>Rating history</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th className="num">Rating</th><th>Config</th><th>Effective</th><th>Expires</th><th>From</th><th>Status</th></tr></thead>
              <tbody>
                {((ratings ?? []) as (Rating & { applications: { number: string } | null })[]).map((r) => (
                  <tr key={r.id} style={r.withdrawn_at ? { opacity: 0.6 } : undefined}>
                    <td className="num"><strong>{r.rating}</strong></td>
                    <td>{r.configuration}</td>
                    <td>{formatDate(r.effective_on)}</td>
                    <td>{formatDate(r.expires_on)}</td>
                    <td>{r.application_id ? <Link href={`/committee/applications/${r.application_id}`}>{r.applications?.number}</Link> : ""}{r.adjustments && <div className="small muted">{r.adjustments}</div>}</td>
                    <td>{r.withdrawn_at ? <span className="small">Withdrawn {formatDate(r.withdrawn_at)}{r.withdrawn_reason ? `: ${r.withdrawn_reason}` : ""}</span> : <span className="badge badge-rated">Current</span>}</td>
                  </tr>
                ))}
                {!ratings?.length && <tr><td colSpan={6} className="muted">No ratings yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <h2>Applications</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {((apps ?? []) as Application[]).map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/committee/applications/${a.id}`}>{a.number}</Link></td>
                    <td>{TYPE_LABEL[a.type]}</td><td>{formatDate(a.received_at)}</td><td><StatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>Owners</h2>
          <ul>
            {boat.boat_owners.map((bo) => (
              <li key={bo.owners.id + bo.relation}>{bo.owners.full_name} <span className="muted">({bo.relation}){bo.owners.email ? ` · ${bo.owners.email}` : ""}{bo.owners.phone ? ` · ${bo.owners.phone}` : ""}</span></li>
            ))}
            {boat.boat_owners.length === 0 && <li className="muted">No owners on file.</li>}
          </ul>
        </div>

        <div>
          <form action={updateBoat} className="card stack">
            <h2 style={{ marginTop: 0 }}>Boat record</h2>
            <input type="hidden" name="boat_id" value={boat.id} />
            {FIELDS.map(([k, label, mode]) => (
              <label key={k}>{label}<input name={k} defaultValue={(boat[k] as string | number | null) ?? ""} inputMode={mode as "numeric" | "decimal" | undefined} required={k === "sail_number"} /></label>
            ))}
            <label>Notes<textarea name="notes" defaultValue={boat.notes ?? ""} /></label>
            <SubmitButton>Save boat record</SubmitButton>
          </form>
          {(edits ?? []).length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Edit history</h3>
              <ul className="small" style={{ paddingLeft: 18 }}>
                {(edits ?? []).map((e: { id: number; at: string; details: Record<string, { from: unknown; to: unknown }>; profiles: { full_name: string; email: string } | null }) => (
                  <li key={e.id}>{formatDateTime(e.at)}, {e.profiles?.full_name || e.profiles?.email}:{" "}
                    {Object.entries(e.details).map(([k, v]) => `${k} “${v?.from ?? ""}” → “${v?.to ?? ""}”`).join("; ")}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
