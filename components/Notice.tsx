export function Notice({ ok, error }: { ok?: string | string[]; error?: string | string[] }) {
  const o = Array.isArray(ok) ? ok[0] : ok;
  const e = Array.isArray(error) ? error[0] : error;
  return (
    <>
      {o && <p className="notice ok" role="status">{o}</p>}
      {e && <p className="notice error" role="alert">{e}</p>}
    </>
  );
}
