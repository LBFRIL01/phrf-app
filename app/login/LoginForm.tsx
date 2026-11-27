"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (error) setError(friendly(error.message));
    else setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) { setError(friendly(error.message)); return; }
    router.replace(next);
    router.refresh();
  }

  if (step === "code") {
    return (
      <form onSubmit={verify} className="card stack">
        <p>Check your email at <strong>{email}</strong> and tap the sign-in link, on this same device and browser. If the email shows a 6-digit code instead, type it here.</p>
        <label>
          Code
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
        </label>
        {error && <p className="notice error">{error}</p>}
        <div className="row">
          <button className="button" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
          <button type="button" className="button secondary" onClick={() => { setStep("email"); setCode(""); }}>Use a different email</button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} className="card stack">
      <label>
        Email
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      {error && <p className="notice error">{error}</p>}
      <button className="button" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</button>
    </form>
  );
}

function friendly(msg: string) {
  if (/rate limit|too many/i.test(msg)) return "Too many codes were sent recently. Please wait a few minutes and try again.";
  if (/expired|invalid/i.test(msg)) return "That code didn't work or has expired. Check the newest email, or send a new code.";
  return msg;
}
