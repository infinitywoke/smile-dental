# Smile Dental: website + Clinic OS

One Next.js app with two parts:
- **Public website**: `src/app/(public)/`, components in `src/components/site/`. Clinic details, treatments and the price list live in `src/config/site.ts`, which the Clinic OS also uses.
- **Clinic OS**: `src/app/app/` (served at `/app`). A simple, phone-first app for one user, Dr. Rahil. Sign-in is email + password through Supabase (Google may be added later). Only the account in `ALLOWED_EMAIL` is allowed in.

**The simplification build** (plan: [docs/SIMPLIFY.md](docs/SIMPLIFY.md); log: [docs/BUILD_LOG.md](docs/BUILD_LOG.md)) produced the current app. Read the log before changing anything big.

**Before any Clinic OS feature work, read [docs/PRODUCT.md](docs/PRODUCT.md)** (what the app is, the six screens and the decisions behind them) **and [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)** (status and what is left). The whole database is `supabase/schema.sql`.

## Rules
- **Auth:** call `getDoctor()` from `src/lib/auth.ts` in every Clinic OS page, server action and route handler before touching data. `src/proxy.ts` only refreshes the session and does an early redirect; don't rely on it alone.
- **Cache Components is on.** Session reads (`cookies()`, `getDoctor()`) must render inside `<Suspense>`. `new Date()` in a Server Component needs `'use cache'` or a dynamic access before it.
- **Data access stays on the server.** Never expose the Supabase secret or service-role key to the client.
- **Keep it simple.** Optimise for fast data entry on a phone (dictation, photos, one-tap actions) over feature breadth.

## Agents: roles, models and effort (owner decision, 2026-10-11)
One orchestrator, a few specialists. When delegating, set the agent's model and effort from this table.

| Role | Model | Effort | Used for |
|---|---|---|---|
| **Orchestrator and strategist** | Claude Opus 5.5 (the main session) | max | Strategy, priorities, briefs for builders, integration, final checks, talking to the owner |
| **Fresh-eyes reviewer** (one per wave) | Claude Opus 5.5 | max for a strategy, high for a wave review | Reviews the app as a first-time user would; never sees the orchestrator's reasoning |
| **Builders** (at most 2 at a time, each in its own worktree) | Claude Sonnet 5.5 | medium | Well-specified changes from a written brief |
| **Lookups and log summaries** | Claude Haiku 5.5 | low | Searches, reading code, summarising test output |

- **Max effort is only for the orchestrator and strategy work.** Everything routine runs on the cheapest model that does the job.
- **No Gemini (or any other outside AI) for development work.** Never send patient data or database exports to any AI service outside the app. Code and docs only.
- Prefer doing small jobs directly over spawning agents. Install packages once, before creating worktrees. Push the base commit before creating worktrees.
- Automated checks (`npm test`, `npm run build`, `npm run lint`, `npm run test:e2e`) cost no AI quota: run them instead of asking a model to verify.
- **Not in daily use yet** (owner, 2026-10-11): changes may be bold, including breaking ones. Once Dr. Rahil starts using it, work on a branch and deploy after clinic hours (after 7:30 PM IST).
- **Primary device: Android phones** (owner tests on a OnePlus 13, Chrome). Design and test for Android Chrome first: the system Back gesture, the on-screen keyboard, thumb reach.
- Start a fresh session per task; the context lives in `docs/` and memory, not in chat history.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
