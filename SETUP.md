# Setup guide: Supabase, login and Vercel

This connects Clinic OS to its database and login, then puts it online.
It takes about 20–30 minutes. Do the parts in order.

> **Use the clinic account (`smiledental8925@gmail.com`) for every sign-up below**, so the clinic owns the database and the hosting.

You will collect two values from Supabase: the **Project URL** and the **Publishable key**. Both are safe to share. **Never share the secret key** (`sb_secret_…`).

---

## Part A — Create the Supabase project (database + sign-in)

1. Go to **https://supabase.com** and click **Start your project**. Sign up with the clinic email (or **Continue with Google** using the clinic account).
2. Create an **organization** when asked (name: *Smile Dental Clinic*, plan: **Free**).
3. Click **New project**:
   - **Name:** `smile-clinic-os`
   - **Database password:** click **Generate a password** and save it somewhere safe (you won't need it day to day).
   - **Region:** **South Asia (Mumbai)** — closest to the clinic, so the app is faster.
   - Click **Create new project** and wait 1–2 minutes.
4. Open **Project Settings → API Keys** (on older dashboards: **Project Settings → API**). Copy:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **Publishable key** — starts with `sb_publishable_` (older dashboards call it the **anon public** key; that works too)

> **Free plan note:** Supabase pauses free projects after about a week with no activity. Daily clinic use keeps it awake; if it ever pauses during the build, open the project in the dashboard and click **Restore**.

---

## Part B — Create Dr. Rahil's login

1. In Supabase, open **Authentication → Users** → **Add user** → **Create new user**.
2. **Email:** `smiledental8925@gmail.com` · **Password:** a strong password Dr. Rahil will remember (12+ characters).
3. Tick **Auto Confirm User**, then **Create user**.
4. **Lock new sign-ups:** **Authentication → Sign In / Providers** → under **User Signups**, turn **Allow new users to sign up** off → **Save**. Nobody else can now create an account.

## Part B2 — Create the tables

1. In Supabase open **SQL Editor → New query**, paste the whole of `supabase/schema.sql` from this repository, and click **Run**. It builds every table, the booking rules and the photo store, and links the website booking to the account from Part B (it is safe to run again).
2. If you run it before creating the login in Part B, run it again afterwards.

---

## Part C — Try it on this computer

1. In the `smile-dental-website` folder, copy `.env.example` to a new file named `.env.local` and fill it in:
   ```
   NEXT_PUBLIC_SUPABASE_URL="https://abcdefgh.supabase.co"
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
   ALLOWED_EMAIL="smiledental8925@gmail.com"
   ```
2. Run `npm run dev` and open **http://localhost:3000/login**.
3. Sign in with the email and password from Part B. You should land on **Clinic OS → Welcome**.

If anything fails, note the exact message on screen and the step you were on.

---

## Part D — Put it online with Vercel

1. The code needs to be on **GitHub** first (a free account at https://github.com). Claude can prepare the repository and push it once you have an account.
2. Go to **https://vercel.com** → **Sign Up** → **Continue with GitHub**. Choose the **Hobby** (free) plan.
3. Click **Add New… → Project**, find the repository and click **Import**.
   - **Framework Preset:** Next.js (detected automatically)
   - **Root Directory:** leave as is if the repository contains only this app; otherwise choose `smile-dental-website`.
   - Open **Environment Variables** and add the same three values as `.env.local`.
   - Click **Deploy** and wait for it to finish. Vercel shows the live address, e.g. `https://smile-dental.vercel.app`.
4. Open `https://<your-address>/login` on Dr. Rahil's phone and sign in. Tip: in Chrome, **⋮ → Add to Home screen** so Clinic OS opens like an app.

Later, when the clinic's own domain is connected in Vercel, update `url` in `src/config/site.ts` (used by the sitemap).
