import { Suspense } from 'react'
import { defaultTallySettings, getLedgerPatients, getTallyOverview, getTallySettings } from '@/lib/data/tally'
import { ScreenLoading } from '@/components/clinic/ui'
import { TallyPanel } from '@/components/clinic/TallyPanel'

async function TallyContent() {
  const settings = (await getTallySettings()) ?? defaultTallySettings
  const [overview, ledgers] = await Promise.all([getTallyOverview(settings), getLedgerPatients()])
  return <TallyPanel settings={settings} overview={overview} ledgers={{ matched: ledgers.matched, unmatched: ledgers.unmatched.length }} />
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function TallyPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <TallyContent />
    </Suspense>
  )
}
