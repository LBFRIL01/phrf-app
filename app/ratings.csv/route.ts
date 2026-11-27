import { createClient } from "@/lib/supabase/server";

// The public rating list as a CSV file, for scoring programs and other clubs.
export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_ratings");
  const rows = (data ?? []) as Record<string, unknown>[];
  const cols = ["sail_number", "boat_name", "make", "model", "year", "rating", "configuration", "effective_on", "expires_on"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="phrf-ratings-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
