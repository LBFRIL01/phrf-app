"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadFiles, type FileKind, MAX_FILE_MB } from "@/lib/upload";
import type { AppType, Boat, Owner } from "@/lib/types";

type Prefill = Partial<Pick<Owner, "full_name" | "phone" | "club" | "us_sailing_number">>;

const FILE_SLOTS: { kind: FileKind; label: string; hint: string; accept: string }[] = [
  { kind: "photo", label: "Photos", hint: "Profile, stern, rig and propeller", accept: "image/*" },
  { kind: "sail_measurements", label: "Sail measurement sheet", hint: "PDF or photo", accept: "image/*,application/pdf" },
  { kind: "certificate", label: "Prior certificates", hint: "From other PHRF fleets, if any", accept: "image/*,application/pdf" },
  { kind: "payment", label: "Payment confirmation", hint: "Receipt or screenshot", accept: "image/*,application/pdf" },
];

/** Turns form fields named like "boat.name" into { boat: { name } }. */
function toPayload(form: HTMLFormElement) {
  const out: Record<string, unknown> = {};
  new FormData(form).forEach((value, name) => {
    if (typeof value !== "string" || name.startsWith("file:")) return;
    const v = value.trim();
    if (!v) return;
    const parts = name.split(".");
    let node = out as Record<string, unknown>;
    parts.slice(0, -1).forEach((p) => { node = (node[p] ??= {}) as Record<string, unknown>; });
    node[parts[parts.length - 1]] = v;
  });
  return out;
}

