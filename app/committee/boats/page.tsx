import Link from "next/link";
import { requireRole } from "@/lib/auth";
import type { Boat, Rating } from "@/lib/types";
import { SailNumber } from "@/components/StatusBadge";

export const metadata = { title: "Boats" };

export default async function Boats({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireRole("committee", "/committee/boats");
  const { data } = await supabase.from("boats")
    .select("*, ratings(rating, configuration, withdrawn_at), boat_owners(relation, owners(full_name))")
    .order("sail_number", { nullsFirst: true }).order("name").limit(2000);
  type Row = Boat & { ratings: Pick<Rating, "rating" | "configuration" | "withdrawn_at">[]; boat_owners: { relation: string; owners: { full_name: string } | null }[] };
  const all = (data ?? []) as Row[];
  const q = (sp.q ?? "").toLowerCase().trim();
  const rows = q ? all.filter((b) => [b.sail_number, b.name, b.make, b.model, ...b.boat_owners.map((o) => o.owners?.full_name)]
    .some((v) => v?.toLowerCase().includes(q))) : all;

  return (
    <>
      <h1>Boats</h1>
      <form className="row" style={{ marginBottom: 12 }}>
        <label style={{ flex: "1 1 260px" }}>Search<input name="q" defaultValue={sp.q ?? ""} placeholder="Sail, name, design or owner" /></label>
        <button className="button secondary">Search</button>
      </form>
      <p className="small muted">{rows.length} boat{rows.length === 1 ? "" : "s"}. Boats are added automatically when an application comes in or is imported.{all.some((b) => !b.sail_number) && " Boats marked “Sail # needed” are waiting for a sail number: open the boat and fill it in, or it is filled in automatically when the owner applies online."}</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Sail</th><th>Name</th><th>Design</th><th>Owners</th><th className="num">Rating</th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id}>
                <td><Link href={`/committee/boats/${b.id}`}>{b.sail_number || "Open"}</Link>{!b.sail_number && <> <SailNumber value={null} /></>}</td>
                <td>{b.name}</td>
                <td>{[b.make, b.model].filter(Boolean).join(" ")}{b.year ? ` (${b.year})` : ""}</td>
                <td>{b.boat_owners.map((o) => o.owners?.full_name).filter(Boolean).join(", ")}</td>
                <td className="num">{b.ratings.filter((r) => !r.withdrawn_at).map((r) => `${r.rating}${r.configuration !== "Spinnaker" ? ` ${r.configuration}` : ""}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
