import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ROLE_LABEL, formatDate } from "@/lib/labels";
import type { Profile, Role, Settings } from "@/lib/types";
import { Notice } from "@/components/Notice";
import { SubmitButton } from "@/components/SubmitButton";
import { saveSettings, setRole } from "./actions";

export const metadata = { title: "Admin" };

export default async function Admin({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, profile: me } = await requireRole("admin", "/admin");
  const [{ data: people }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*").order("role", { ascending: false }).order("full_name"),
    supabase.from("settings").select("*").eq("id", 1).single(),
  ]);
  const st = settings as Settings;
  const q = (sp.q ?? "").toLowerCase();
  const list = ((people ?? []) as Profile[]).filter((p) => !q || p.email.toLowerCase().includes(q) || p.full_name.toLowerCase().includes(q));

  return (
    <>
      <Notice ok={sp.ok} error={sp.error} />
      <h1>Admin</h1>
      <p><Link className="button secondary" href="/admin/import">Import past applications</Link></p>

      <h2>People and roles</h2>
      <p className="small muted">
        Anyone who signs in starts as a boat owner. To add a committee member, ask them to sign in once, then change their
        role here. <strong>Committee members</strong> review, discuss and vote. The <strong>rating chair</strong> also opens
        and closes voting and issues ratings. <strong>Admins</strong> can do everything, including this page. Keep at least
        two admins so the app never depends on one person.
      </p>
      <form className="row" style={{ marginBottom: 8 }}>
        <label style={{ flex: "1 1 240px" }}>Find a person<input name="q" defaultValue={sp.q ?? ""} placeholder="Name or email" /></label>
        <button className="button secondary">Find</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>{p.full_name || <span className="muted">(no name yet)</span>}{p.id === me.id && <span className="muted"> (you)</span>}</td>
                <td>{p.email}</td>
                <td>{formatDate(p.created_at)}</td>
                <td>
                  <form action={setRole} className="row">
                    <input type="hidden" name="profile_id" value={p.id} />
                    <select name="role" defaultValue={p.role} aria-label={`Role for ${p.email}`} style={{ width: "auto" }}>
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                    <SubmitButton className="button secondary">Save</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Rating rules</h2>
      <form action={saveSettings} className="card grid">
        <label>Organization name<input name="org_name" defaultValue={st?.org_name} /></label>
        <label>Votes needed (quorum)<input name="quorum" type="number" min={1} defaultValue={st?.quorum} /></label>
        <label>Review window (days)<input name="review_days" type="number" min={1} defaultValue={st?.review_days} /></label>
        <label>Ratings valid for (months)<input name="rating_valid_months" type="number" min={1} defaultValue={st?.rating_valid_months} /></label>
        <div style={{ alignSelf: "end" }}><SubmitButton>Save rules</SubmitButton></div>
      </form>
    </>
  );
}
