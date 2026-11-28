import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { TYPE_LABEL, boatTitle, formatDate, formatDateTime, hasRole } from "@/lib/labels";
import { summarizeVotes } from "@/lib/voting";
import type { Application, Boat, Owner, Rating, Settings, Vote } from "@/lib/types";
import { SailNumber, StatusBadge } from "@/components/StatusBadge";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { AttachmentList } from "@/components/AttachmentList";
import { AttachmentUploader } from "@/components/AttachmentUploader";
import { DetailsView } from "@/components/DetailsView";
import {
  addComment, castVote, finalize, removeVote, reopen, setStatus, toggleAttachment, toggleComment, updateApplicationInfo,
} from "../../actions";

export const metadata = { title: "Review application" };

type Person = { full_name: string; email: string } | null;

const BOAT_COMPARE: [keyof Boat, string][] = [
  ["name", "Name"], ["make", "Builder"], ["model", "Model"], ["year", "Year"], ["hull_number", "Hull #"],
  ["loa_ft", "LOA"], ["lwl_ft", "LWL"], ["beam_ft", "Beam"], ["draft_ft", "Draft"], ["displacement_lb", "Displacement"], ["home_port", "Home port"],
];

export default async function ReviewApplication({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, profile } = await requireRole("committee", `/committee/applications/${id}`);
  const isChair = hasRole(profile.role, "chair");

  const { data } = await supabase.from("applications").select("*, boats(*), owners(*)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const app = data as Application & { boats: Boat; owners: Owner | null };
  const boat = app.boats;

  const [votesRes, commentsRes, settingsRes, ratingsRes, activityRes] = await Promise.all([
    supabase.from("votes").select("*, profiles(full_name, email)").eq("application_id", id).order("created_at"),
    supabase.from("comments").select("*, profiles(full_name, email)").eq("application_id", id).order("created_at"),
    supabase.from("settings").select("*").eq("id", 1).single(),
    supabase.from("ratings").select("*").eq("boat_id", boat.id).order("created_at", { ascending: false }),
    supabase.from("activity").select("*, profiles(full_name, email)").eq("application_id", id).order("at", { ascending: false }),
  ]);
  const votes = (votesRes.data ?? []) as (Vote & { profiles: Person })[];
  const comments = (commentsRes.data ?? []) as { id: string; author_id: string; body: string; created_at: string; hidden_at: string | null; profiles: Person }[];
  const settings = settingsRes.data as Settings;
  const boatRatings = (ratingsRes.data ?? []) as Rating[];
  const activity = (activityRes.data ?? []) as { id: number; at: string; action: string; details: Record<string, unknown>; profiles: Person }[];

  let sisters: { rating: number; configuration: string; boats: Pick<Boat, "id" | "name" | "sail_number" | "year"> }[] = [];
  if (boat.model) {
    const { data: s } = await supabase.from("ratings")
      .select("rating, configuration, boats!inner(id, name, sail_number, year, model)")
      .is("withdrawn_at", null).ilike("boats.model", boat.model).neq("boat_id", boat.id).limit(20);
    sisters = (s ?? []) as unknown as typeof sisters;
  }

  const summary = summarizeVotes(votes, settings?.quorum ?? 3);
  const mine = votes.find((v) => v.member_id === profile.id);
  const voting = app.status === "in_review" || app.status === "appealed";
  const submittedBoat = ((app.details?.boat ?? {}) as Record<string, string>);
  const diffs = BOAT_COMPARE.filter(([k]) => submittedBoat[k] && String(submittedBoat[k]) !== String(boat[k] ?? ""));
  const current = boatRatings.filter((r) => !r.withdrawn_at);
  const name = (p: Person) => p?.full_name || p?.email || "Someone";

  return (
    <>
      <Notice ok={sp.ok} error={sp.error} />
      <p className="small"><Link href="/committee">← All applications</Link></p>
      <h1>{app.number}: {boatTitle(boat)}</h1>
      <p><StatusBadge status={app.status} /> <span className="muted">{TYPE_LABEL[app.type]} · received {formatDate(app.received_at)}
        {app.source === "import" && " · imported from the email archive"}
        {voting && app.review_deadline && <> · votes due <strong>{formatDate(app.review_deadline)}</strong></>}</span></p>

      <div className="two-col">
        <div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Boat</h2>
            <dl className="facts">
              <dt>Sail number</dt><dd><Link href={`/committee/boats/${boat.id}`}>{boat.sail_number || "Add sail number"}</Link>{!boat.sail_number && <> <SailNumber value={null} /></>}</dd>
              <dt>Design</dt><dd>{[boat.make, boat.model].filter(Boolean).join(" ")}{boat.year ? `, ${boat.year}` : ""}</dd>
              {boat.loa_ft && <><dt>LOA</dt><dd>{boat.loa_ft} ft</dd></>}
              <dt>Current rating</dt>
              <dd>{current.length ? current.map((r) => `${r.rating} (${r.configuration})`).join(", ") : <span className="muted">None</span>}</dd>
            </dl>
            {diffs.length > 0 && (
              <>
                <h3>Differences from the boat record</h3>
                <table className="small">
                  <thead><tr><th>Field</th><th>On record</th><th>Submitted</th></tr></thead>
                  <tbody>{diffs.map(([k, l]) => <tr key={k} className="diff"><td>{l}</td><td>{String(boat[k] ?? "")}</td><td>{submittedBoat[k]}</td></tr>)}</tbody>
                </table>
                <p className="small muted">The boat record is not changed automatically. Edit it on the <Link href={`/committee/boats/${boat.id}`}>boat page</Link> if the new details are right.</p>
              </>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Application details</h2>
            <DetailsView details={app.details} />
            {app.owner_notes && <><h3>Owner&apos;s notes</h3><p style={{ whiteSpace: "pre-wrap" }}>{app.owner_notes}</p></>}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Files</h2>
            {app.folder_url && <p>Folder: <a href={app.folder_url} target="_blank" rel="noreferrer">{app.folder_url}</a></p>}
            <AttachmentList supabase={supabase} applicationId={app.id} showHidden
              hideAction={toggleAttachment} />
            <AttachmentUploader applicationId={app.id} />
          </div>

          <div className="card" id="discussion">
            <h2 style={{ marginTop: 0 }}>Discussion</h2>
            <p className="small muted">Visible to the committee only. Kept as the record of how the rating was decided.</p>
            {comments.length === 0 && <p className="muted">No comments yet.</p>}
            {comments.map((c) => (
              <div className="comment" key={c.id} style={c.hidden_at ? { opacity: 0.5 } : undefined}>
                <div className="small"><strong>{name(c.profiles)}</strong> <span className="muted">{formatDateTime(c.created_at)}</span>
                  {(c.author_id === profile.id || isChair) && (
                    <form action={toggleComment} style={{ display: "inline", marginLeft: 8 }}>
                      <input type="hidden" name="application_id" value={app.id} />
                      <input type="hidden" name="comment_id" value={c.id} />
                      <input type="hidden" name="hide" value={c.hidden_at ? "0" : "1"} />
                      <button className="linkish small muted">{c.hidden_at ? "Show again" : "Hide"}</button>
                    </form>
                  )}
                </div>
                <div style={{ whiteSpace: "pre-wrap" }}>{c.hidden_at ? <em>Hidden</em> : c.body}</div>
              </div>
            ))}
            <form action={addComment} className="stack" style={{ marginTop: 12 }}>
              <input type="hidden" name="application_id" value={app.id} />
              <label>Add a comment<textarea name="body" required /></label>
              <SubmitButton pendingText="Posting…">Post comment</SubmitButton>
            </form>
          </div>
        </div>

        <div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Votes</h2>
            <p>
              {summary.cast} of {summary.quorum} needed{summary.recused ? `, ${summary.recused} recused` : ""}.{" "}
              {summary.quorumMet ? <strong>Quorum reached.</strong> : <span className="muted">Waiting for quorum.</span>}
            </p>
            {summary.median !== null && (
              <p>Median <span className="big-number">{summary.median}</span>
                <span className="muted"> (range {summary.low} to {summary.high}){summary.agreement ? ", members agree" : ", members differ: discuss before rating"}</span></p>
            )}
            <table className="small">
              <tbody>
                {votes.map((v) => (
                  <tr key={v.id}>
                    <td>{name(v.profiles)}</td>
                    <td className="num"><strong>{v.recused ? "Recused" : v.proposed_rating}</strong></td>
                    <td>{v.adjustments}{v.comment && <div className="muted">{v.comment}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {voting ? (
              <form action={castVote} className="stack" style={{ marginTop: 12 }}>
                <input type="hidden" name="application_id" value={app.id} />
                <h3>{mine ? "Change your vote" : "Your vote"}</h3>
                <label>Proposed rating <span className="hint">seconds per mile</span>
                  <input name="proposed_rating" inputMode="numeric" pattern="-?\d{1,3}" defaultValue={mine?.proposed_rating ?? ""} /></label>
                <label>Adjustments and reasons <span className="hint">e.g. base 90, -3 asym, +3 fixed prop</span>
                  <textarea name="adjustments" defaultValue={mine?.adjustments ?? ""} /></label>
                <label>Comment<input name="comment" defaultValue={mine?.comment ?? ""} /></label>
                <label style={{ fontWeight: 400 }}><input type="checkbox" name="recused" defaultChecked={mine?.recused} /> I have a conflict of interest and recuse myself</label>
                <div className="row">
                  <SubmitButton>{mine ? "Update vote" : "Cast vote"}</SubmitButton>
                </div>
              </form>
            ) : (
              <p className="small muted">Voting opens when the chair starts the review.</p>
            )}
            {voting && mine && (
              <form action={removeVote} style={{ marginTop: 8 }}>
                <input type="hidden" name="application_id" value={app.id} />
                <SubmitButton className="linkish small" confirm="Remove your vote?">Remove my vote</SubmitButton>
              </form>
            )}
          </div>

          {isChair && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Chair actions</h2>
              {app.status === "rated" ? (
                <>
                  <p>Rated <strong>{app.final_rating}</strong> on {formatDate(app.decided_at)}.</p>
                  <form action={reopen} className="stack">
                    <input type="hidden" name="application_id" value={app.id} />
                    <label>Reason<input name="reason" placeholder="e.g. wrong number entered, appeal" /></label>
                    <SubmitButton className="button secondary" confirm="Undo this rating? The previous rating (if any) comes back and voting reopens.">Undo rating</SubmitButton>
                  </form>
                </>
              ) : (
                <>
                  <form action={setStatus} className="stack">
                    <input type="hidden" name="application_id" value={app.id} />
                    <label>Move to
                      <select name="status" defaultValue={app.status === "received" ? "in_review" : app.status}>
                        <option value="in_review">In review (open voting)</option>
                        <option value="needs_info">Needs info from owner</option>
                        <option value="appealed">Appealed (open voting)</option>
                        <option value="received">Received</option>
                        <option value="withdrawn">Withdrawn (close without rating)</option>
                      </select>
                    </label>
                    <label>Votes due <span className="hint">blank = {settings?.review_days ?? 7} days from today</span><input type="date" name="deadline" defaultValue={app.review_deadline ?? ""} /></label>
                    <label>Note <span className="hint">the owner sees this when you ask for info</span><input name="note" /></label>
                    <SubmitButton className="button secondary">Update status</SubmitButton>
                  </form>
                  <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "16px 0" }} />
                  <form action={finalize} className="stack">
                    <input type="hidden" name="application_id" value={app.id} />
                    <h3>Issue rating</h3>
                    {!summary.quorumMet && <p className="notice warn small">Quorum has not been reached yet.</p>}
                    <label>Final rating *<input name="rating" required inputMode="numeric" pattern="-?\d{1,3}" defaultValue={summary.median ?? ""} /></label>
                    <label>Configuration
                      <select name="configuration" defaultValue="Spinnaker">
                        <option>Spinnaker</option><option>Non-spinnaker</option><option>Jib and main</option><option>Cruising</option>
                      </select>
                    </label>
                    <label>Adjustments<textarea name="adjustments" defaultValue={mine?.adjustments ?? ""} /></label>
                    <label>Note to owner<input name="notes" /></label>
                    <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                      <label>Effective<input type="date" name="effective" /></label>
                      <label>Expires <span className="hint">blank = {settings?.rating_valid_months ?? 12} months</span><input type="date" name="expires" /></label>
                    </div>
                    <SubmitButton confirm="Issue and publish this rating?">Issue rating</SubmitButton>
                  </form>
                </>
              )}
              <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "16px 0" }} />
              <form action={updateApplicationInfo} className="stack">
                <input type="hidden" name="application_id" value={app.id} />
                <label>Google Drive folder link<input name="folder_url" type="url" defaultValue={app.folder_url ?? ""} /></label>
                <input type="hidden" name="review_deadline" value={app.review_deadline ?? ""} />
                <SubmitButton className="button secondary">Save link</SubmitButton>
              </form>
            </div>
          )}

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Owner</h2>
            {app.owners ? (
              <dl className="facts">
                <dt>Name</dt><dd>{app.owners.full_name}</dd>
                {app.owners.email && <><dt>Email</dt><dd><a href={`mailto:${app.owners.email}?subject=${encodeURIComponent(`PHRF application ${app.number}`)}`}>{app.owners.email}</a></dd></>}
                {app.owners.phone && <><dt>Phone</dt><dd><a href={`tel:${app.owners.phone}`}>{app.owners.phone}</a></dd></>}
                {app.owners.club && <><dt>Club</dt><dd>{app.owners.club}</dd></>}
                {app.owners.us_sailing_number && <><dt>US Sailing</dt><dd>{app.owners.us_sailing_number}</dd></>}
              </dl>
            ) : <p className="muted">No owner on file.</p>}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Sister ships</h2>
            {sisters.length === 0 ? <p className="muted small">No other rated boats of this model.</p> : (
              <table className="small"><tbody>
                {sisters.map((s, i) => (
                  <tr key={i}><td><Link href={`/committee/boats/${s.boats.id}`}>{boatTitle(s.boats)}</Link>{s.boats.year ? ` ${s.boats.year}` : ""}</td><td className="num"><strong>{s.rating}</strong></td><td>{s.configuration}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>History</h2>
            <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
              {activity.map((a) => <li key={a.id}>{formatDateTime(a.at)}: {name(a.profiles)} {describe(a.action, a.details)}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

function describe(action: string, d: Record<string, unknown>): string {
  switch (action) {
    case "submitted": return "submitted the application";
    case "status_changed": return `moved it from ${String(d.from).replace("_", " ")} to ${String(d.to).replace("_", " ")}${d.note ? ` (“${d.note}”)` : ""}`;
    case "vote_cast": return d.recused ? "recused" : "voted";
    case "vote_changed": return "changed their vote";
    case "vote_removed": return "removed their vote";
    case "rated": return `issued rating ${d.rating} (${d.configuration})`;
    case "rating_undone": return `undid the rating${d.reason ? ` (“${d.reason}”)` : ""}`;
    default: return action.replace("_", " ");
  }
}
