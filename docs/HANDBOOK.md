# Handbook

How to run the PHRF app day to day, how to change it, and how to hand it to
someone else. Written for people who do not write code.

## How an application moves

1. **Owner applies** at `/apply`. They sign in with an emailed code, fill in the
   boat, sails and prop, and upload photos and sail sheets. The boat is matched
   to an existing record by sail number ("USA 1234", "usa-1234" and "USA1234"
   count as the same boat).
2. **It appears under Committee → New.** Anyone on the committee can look.
3. **The chair opens voting** (Chair actions → Move to *In review*). The vote
   deadline defaults to the review window set on the Admin page.
   If something is missing, choose *Needs info from owner* and write a note;
   the owner sees that note on their application page and can upload more files.
4. **Members vote**: a proposed rating in seconds per mile, the adjustments
   and reasons, and an optional comment, or *recuse* for a conflict of
   interest. Votes can be changed until voting closes. Discussion goes in the
   Discussion box and stays with the application as the record.
   Owners never see draft votes or the discussion.
5. **The chair issues the rating** once quorum is reached. The form is
   pre-filled with the median vote. The rating is published on the public list
   immediately, and any older rating for that boat and configuration is
   replaced (but kept in the boat's history).
6. **Made a mistake?** Press *Undo rating*. The old rating comes back and
   voting reopens.

An **appeal** is just another application with type *Appeal*; the chair moves
it to *Appealed* to open voting.

## Roles

| Role | Can |
| --- | --- |
| Boat owner | Apply, upload files, see their own applications |
| Committee member | Everything above for all applications, plus vote and discuss, and edit boat records |
| Rating chair | Also open and close voting, ask for info, issue and undo ratings |
| Admin | Also change roles, the rating rules, and import or undo imports |

Everyone signs in as a boat owner first; an admin then changes their role on
the Admin page. Keep **at least two admins**.

## Importing past applications

The 2025+ applications found in the old email archive come as a spreadsheet.
To bring them in:

1. Open the spreadsheet in Google Sheets and choose **File → Download →
   Comma-separated values (.csv)**.
2. In the app go to **Admin → Import past applications** and pick the file.
3. Check the preview. Problems are listed by row; anything marked as an error
   must be fixed in the spreadsheet first. Unrecognized columns are kept as
   extra details.
4. Press **Import**. Rows marked rated (or that have a rating) publish that
   rating. If something looks wrong afterwards, press **Undo import**.

Only a sail number is required. The template linked on the import page shows
every column the app understands. Attachments stay in Google Drive: put the
folder link in the "Drive folder" column and it appears on the application.

## Making changes to the app

You do not need to touch code. Ask Claude (in this project) for the change in
plain words, for example "add a field for the boat's hull color" or "email the
committee when a new application arrives". Claude will:

1. make the change on a separate copy (a *branch*) and open a *pull request*
   on GitHub;
2. Vercel posts a **preview link** on that pull request, a full working copy
   of the app with the change, so you can try it;
3. when you are happy, you (or Claude, with your OK) press **Merge** and the
   live app updates within a couple of minutes.

If an update causes trouble, Vercel can switch back to the previous version
instantly: **Vercel → the project → Deployments → pick the last good one →
Promote to Production** (sometimes labelled *Instant Rollback*).

Changes to the database are added as new numbered files in
`supabase/migrations/`. Each one is run once, in order, in the Supabase SQL
Editor (or by Claude with your permission). Never edit a file that has
already been run; add a new one instead.

## Backups and getting your data out

- **Ratings list**: the *Download this list as a spreadsheet* link on the home page.
- **Everything**: in Supabase, **Table Editor → pick a table → Export to CSV**
  for `boats`, `owners`, `applications`, `votes`, `comments` and `ratings`.
  Do this at the end of each season and keep the files in the committee's
  Google Drive.
- **Files**: in Supabase **Storage → attachments**.
- The free Supabase plan does not keep automatic backups you can restore; the
  Pro plan ($25/month) does. The season-end export above is the free safety net.

## Handing the app to someone else

The app is not tied to any one person. Everything lives in three accounts,
each of which can be shared or transferred:

| What | Where | To share | To hand over completely |
| --- | --- | --- | --- |
| The code | GitHub repository `phrf-app` | Settings → Collaborators → add them | Settings → *Transfer ownership* (to them or to a GitHub organization for the club) |
| Data, files, sign-in | Supabase organization | Organization settings → Team → invite them as Owner | Project settings → *Transfer project* to their organization |
| The web address | Vercel project | Free plan: one person only; Pro allows team members | Project settings → *Transfer project* to their account or team |
| Admin role in the app | Admin page | Make them an Admin | Make them an Admin, then they change your role |

Recommended when the time comes: create a shared committee email (for
example a free Gmail like `southtexasphrf@gmail.com`) and a GitHub
organization for the committee, then transfer all three into them. After
that, whoever holds the committee email holds the app, and volunteers can
change over without anything breaking. Nothing in the code needs to change
for a transfer. If the web address changes, update the **Site URL** in
Supabase (Authentication → URL Configuration).

Checklist for the new maintainer:

- [ ] Has access to the GitHub repository, the Supabase organization and the Vercel project
- [ ] Is an Admin in the app
- [ ] Has read this handbook and `docs/SETUP.md`
- [ ] Knows where the season-end exports are kept

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| The site says "Almost there" | The two Supabase settings are missing in Vercel → Settings → Environment Variables. Add them and redeploy. |
| Error loading anything, after a quiet spell | The free Supabase project paused. Open the Supabase dashboard and press **Restore project**. |
| "Too many codes were sent recently" | The built-in email limit. Wait an hour, or set up custom SMTP (see SETUP). |
| Sign-in link opens a page saying it didn't work | It was opened in a different browser or the phone app. Type the 6-digit code instead. |
| Someone can't see the Committee menu | Their role is still *Boat owner*. Change it on the Admin page. |
