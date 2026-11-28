import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSupabaseUrl } from "./env.ts";

test("keeps only the address of the Supabase project", () => {
  assert.equal(cleanSupabaseUrl("https://abc.supabase.co"), "https://abc.supabase.co");
  assert.equal(cleanSupabaseUrl("https://abc.supabase.co/"), "https://abc.supabase.co");
  assert.equal(cleanSupabaseUrl(" https://abc.supabase.co/rest/v1/ "), "https://abc.supabase.co");
  assert.equal(cleanSupabaseUrl("http://127.0.0.1:54321"), "http://127.0.0.1:54321");
  assert.equal(cleanSupabaseUrl(undefined), "");
});
