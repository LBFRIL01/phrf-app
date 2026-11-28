# Setting up the app (one time)

This puts the app online using two free services. You sign in to both with
your GitHub account, so there are no new passwords to keep. No credit card is
needed. Allow about 20 minutes.

You will end up with:

- **Supabase**: holds the data, the uploaded files and the sign-in system.
- **Vercel**: runs the app and gives it a web address, plus a preview link
  for every proposed change.

> Tip: if you would rather not do these steps yourself, you can share your
> screen with a committee member who is comfortable with websites, or ask
> Claude to walk you through each screen.

## 1. Create the Supabase project

1. Go to <https://supabase.com> and choose **Start your project**, then **Continue with GitHub**.
2. When asked for an organization, name it something like **South Texas PHRF** and pick the **Free** plan.
3. Choose **New project**:
   - Name: `phrf`
   - Database password: press **Generate a password**, then save it in your
     password manager (you will rarely need it, but keep it).
   - Region: **East US (Ohio)** or the closest US region offered.
4. Wait a minute or two while it sets up.

## 2. Create the database tables

1. In the left menu open **SQL Editor**, then **New query**.
2. Open the file `supabase/migrations/20261127000000_init.sql` in the GitHub
   repository, press the **Copy raw file** button, and paste it into the editor.
3. Press **Run**. You should see "Success. No rows returned".

## 3. Sign-in emails (nothing to do yet)

People sign in with a link Supabase emails them. With Supabase's built-in
email the message can't be customized, and that's fine: the link works as long
as it is opened on the same phone or computer (and browser) where they asked
for it.

Later, when you connect your own email sender (see "Good to know" below),
Supabase unlocks the templates. Then change the **Magic Link** and **Confirm
signup** templates to include a 6-digit code, which also works inside the
installed phone app:

```html
<h2>Your South Texas PHRF sign-in code</h2>
<p>Enter this code in the app:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>Or tap this link on the same device: <a href="{{ .ConfirmationURL }}">Sign in</a></p>
<p>If you didn't ask to sign in, you can ignore this email.</p>
```

The sign-in page already accepts either the link or the code.

## 4. Copy two values for the next step

Open **Project Settings → API Keys** (or the **Connect** button at the top) and
copy:

- the **Project URL** (looks like `https://abcdefgh.supabase.co`)
- the **Publishable key** (starts with `sb_publishable_`; older projects call it the **anon public** key)

These two are safe to share with the app; they are not secrets. Never copy the
**secret** or **service_role** key anywhere.

## 5. Put the app online with Vercel

1. Go to <https://vercel.com/signup>, choose **Hobby**, and **Continue with GitHub**.
2. Choose **Add New… → Project**, find **phrf-app** and press **Import**.
   (If it is not listed, press **Adjust GitHub App Permissions** and allow the `phrf-app` repository.)
3. Open **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = the Project URL from step 4
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = the Publishable key from step 4
4. Press **Deploy**. After a minute you get a web address like `https://phrf-app.vercel.app`.

## 6. Tell Supabase the app's address

Back in Supabase, open **Authentication → URL Configuration**:

- **Site URL**: your Vercel address, e.g. `https://phrf-app.vercel.app`
- **Redirect URLs**: add `https://phrf-app.vercel.app/**` and
  `https://phrf-app-*.vercel.app/**` (the second lets preview links sign in too).

## 7. Sign in and make yourself admin

1. Open your Vercel address and press **Sign in**. Enter your email and the code you receive.
2. The **first person to sign in becomes the admin** automatically. That should be you.
3. Ask one other trusted board member to sign in, then on the **Admin** page
   make them an admin too, so the app never depends on one person.
4. Ask committee members to sign in once, then give them the
   **Committee member** role (and yourself or the chair the **Rating chair** role, if you are not an admin).

On a phone, open the address and choose **Share → Add to Home Screen**
(iPhone) or **Install app** (Android).

## Good to know about the free plans

- **Supabase free projects pause after a week with no visits.** If that happens
  the app shows an error until you press **Restore** on the Supabase
  dashboard. During the season it will be used often enough not to matter. The
  Pro plan ($25/month) never pauses and adds daily backups.
- **Sign-in emails are limited.** Supabase's built-in email only sends a handful
  of messages per hour, which is fine for testing and the committee. Before
  inviting all boat owners, connect a proper email sender (Supabase calls it
  "custom SMTP"). A free option is a Gmail account with an app password;
  ask Claude to walk you through it when you get there.
- **Vercel's free Hobby plan is meant for non-commercial use.** A volunteer
  rating committee is usually fine there; if the organization starts taking
  payments through the app, the Pro plan ($20/month) is the safe choice.
