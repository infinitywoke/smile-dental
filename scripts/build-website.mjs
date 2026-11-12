// Builds the clinic's website on its own, for Cloudflare Workers (docs/build/CLOUDFLARE.md). Cloudflare runs it as
// the build command (`npm run build:website`); on this computer it is the first half of `npm run preview:website`.
// - Clinic OS stays on Vercel, so its pages, sign-in, patients' links, API and proxy are set aside for the build:
//   Next.js skips folders whose names start with "_", and a proxy file by another name. They are put back after,
//   and before, in case a build was stopped half-way. The Worker then holds the website only, well inside
//   Cloudflare's free size limit.
// - NEXT_PUBLIC_WEBSITE_ONLY=1: Clinic OS's paths go to Clinic OS's address, and the booking card sends its
//   requests to Clinic OS's Booking API (src/config/deployment.ts).
// - OpenNext turns the Next.js build into a Worker (.open-next).
// - Next.js's own files never change, so browsers keep them for a year (Cloudflare reads _headers).
import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, writeFileSync } from 'node:fs'

const CLINIC_OS = ['src/app/app', 'src/app/login', 'src/app/auth', 'src/app/r', 'src/app/api', 'src/proxy.ts']
const aside = (path) => path.replace(/[^/]+$/, (name) => `_website-only-${name}`)

function putBack() {
  for (const path of CLINIC_OS) {
    if (existsSync(aside(path)) && !existsSync(path)) renameSync(aside(path), path)
  }
}

putBack()
let status = 1
try {
  for (const path of CLINIC_OS) renameSync(path, aside(path))
  status = spawnSync('npx opennextjs-cloudflare build', {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NEXT_PUBLIC_WEBSITE_ONLY: '1' },
  }).status ?? 1
} finally {
  putBack()
}
if (status !== 0) process.exit(status)

writeFileSync('.open-next/assets/_headers', '/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n')
