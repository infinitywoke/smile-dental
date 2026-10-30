# Setting up the demo clinic

The demo is Brightside Dental, Manipal: an invented clinic with its own website and its own Clinic OS login. Its
patients and records are invented too, and every page of its website says so. It stays out of search engines.

## 1. The login (owner, about a minute)
1. Supabase dashboard, the project, **Authentication**, **Users**, **Add user**, **Create new user**.
2. Email `demo@brightside.example`. Choose a password. Tick **Auto Confirm User**.
3. Then the set-up can run (next step).

## 2. The clinic and its records (Claude, or anyone with the Supabase CLI)
Run `supabase/demo-clinic-2026-10.sql`. It sets up the clinic, its two chairs, its two dentists and its login, then
fills in ten invented patients, today's and tomorrow's appointments, bills, a waiting website request, low stock and a
price list.

**Run it again before each demo:** the records start over, dated from that day, so the demo always looks current.

Before this step the login has no clinic, so it is the moment to check that such a login is refused at sign-in.

## 3. Its website (owner, about five minutes)
1. Vercel, **Add New**, **Project**, import the same GitHub repository. Name it, for example, `brightside-dental-demo`.
2. Add these environment variables before the first deploy:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SITE` | `brightside` |
| `NEXT_PUBLIC_SITE_URL` | the project's address, such as `https://brightside-dental-demo.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | the same as the main project |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the same as the main project |

3. Deploy. A booking made on that website lands in the demo clinic's Clinic OS.

For the new-request notification to reach a phone, also copy `CLINIC_OS_CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and
`VAPID_PRIVATE_KEY` from the main project.

**To check before relying on it:** Vercel's free Hobby plan is for non-commercial use. A demo shown to prospective
clients may not count as non-commercial, so a paying client's website should go on Vercel Pro or another host.

## A real clinic, later
Its content is a new file in `src/config/sites` beside `smile-dental.ts`, with its photos, and its own hosting project
with `NEXT_PUBLIC_SITE` set to it. `src/config/site.ts` lists the clinics. Nothing is forked.
