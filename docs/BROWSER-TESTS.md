# Browser tests on GitHub

The browser tests (`e2e/`) click through Clinic OS on a phone-sized Chrome: new patient, visit, bill,
WhatsApp, bookings, offline, and the rest. On GitHub they run on every pull request (Dependabot's
package updates), every Sunday morning, and whenever you press **Run workflow**, against a **test
database of their own**: a second, free Supabase project with the same tables and one test login. They
never touch the clinic's database. The build machine still runs them on every change.

Not on every push: a run takes 15 to 25 minutes, and GitHub's free 2,000 minutes a month also pay for
the nightly backup. If the minutes ran out, the backup would stop until the next month (GitHub emails at
75% and 90% used: Settings → Billing shows the count).

Until the four secrets below exist, the "Browser tests" run says so and stops (green).

## Set up once (about 15 minutes, free)

1. **A second Supabase project.** Supabase → **New project** → name `smile-clinic-test`, region
   **South Asia (Mumbai)**, Free plan. Any database password (keep it somewhere; the tests don't need it).
   The free plan allows two active projects; if this is a third, pause one you don't use.
2. **Its tables.** In the new project: **SQL Editor → New query** → paste all of `supabase/schema.sql`
   → **Run**. (Or tell Claude the project's reference, the `xxxx` in `https://xxxx.supabase.co`, and it
   runs the file there.)
3. **The test login.** **Authentication → Users → Add user → Create new user**: any email address (no
   email is sent) and a password of letters and digits only, with **Auto Confirm User** ticked.
4. **Make the test login the clinic** (so the website's booking form lands in it). SQL Editor:

   ```sql
   insert into public.app_config (clinic_owner_id)
   select id from auth.users where email = '<the test email>'
   on conflict (id) do nothing;
   ```

5. **Its address and key.** **Project Settings → API Keys**: copy the **Project URL** and the
   **publishable key** (`sb_publishable_…`).
6. **GitHub secrets.** github.com/infinitywoke/smile-dental → **Settings → Secrets and variables →
   Actions → New repository secret**, four times:

   | Name | Value |
   | --- | --- |
   | `E2E_SUPABASE_URL` | the Project URL |
   | `E2E_SUPABASE_PUBLISHABLE_KEY` | the publishable key |
   | `E2E_TEST_EMAIL` | the test login's email |
   | `E2E_TEST_PASSWORD` | its password |

   Then the same four under **Secrets and variables → Dependabot**, so Dependabot's update pull
   requests are browser-tested too (GitHub keeps those secrets apart).
7. **Try it.** **Actions → Browser tests → Run workflow**. A run takes 15 to 25 minutes; a failed run
   emails you, and its page has a **browser-test-report** to download (open `index.html`; each failed
   test has a step-by-step trace).

## Good to know

- The test project is **smile-clinic-test** (ref `prdobgcyvecxqzqjhsip`, region Tokyo), made by the owner
  on 23 Oct 2026. Its data is only test data: patients named `E2E-…`, made and deleted by each run.
- A free project that nobody uses for a week is paused by Supabase. The daily health check keeps it awake; if it is
  paused anyway, **Restore** it in Supabase and run the tests again.
- When `supabase/schema.sql` changes (a new table or column), run the change on the test project too,
  as on the clinic's, or the tests that use it fail:
  `npx supabase db query --linked --project-ref prdobgcyvecxqzqjhsip --file supabase/<change>.sql`
  (test data only, so no need to pause the website first).
- The build machine can run the same tests against the same test project: put its URL and key in
  `.env.local` and the login in `.env.test.local`.
