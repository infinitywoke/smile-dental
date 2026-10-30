import { Suspense } from 'react'
import { getClinic } from '@/lib/data/clinic'
import { defaultTallySettings, getLedgerPatients, getTallyOverview, getTallySettings } from '@/lib/data/tally'
import { ScreenLoading } from '@/components/clinic/ui'
import { TallyPanel } from '@/components/clinic/TallyPanel'

async function TallyContent() {
  const [{ clinic }, saved] = await Promise.all([getClinic(), getTallySettings()])
  const settings = saved ?? defaultTallySettings(clinic.tally)
  const [overview, ledgers] = await Promise.all([getTallyOverview(settings), getLedgerPatients()])
  return <TallyPanel settings={settings} overview={overview} ledgers={{ matched: ledgers.matched, unmatched: ledgers.unmatched.length }} tally={clinic.tally} place={clinic.place} />
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function TallyPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <TallyContent />
    </Suspense>
  )
}
