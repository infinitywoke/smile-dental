# Builder briefs: shared rules

Every builder gets one brief file from this folder plus these rules. The plan behind every brief is [../SIMPLIFY.md](../SIMPLIFY.md) (change IDs C1–C27, decisions D1–D5); progress is in [../BUILD_LOG.md](../BUILD_LOG.md).

## Setting up (you start in your own git worktree)
1. `npm ci` (packages are not shared between worktrees).
2. Copy the two local settings files from the main folder; never print, log or commit their contents:
   `cp "D:/AG Projects/New Smile/smile-dental-website/.env.local" .` and the same for `.env.test.local`.
3. Read `AGENTS.md`, the parts of `docs/SIMPLIFY.md` your brief names, then your brief.

## Rules
- **Edit only the files your brief lists.** Another builder may be editing other files at the same time. If you truly need a change elsewhere, keep the existing names and inputs of shared functions, make the smallest possible change, and say so in your report.
- **No database changes.** The orchestrator owns `supabase/**`. If you need a column or function that does not exist, stop and report it.
- **No new packages**, and do not edit `package.json` or `package-lock.json`.
- **Keep it simple.** One user, an Android phone, plain English on screen, as few taps, screens, fields and words as possible. Prefer removing to adding.
- **Android first** (OnePlus 13, Chrome): every tappable thing at least 48 dp (Tailwind `h-12`/`min-h-12`, or padding that gets there); text inputs 16 px (`text-base`); the right keyboard (`type="tel"` for phones, `inputMode="numeric"` / `"decimal"` for ages and amounts); anything that pops up (a sheet, a QR, a picker, a menu) closes with the system Back gesture by adding a history entry when it opens and closing on `popstate` (copy `src/components/clinic/PhotoGallery.tsx`); after creating something, navigate with replace so Back never returns to a form that would create it again.
- **This Next.js (16.4) differs from what you know.** Read the guide in `node_modules/next/dist/docs/` before using an API. In this repo:
  - Cache Components is on. Session reads (`cookies()`, `getDoctor()`) render inside `<Suspense>`. Call `await getDoctor()` (it calls `connection()`) before any `new Date()` / `Date.now()`; never call either during render (lint rule `react-hooks/purity`).
  - Never pass functions from a Server Component to a Client Component; pass data or URLs (`hrefs`) instead.
  - A prop named `ref` trips the `react-hooks/refs` lint rule; use `handle`.
  - An async component that only redirects returns `Promise<null>` (`return null` after `redirect`) and is wrapped in `<Suspense>`.
  - After adding or removing a route, run `npx next typegen`; if type errors mention removed routes, delete `.next/dev/types`.
  - Every Clinic OS page, server action and route handler calls `getDoctor()` first. After a change, `revalidatePath('/app', 'layout')` (the existing pattern).
  - Next keeps recently visited screens mounted but hidden; in end-to-end tests always match visible elements (`visible()` in `e2e/helpers.ts`).
- **Tests.** Update the end-to-end spec file your brief names to the new behaviour, and the unit tests beside the files you change. Every name a spec creates must start with its `runId` (so `cleanRun(runId)` removes it). Use the helpers in `e2e/helpers.ts` (`signIn`, `createPatient`, `createAppointment`, `makeRequest`, `captureWhatsapp`, `cleanRun`). Never call `cleanTestAccount()` from a spec.

## Before you finish (all must pass)
```
npx tsc --noEmit
npm test
npm run lint
npm run build
E2E_PORT=<your port> npx playwright test e2e/<your spec>.spec.ts
```
Then commit everything on your worktree branch (`git add -A && git commit`), with a message that ends with the line
`Co-Authored-By: Claude <model name> <noreply@anthropic.com>` using your model's name. Do not push and do not merge.

## Your report (your final message)
At most 30 lines: what you built (by change ID), files changed, anything you could not do or changed outside your list (and why), gate results, and anything the orchestrator or owner must do.
