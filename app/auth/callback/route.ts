import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Where the sign-in link in the email lands.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawNext = url.searchParams.get("next") ?? "/my";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/my";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let error: { message: string } | null = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
  else error = { message: "The sign-in link is incomplete." };

  if (error) {
    const msg = "That sign-in link didn't work (it may have been opened in a different browser). Please enter the 6-digit code instead, or request a new one.";
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&error=${encodeURIComponent(msg)}`, url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
