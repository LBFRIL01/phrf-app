// The app reads its Supabase address and public key from environment
// variables. Either the newer "publishable" key or the older "anon" key works.

/** Keeps only "https://xyz.supabase.co" even if a path such as /rest/v1/ or spaces were pasted too. */
export function cleanSupabaseUrl(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  try {
    return new URL(v).origin;
  } catch {
    return v.replace(/\/+$/, "");
  }
}

export const SUPABASE_URL = cleanSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_KEY = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
).trim();
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
