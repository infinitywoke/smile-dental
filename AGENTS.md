# Smile Dental: website + Clinic OS

One Next.js app with two parts:
- **Public website**: `src/app/(public)/`, components in `src/components/site/`. Clinic details, treatments and the price list live in `src/config/site.ts`, which the Clinic OS also uses.
- **Clinic OS**: `src/app/app/` (served at `/app`). A simple, phone-first app for one user, Dr. Rahil. Sign-in is email + password through Supabase (Google may be added later). Only the account in `ALLOWED_EMAIL` is allowed in.

## Rules
- **Auth:** call `getDoctor()` from `src/lib/auth.ts` in every Clinic OS page, server action and route handler before touching data. `src/proxy.ts` only refreshes the session and does an early redirect; don't rely on it alone.
- **Cache Components is on.** Session reads (`cookies()`, `getDoctor()`) must render inside `<Suspense>`. `new Date()` in a Server Component needs `'use cache'` or a dynamic access before it.
- **Data access stays on the server.** Never expose the Supabase secret or service-role key to the client.
- **Keep it simple.** Optimise for fast data entry on a phone (dictation, photos, one-tap actions) over feature breadth.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
