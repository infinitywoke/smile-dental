# Rahil's website on Cloudflare

Clinic OS stays on Vercel, at https://smile-dental-hin3.vercel.app. The website (www.smiledentalkatapadi.com) moves to
Cloudflare Workers, built from the same GitHub repository.

## How it works
- **The website holds no keys.** The booking card fetches free times from Clinic OS's Booking API, and sends requests
  there, from the visitor's browser. The phone notifications go out from Clinic OS. The website's only settings are
  Supabase's public address and key, which every visitor's browser already has.
- **Its pages are built ahead.** The free times arrive in the browser within a second or so, behind "Loading free times…".
- **`npm run build:website`** (`scripts/build-website.mjs`) builds it:
    - it sets Clinic OS's pages aside for the build, so the Worker holds the website only (about 1.5 MB, half
      Cloudflare's free limit);
    - Clinic OS's addresses on the website send people to Clinic OS;
    - the address without `www` goes to the `www` one.
- **The price list** on the website is the one at the last deploy. Every push to `main` deploys again; after Rahil
  loads a new price list, a deploy brings it in (Cloudflare: the Worker's Deployments, or push any change).
- **Known gaps**, both from the Cloudflare adapter's open bugs (opennextjs-cloudflare issue 1349, pull request 1318):
    - a mistyped treatment address shows "not found" with status 200 rather than 404;
    - pages that are built ahead and finished on a visit don't work there, which is why the free times load in the
      browser.

## 1. Create the Worker and connect GitHub (owner, about 10 minutes)
1. Sign in at https://dash.cloudflare.com, with the account that holds smiledentalkatapadi.com.
2. Left menu: **Compute (Workers)** → **Workers & Pages** → **Create application** → **Import a repository**.
3. **Connect GitHub**, and allow Cloudflare **only the repository** `smile-dental` (not all repositories).
4. Pick the repository, then set:

| Setting | Value |
|---|---|
| Project name | `smile-dental-website` (must match `wrangler.jsonc`) |
| Production branch | `main` |
| Build command | `npm run build:website` |
| Deploy command | `npx opennextjs-cloudflare deploy` |
| Root directory | leave empty |

5. **Advanced settings → Build variables**, add two (the same values as in Vercel: the project's Settings →
   Environment Variables; or Supabase: Project Settings → API Keys):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://pmuecirfwmtsvojxleoq.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key (starts `sb_publishable_`) |

   Nothing else: no secrets, and no runtime variables.
6. **Create and deploy.** The first build takes about 5 minutes; its log is under the Worker's **Deployments**.
7. Open the Worker's `….workers.dev` address and send it to Claude, who checks it against the live site (every page,
   the booking card, the redirects).

A test booking lands in Rahil's Clinic OS for real. If you try one, use your own name and number, then decline it there.

## 2. Move the domain (owner, after the checks)
1. The Worker → **Settings → Domains & Routes → Add → Custom domain**: `www.smiledentalkatapadi.com`, then again
   `smiledentalkatapadi.com`.
2. If Cloudflare asks to remove the existing records first: they point at Vercel. Note their values first (the `www`
   CNAME is `ec3e0e0f4bb756f7.vercel-dns-017.com`), then remove them.
3. Within minutes the website answers from Cloudflare. Then in Vercel: the project → **Settings → Domains**, remove
   both domains. Clinic OS keeps its own address.

**To undo:** remove the two custom domains in Cloudflare, put the `www` CNAME back (proxy off), and add the domains
back in Vercel.

## Limits to watch
- **Free plan:** 100,000 requests a day, and 10 ms of CPU time per request. Pages built ahead stay well inside both.
  If the Worker's metrics show errors 1102 (CPU), Workers Paid ($5 a month) lifts the limits.
- **Images:** resized by Cloudflare Images, 5,000 different sizes a month on the free plan; this site uses a few dozen.

## On this computer
- `npm run preview:website` builds the website alone and serves it at http://localhost:8787, as Cloudflare would.
  OpenNext warns that Windows is not fully supported; Cloudflare builds on Linux.
- After it, `npm run build` (the full build) puts the route types back for `npx tsc`.
- `python scripts/compare-website.py <address>` compares a copy of the website (the preview, or the Worker's
  workers.dev address) with the live one, and `node scripts/check-booking.mjs <address>` books on it in a browser
  (the request is caught, so nothing is saved).

## The demo clinic's website
The same project type works for Brightside Dental: a second Worker from the same repository, with the build
variable `NEXT_PUBLIC_SITE=brightside` and `NEXT_PUBLIC_SITE_URL` set to its address, and its own project name, for
example `brightside-dental-demo`. Its `wrangler.jsonc` name would need to match. That needs a small change first
(a name per site), so ask Claude when the demo website is wanted.
