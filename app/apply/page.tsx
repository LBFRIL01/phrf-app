import { requireRole } from "@/lib/auth";
import type { Boat, Owner } from "@/lib/types";
import { ApplyForm } from "./ApplyForm";

export const metadata = { title: "Apply for a rating" };

export default async function ApplyPage() {
  const { supabase, profile } = await requireRole("owner", "/apply");
  const { data: owner } = await supabase.from("owners").select("*").eq("profile_id", profile.id).maybeSingle();
  let boats: Boat[] = [];
  if (owner) {
    const { data } = await supabase.from("boat_owners").select("boats(*)").eq("owner_id", (owner as Owner).id);
    boats = ((data ?? []) as unknown as { boats: Boat }[]).map((r) => r.boats).filter(Boolean);
  }
  return (
    <>
      <h1>Apply for a PHRF rating</h1>
      <p className="muted">
        For new boats, renewals, rating changes (for example new sails or a different prop) and appeals. Fields marked *
        are required. You can add more files later from <em>My applications</em>.
      </p>
      <ApplyForm
        email={profile.email}
        owner={(owner as Owner | null) ?? { full_name: profile.full_name, phone: profile.phone }}
        boats={boats}
      />
    </>
  );
}
