import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { STATUS_LABEL, TYPE_LABEL, formatDate } from "@/lib/labels";
import type { AppStatus, Application, Boat, Owner, Settings } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Notice } from "@/components/Notice";

export const metadata = { title: "Committee" };

const TABS: { key: string; label: string; statuses: AppStatus[] }[] = [
  { key: "open", label: "Needs action", statuses: ["received", "needs_info", "in_review", "appealed"] },
  { key: "in_review", label: "Voting", statuses: ["in_review", "appealed"] },
  { key: "received", label: "New", statuses: ["received"] },
  { key: "needs_info", label: "Waiting on owner", statuses: ["needs_info"] },
  { key: "rated", label: "Rated", statuses: ["rated"] },
  { key: "withdrawn", label: "Withdrawn", statuses: ["withdrawn"] },
  { key: "all", label: "All", statuses: Object.keys(STATUS_LABEL) as AppStatus[] },
];

type Row = Application & {
  boats: Pick<Boat, "name" | "sail_number" | "make" | "model">;
  owners: Pick<Owner, "full_name"> | null;
  votes: { member_id: string; recused: boolean }[];
};

export default async function CommitteeHome({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireRole("committee", "/committee");
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const [{ data }, { data: settings }] = await Promise.all([
    supabase.from("applications")
      .select("*, boats(name, sail_number, make, model), owners(full_name), votes(member_id, recused)")
      .in("status", tab.statuses).order("received_at", { ascending: false }).limit(500),
    supabase.from("settings").select("*").eq("id", 1).single(),
  ]);
  const rows = (data ?? []) as Row[];
  const quorum = (settings as Settings | null)?.quorum ?? 3;
  const today = new Date().toISOString().slice(0, 10);
  const q = (sp.q ?? "").toLowerCase().trim();
  const shown = q ? rows.filter((r) => [r.number, r.boats?.name, r.boats?.sail_number, r.owners?.full_name, r.boats?.model]
    .some((v) => v?.toLowerCase().includes(q))) : rows;

  return (
    <>
      <Notice ok={sp.ok} error={sp.error} />
      <h1>Rating applications</h1>
      <nav className="tabs" aria-label="Filter">
        {TABS.map((t) => <Link key={t.key} href={`/committee?tab=${t.key}`} className={t === tab ? "active" : ""}>{t.label}</Link>)}
      </nav>
      <form className="row" style={{ marginBottom: 12 }}>
        <input type="hidden" name="tab" value={tab.key} />
        <label style={{ flex: "1 1 240px" }}>Search<input name="q" defaultValue={sp.q ?? ""} placeholder="Number, boat, sail, owner" /></label>
        <button className="button secondary">Search</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Number</th><th>Boat</th><th>Owner</th><th>Type</th><th>Received</th><th>Status</th><th>Votes</th><th>Deadline</th></tr>
          </thead>
          <tbody>
            {shown.map((a) => {
              const cast = a.votes.filter((v) => !v.recused).length;
              const mine = a.votes.some((v) => v.member_id === profile.id);
              const voting = a.status === "in_review" || a.status === "appealed";
              return (
                <tr key={a.id}>
                  <td><Link href={`/committee/applications/${a.id}`}>{a.number}</Link>{a.source === "import" && <div className="small muted">imported</div>}</td>
                  <td>{a.boats?.name ?? ""} <span className="muted">{a.boats?.sail_number}</span><div className="small muted">{[a.boats?.make, a.boats?.model].filter(Boolean).join(" ")}</div></td>
                  <td>{a.owners?.full_name ?? ""}</td>
                  <td>{TYPE_LABEL[a.type]}</td>
                  <td>{formatDate(a.received_at)}</td>
                  <td><StatusBadge status={a.status} />{a.status === "rated" && <div className="small"><strong>{a.final_rating}</strong></div>}</td>
                  <td>{voting ? <>{cast} of {quorum}{!mine && <div className="small" style={{ color: "var(--accent)" }}>You haven&apos;t voted</div>}</> : cast || ""}</td>
                  <td>{voting && a.review_deadline ? <span className={a.review_deadline < today ? "badge badge-needs_info" : ""}>{formatDate(a.review_deadline)}</span> : ""}</td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={8} className="muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