export function ApplyForm({ email, owner, boats }: { email: string; owner: Prefill; boats: Boat[] }) {
  const router = useRouter();
  const [type, setType] = useState<AppType>(boats.length ? "renewal" : "new");
  const [boatId, setBoatId] = useState<string>(boats[0]?.id ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boat = useMemo(() => boats.find((b) => b.id === boatId) ?? null, [boats, boatId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError(null);
    const payload = toPayload(form);
    payload.attestation = { ...(payload.attestation as object), at: new Date().toISOString() };

    const files: { file: File; kind: FileKind }[] = [];
    for (const slot of FILE_SLOTS) {
      const input = form.elements.namedItem(`file:${slot.kind}`) as HTMLInputElement | null;
      Array.from(input?.files ?? []).forEach((file) => files.push({ file, kind: slot.kind }));
    }
    const tooBig = files.find((f) => f.file.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) { setError(`${tooBig.file.name} is over ${MAX_FILE_MB} MB. Please pick a smaller file.`); return; }
    if (type === "new" && !files.some((f) => f.kind === "photo")) {
      if (!window.confirm("You haven't added any photos. The committee usually needs them for a new boat. Submit anyway?")) return;
    }

    const supabase = createClient();
    setBusy("Submitting your application…");
    const { data, error } = await supabase.rpc("submit_application", { p: payload });
    if (error || !data?.[0]) { setBusy(null); setError(error?.message ?? "Something went wrong. Please try again."); return; }
    const { id, number } = data[0] as { id: string; number: string };

    let problems: string[] = [];
    if (files.length) {
      setBusy(`Uploading files (0 of ${files.length})…`);
      problems = await uploadFiles(supabase, id, files, (d, t) => setBusy(`Uploading files (${d} of ${t})…`));
    }
    const msg = problems.length
      ? `Application ${number} was submitted, but some files did not upload: ${problems.join(" ")} You can add them below.`
      : `Thank you! Application ${number} was submitted.`;
    router.push(`/my/${id}?${problems.length ? "error" : "ok"}=${encodeURIComponent(msg)}`);
    router.refresh();
  }

  // Changing the boat in the picker re-fills the form, so the key forces fresh defaults.
  const b = boat;
  return (
    <form onSubmit={onSubmit} key={boatId || "new"}>
      <fieldset>
        <legend>What are you applying for?</legend>
        <div className="grid">
          <label>
            Application type *
            <select name="type" value={type} onChange={(e) => setType(e.target.value as AppType)}>
              <option value="new">New boat (first rating here)</option>
              <option value="renewal">Renewal (no changes)</option>
              <option value="change">Rating change (sails, rig, prop…)</option>
              <option value="appeal">Appeal of a rating</option>
            </select>
          </label>
          {boats.length > 0 && (
            <label>
              Boat
              <select value={boatId} onChange={(e) => setBoatId(e.target.value)}>
                {boats.map((x) => <option key={x.id} value={x.id}>{x.name ? `${x.name} (${x.sail_number})` : x.sail_number}</option>)}
                <option value="">A different boat</option>
              </select>
            </label>
          )}
        </div>
        {type === "appeal" && (
          <label style={{ marginTop: 12 }}>
            Grounds for appeal * <span className="hint">What should change, and why? Race results or comparisons help.</span>
            <textarea name="appeal_grounds" required />
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Owner</legend>
        <div className="grid">
          <label>Full name *<input name="owner.full_name" defaultValue={owner.full_name ?? ""} required autoComplete="name" /></label>
          <label>Email<input value={email} disabled /></label>
          <label>Phone<input name="owner.phone" defaultValue={owner.phone ?? ""} autoComplete="tel" /></label>
          <label>Yacht club<input name="owner.club" defaultValue={owner.club ?? ""} /></label>
          <label>US Sailing member #<input name="owner.us_sailing_number" defaultValue={owner.us_sailing_number ?? ""} /></label>
          <label>
            You are the…
            <select name="owner.relation" defaultValue="owner">
              <option value="owner">Owner</option><option value="co-owner">Co-owner</option><option value="charterer">Charterer</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Boat</legend>
        <div className="grid">
          <label>Sail number *<input name="boat.sail_number" defaultValue={b?.sail_number ?? ""} required /></label>
          <label>Boat name<input name="boat.name" defaultValue={b?.name ?? ""} /></label>
          <label>Builder<input name="boat.make" defaultValue={b?.make ?? ""} placeholder="e.g. J/Boats" /></label>
          <label>Model<input name="boat.model" defaultValue={b?.model ?? ""} placeholder="e.g. J/105" /></label>
          <label>Year<input name="boat.year" inputMode="numeric" pattern="\d{4}" defaultValue={b?.year ?? ""} /></label>
          <label>Hull number<input name="boat.hull_number" defaultValue={b?.hull_number ?? ""} /></label>
          <label>LOA (ft)<input name="boat.loa_ft" inputMode="decimal" defaultValue={b?.loa_ft ?? ""} /></label>
          <label>LWL (ft)<input name="boat.lwl_ft" inputMode="decimal" defaultValue={b?.lwl_ft ?? ""} /></label>
          <label>Beam (ft)<input name="boat.beam_ft" inputMode="decimal" defaultValue={b?.beam_ft ?? ""} /></label>
          <label>Draft (ft)<input name="boat.draft_ft" inputMode="decimal" defaultValue={b?.draft_ft ?? ""} /></label>
          <label>Displacement (lb)<input name="boat.displacement_lb" inputMode="numeric" defaultValue={b?.displacement_lb ?? ""} /></label>
          <label>Home port<input name="boat.home_port" defaultValue={b?.home_port ?? ""} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Rig and keel</legend>
        <div className="grid">
          <label>
            Rig
            <select name="rig.rig" defaultValue={b?.rig ?? ""}>
              <option value="">Choose…</option><option>Masthead</option><option>Fractional</option><option>Other</option>
            </select>
          </label>
          <label>
            Keel
            <select name="rig.keel" defaultValue={b?.keel ?? ""}>
              <option value="">Choose…</option><option>Fin</option><option>Bulb</option><option>Wing</option>
              <option>Shoal</option><option>Full</option><option>Centerboard / swing keel</option><option>Other</option>
            </select>
          </label>
          <label>Mast height above water (ft)<input name="rig.mast_height_ft" inputMode="decimal" /></label>
          <label>I (ft) <span className="hint">foretriangle height</span><input name="rig.I" inputMode="decimal" /></label>
          <label>J (ft) <span className="hint">foretriangle base</span><input name="rig.J" inputMode="decimal" /></label>
          <label>P (ft) <span className="hint">main luff</span><input name="rig.P" inputMode="decimal" /></label>
          <label>E (ft) <span className="hint">main foot</span><input name="rig.E" inputMode="decimal" /></label>
        </div>
        <label style={{ marginTop: 12 }}>
          Modifications from standard <span className="hint">keel, rudder, rig, bowsprit, anything else</span>
          <textarea name="rig.modifications" />
        </label>
      </fieldset>

      <fieldset>
        <legend>Sails</legend>
        <div className="grid">
          <label>Largest headsail LP (%)<input name="sails.largest_headsail_lp" inputMode="numeric" placeholder="e.g. 155" /></label>
          <label>
            Roller furling
            <select name="sails.roller_furling" defaultValue=""><option value="">Choose…</option><option>Yes</option><option>No</option></select>
          </label>
          <label>
            Spinnaker
            <select name="sails.spinnaker" defaultValue="">
              <option value="">Choose…</option><option>None</option><option>Symmetric on a pole</option>
              <option>Asymmetric tacked on centerline</option><option>Asymmetric on a sprit / pole</option><option>Both</option>
            </select>
          </label>
          <label>Pole / sprit length (ft)<input name="sails.pole_length_ft" inputMode="decimal" /></label>
        </div>
        <label style={{ marginTop: 12 }}>Headsails <span className="hint">sizes you carry</span><textarea name="sails.headsails" /></label>
        <label>Spinnakers <span className="hint">sizes / areas</span><input name="sails.spinnaker_size" /></label>
        <label>Mainsail <span className="hint">e.g. full battens, square top</span><input name="sails.mainsail" /></label>
      </fieldset>

      <fieldset>
        <legend>Engine and propeller</legend>
        <div className="grid">
          <label>
            Engine
            <select name="engine.engine" defaultValue=""><option value="">Choose…</option><option>Inboard</option><option>Outboard</option><option>None</option></select>
          </label>
          <label>
            Propeller
            <select name="engine.propeller" defaultValue={b?.propeller ?? ""}>
              <option value="">Choose…</option><option>Fixed 2-blade</option><option>Fixed 3-blade</option>
              <option>Folding</option><option>Feathering</option><option>None / outboard</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Other ratings and notes</legend>
        <label>Prior ratings from other PHRF fleets <span className="hint">fleet, rating, year</span><textarea name="prior_ratings" /></label>
        <label>Anything else the committee should know<textarea name="owner_notes" /></label>
      </fieldset>

      <fieldset>
        <legend>Files</legend>
        <p className="small muted" style={{ marginTop: 0 }}>Up to {MAX_FILE_MB} MB each. Only the committee and you can see them.</p>
        <div className="grid">
          {FILE_SLOTS.map((s) => (
            <label key={s.kind}>
              {s.label} <span className="hint">{s.hint}</span>
              <input type="file" name={`file:${s.kind}`} accept={s.accept} multiple />
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Fee and signature</legend>
        <div className="grid">
          <label>
            Fee paid by
            <select name="payment.method" defaultValue="">
              <option value="">Not paid yet</option><option>Check</option><option>Venmo</option><option>Zelle</option><option>Cash</option><option>Other</option>
            </select>
          </label>
          <label>Payment reference <span className="hint">check # or note</span><input name="payment.reference" /></label>
          <label>Type your full name to sign *<input name="attestation.name" required /></label>
        </div>
        <label style={{ marginTop: 12, fontWeight: 400 }}>
          <input type="checkbox" required /> I confirm the information above is accurate, and I will tell the committee
          about any change to the boat, sails or equipment that could affect its rating.
        </label>
      </fieldset>

      {error && <p className="notice error" role="alert">{error}</p>}
      {busy && <p className="notice ok" role="status">{busy}</p>}
      <button className="button" disabled={!!busy}>{busy ? "Please wait…" : "Submit application"}</button>
    </form>
  );
}
