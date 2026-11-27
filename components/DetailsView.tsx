import { DETAIL_SECTIONS, DETAIL_TEXT } from "@/lib/details";
import { formatDateTime } from "@/lib/labels";

type Obj = Record<string, unknown>;

/** Shows the answers from an application form, section by section. */
export function DetailsView({ details }: { details: Obj }) {
  const known = new Set(["boat", "rig", "sails", "engine", "payment", "attestation", "owner", ...DETAIL_TEXT.map(([k]) => k)]);
  const extra = Object.entries(details).filter(([k, v]) => !known.has(k) && v !== "" && v != null);
  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
      {DETAIL_SECTIONS.map((s) => {
        const sec = (details[s.key] ?? {}) as Obj;
        const rows = s.fields.filter(([k]) => sec[k] != null && sec[k] !== "");
        if (!rows.length) return null;
        return (
          <div key={s.key}>
            <h3>{s.title}</h3>
            <dl className="facts">
              {rows.map(([k, label]) => (
                <Fragment key={k} label={label} value={k === "at" ? formatDateTime(String(sec[k])) : String(sec[k])} />
              ))}
            </dl>
          </div>
        );
      })}
      {DETAIL_TEXT.map(([k, label]) => details[k] ? (
        <div key={k}><h3>{label}</h3><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{String(details[k])}</p></div>
      ) : null)}
      {extra.length > 0 && (
        <div>
          <h3>Other details</h3>
          <dl className="facts">
            {extra.map(([k, v]) => <Fragment key={k} label={k} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />)}
          </dl>
        </div>
      )}
    </div>
  );
}

function Fragment({ label, value }: { label: string; value: string }) {
  return (<><dt>{label}</dt><dd style={{ whiteSpace: "pre-wrap" }}>{value}</dd></>);
}
