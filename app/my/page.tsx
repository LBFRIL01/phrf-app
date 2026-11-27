import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { TYPE_LABEL, boatTitle, formatDate } from "@/lib/labels";
import type { Application, Boat } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { saveMyProfile } from "./actions";

export const metadata = { title: "My applications" };

export default async function MyApplications({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireRole("owner", "/my");
  const { data } = await supabase
    .from("applications").select("*, boats(name, sail_number)")
    .or(`submitted_by.eq.${profile.id},owner_id.in.(${await ownerIds(supabase, profile.id)})`)
    .order("received_at", { ascending: false });
  const apps = (data ?? []) as (Application & { boats: Pick<Boat, "name" | "sail_number"> })[];

  return (
    <>
      <Notice ok={sp.ok} error={sp.error} />
      <h1>My applications</h1>
      <p><Link className="button" href="/apply">Start a new application</Link></p>
      {apps.length === 0 ? (
        <p className="muted">You have no applications yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Number</th><th>Boat</th><th>Type</th><th>Received</th><th>Status</th><th className="num">Rating</th></tr></thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/my/${a.id}`}>{a.number}</Link></td>
                  <td>{boatTitle(a.boats)}</td>
                  <td>{TYPE_LABEL[a.type]}</td>
                  <td>{formatDate(a.received_at)}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td className="num">{a.final_rating ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2>Your details</h2>
      <form action={saveMyProfile} className="card row">
        <label style={{ flex: "1 1 220px" }}>Name <span className="hint">shown to the committee</span><input name="full_name" defaultValue={profile.full_name} required /></label>
        <label style={{ flex: "1 1 160px" }}>Phone<input name="phone" defaultValue={profile.phone ?? ""} /></label>
        <SubmitButton className="button secondary">Save</SubmitButton>
      </form>
      <p className="small muted">Signed in as {profile.email}.</p>
    </>
  );
}

async function ownerIds(supabase: Awaited<ReturnType<typeof requireRole>>["supabase"], profileId: string) {
  const { data } = await supabase.from("owners").select("id").eq("profile_id", profileId);
  const ids = (data ?? []).map((o: { id: string }) => o.id);
  return ids.length ? ids.join(",") : "00000000-0000-0000-0000-000000000000";
}
