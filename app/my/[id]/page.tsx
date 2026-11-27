import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { STATUS_HELP, TYPE_LABEL, boatTitle, formatDate, formatDateTime } from "@/lib/labels";
import type { Application, Boat } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Notice } from "@/components/Notice";
import { AttachmentList } from "@/components/AttachmentList";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import { DetailsView } from "@/components/DetailsView";

export const metadata = { title: "Application" };

export default async function MyApplication({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireRole("owner", `/my/${id}`);
  const { data } = await supabase.from("applications").select("*, boats(*)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const app = data as Application & { boats: Boat };
  const { data: events } = await supabase.from("activity").select("at, action, details")
    .eq("application_id", id).order("at", { ascending: false });
  const lastNote = (events ?? []).find((e) => e.action === "status_changed" && e.details?.note)?.details?.note as string | undefined;
  const open = !["rated", "withdrawn"].includes(app.status);

  return (
    <>
      <Notice ok={sp.ok} error={sp.error} />
      <p className="small"><Link href="/my">← My applications</Link></p>
      <h1>{app.number}: {boatTitle(app.boats)}</h1>
      <div className="card">
        <p style={{ marginTop: 0 }}><StatusBadge status={app.status} /> <span className="muted">{TYPE_LABEL[app.type]} · received {formatDate(app.received_at)}</span></p>
        <p>{STATUS_HELP[app.status]}</p>
        {lastNote && app.status === "needs_info" && <p className="notice warn"><strong>From the committee:</strong> {lastNote}</p>}
        {app.status === "rated" && (
          <p>Rating: <span className="big-number">{app.final_rating}</span> seconds per mile{app.decided_at ? `, issued ${formatDate(app.decided_at)}` : ""}.
            {app.decision_notes && <><br /><span className="muted">{app.decision_notes}</span></>}</p>
        )}
      </div>

      <h2>Files</h2>
      <div className="card">
        <AttachmentList supabase={supabase} applicationId={app.id} />
        {open && <AttachmentUploader applicationId={app.id} />}
      </div>

      <h2>What you submitted</h2>
      <div className="card"><DetailsView details={app.details} />{app.owner_notes && <p><strong>Notes:</strong> {app.owner_notes}</p>}</div>

      <h2>History</h2>
      <ul className="small">
        {(events ?? []).map((e, i) => (
          <li key={i}>{formatDateTime(e.at)}: {describe(e.action, e.details)}</li>
        ))}
      </ul>
    </>
  );
}

function describe(action: string, d: Record<string, unknown>) {
  if (action === "submitted") return "Submitted";
  if (action === "rated") return `Rated ${d.rating}`;
  if (action === "rating_undone") return "Rating reopened for review";
  if (action === "status_changed") return `Status changed to ${String(d.to).replace("_", " ")}`;
  return action;
}
