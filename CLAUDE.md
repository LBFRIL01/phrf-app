# Notes for Claude (and any developer)

The owner, Brooke, does not write code. Explain changes in plain English, open
a pull request for every change so Vercel produces a preview link, and never
change production data or settings without her OK.

## Layout
- `app/`: Next.js 16 App Router pages. Server actions live in `actions.ts`
  next to the pages that use them and redirect back with `?ok=` / `?error=`
  messages (see `lib/auth.ts` `back()`).
- `lib/`: shared logic. `import.ts` (spreadsheet mapping) and `voting.ts`
  (vote tally) are pure and unit tested.
- `supabase/migrations/`: the database. Access rules (RLS) and every
  privileged action (submit, set status, finalize, undo, import) are Postgres
  functions there. The app uses only the publishable key; there is no service
  key anywhere.
- `public/sw.js`: service worker (network first; only the rating list and an
  offline page are cached).

## Rules of the road
- Never hard-delete records: withdraw ratings, hide files/comments, tag imports
  with a batch so they can be undone.
- New database changes go in a new migration file; never edit an applied one.
  Extend `supabase/tests/access_rules.sql` for any new rule.
- Keep the app free of personal accounts or emails, so it can be handed over.

## Checks
- `npm test`, `npm run lint`, `./scripts/test-db.sh` (needs Postgres binaries).
- `node tests/e2e.js`: full browser walkthrough (sign-in, apply, vote, rate,
  undo, import) against the local stack below. Needs Playwright; wipes local data.
- Full stack locally: `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start`
  (needs Docker), put the printed API URL and publishable key in `.env.local`,
  then `npm run build && npm start`. Sign-in codes appear in Mailpit at
  http://127.0.0.1:54324.
