# Smile Dental: website + Clinic OS

One Next.js app with two parts:
- **Public website**: `src/app/(public)/`, components in `src/components/site/`. Clinic details, treatments and the price list live in `src/config/site.ts`, which the Clinic OS also uses.
- **Clinic OS**: `src/app/app/` (served at `/app`). A simple, phone-first app for one user, Dr. Rahil. Sign-in is email + password through Supabase (Google may be added later). Only the account in `ALLOWED_EMAIL` is allowed in.

**Before any Clinic OS feature work, read [docs/PRODUCT.md](docs/PRODUCT.md)** (what we're building and the decisions behind it) **and [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)** (status, remaining work, data model contract, agent roles and file ownership).

## Rules
- **Auth:** call `getDoctor()` from `src/lib/auth.ts` in every Clinic OS page, server action and route handler before touching data. `src/proxy.ts` only refreshes the session and does an early redirect; don't rely on it alone.
- **Cache Components is on.** Session reads (`cookies()`, `getDoctor()`) must render inside `<Suspense>`. `new Date()` in a Server Component needs `'use cache'` or a dynamic access before it.
- **Data access stays on the server.** Never expose the Supabase secret or service-role key to the client.
- **Keep it simple.** Optimise for fast data entry on a phone (dictation, photos, one-tap actions) over feature breadth.

## Delegation: models and effort (owner-approved, 2026-10-10)
Match the model and effort to the task; never spend more than the task needs. When delegating to an agent, set its model and effort from this table:

| Task | Delegate to |
|---|---|
| Searches, lookups, reading code | Claude Haiku, effort low, or Gemini 3.8 Flash (`gemini -p`) |
| Running checks, summarising test or build logs | Gemini 3.8 Flash, or no AI at all (just run the script) |
| Routine code changes | Claude Sonnet, effort medium |
| Second-opinion code review | Gemini 3.1 Pro, effort High, or Claude Opus, effort medium (one review per wave) |
| Database / auth / security rules, AI prompt design | Claude Opus, effort high |

- **Gemini access (checked 2026-10-10):** Try using gemini since we are on Antigravity IDE, If unable to use, skip the Gemini rows and use the Claude option.
- Never use effort `max`, and never send patient data or database exports to any AI service outside the app (Gemini CLI included). Code and docs only.
- Prefer doing small jobs (under about an hour) directly over spawning agents. At most 1–2 parallel builders. Install packages once, before creating worktrees.
- Automated checks (`npm test`, `npm run build`, `npm run lint`, `npm run test:e2e`) cost no AI quota: run them instead of asking a model to verify.
- Start a fresh session per task; the context lives in `docs/` and memory, not in chat history.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
