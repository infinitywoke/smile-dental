import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

// The clinic's website on Cloudflare (scripts/build-website.mjs; Clinic OS stays on Vercel). Its pages are built
// ahead and read from the deployment's own files: the free times are fetched for every visit, and the price list
// is the one at the last deploy (deploying again brings in a new one).
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
})
