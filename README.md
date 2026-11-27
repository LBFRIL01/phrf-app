# South Texas PHRF app

A web app for the South Texas PHRF rating committee. Boat owners apply for
ratings online, the committee reviews and votes from anywhere, and the
current ratings are published for race committees. It installs on a phone
like an app.

Later it will grow into race management for Bay Yacht Club (regatta
registration, scoring and results), built on the same boat records.

## What it does today

| For | What they can do |
| --- | --- |
| Anyone | See the current rating list, search it, download it as a spreadsheet for scoring software |
| Boat owners | Sign in with an emailed code (no password), apply (new, renewal, change, appeal), upload photos and sail sheets, follow their application's status |
| Committee members | See every application with its files, compare with sister ships, discuss, and vote with adjustments and reasons, or recuse |
| Rating chair | Open and close voting, ask the owner for more information, issue the final rating, and undo a rating if needed |
| Admins | Give people roles, set the quorum and review window, and import past applications from a spreadsheet |

Nothing important is ever deleted. Ratings that are replaced or undone stay in
each boat's history, hidden files and comments can be shown again, and imports
can be undone.

## Guides

- [Setting it up](docs/SETUP.md): the one-time steps to put the app online (about 20 minutes, free).
- [Handbook](docs/HANDBOOK.md): day-to-day use, importing old applications, making changes, backups, and handing the app to someone else.

## How it is built (for whoever maintains it)

- **Next.js** web app (in `app/`), hosted on **Vercel**. Every change pushed to
  GitHub gets its own preview link; merging to the main branch publishes it.
- **Supabase** for the database, sign-in and file storage. The whole database
  design, including who may see and change what, is in one readable file:
  `supabase/migrations/20261127000000_init.sql`.
- Checks: `npm test` (spreadsheet import and vote tally),
  `./scripts/test-db.sh` (database access rules on a throwaway Postgres), and
  `npm run lint` (type checks).

To run it on your own computer: install Node 20+, copy `.env.example` to
`.env.local` and fill in the two Supabase values, then `npm install` and
`npm run dev`, and open http://localhost:3000.
