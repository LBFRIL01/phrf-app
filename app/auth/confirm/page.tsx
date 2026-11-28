"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Where the sign-in link in the email lands. The sign-in details arrive after
// the "#" in the address, which only the browser can read, so this page saves
// them and then moves on.
function Confirm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = params.get("next") ?? "/my";
    const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/my";
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const problem = hash.get("error_description") ?? params.get("error_description");
    if (problem || !access_token || !refresh_token) {
      setError(problem ?? "This sign-in link is incomplete or has already been used.");
      return;
    }
    createClient().auth.setSession({ access_token, refresh_token }).then(({ error }) => {
      if (error) { setError(error.message); return; }
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(next);
      router.refresh();
    });
  }, [params, router]);

  if (error) {
    return (
      <div className="card" style={{ maxWidth: 520 }}>
        <h1>That link didn&apos;t work</h1>
        <p>{error.replace(/\+/g, " ")}</p>
        <p>Links expire after an hour and work only once. <Link href="/login">Request a new one</Link>.</p>
      </div>
    );
  }
  return <p className="muted">Signing you in…</p>;
}

export default function ConfirmPage() {
  return <Suspense fallback={<p className="muted">Signing you in…</p>}><Confirm /></Suspense>;
}
