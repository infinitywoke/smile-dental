import { Suspense } from 'react'
import { getTallyOverview, getTallySettings } from '@/lib/data/tally'
import { ScreenLoading } from '@/components/clinic/ui'
import { TallyPanel } from '@/components/clinic/TallyPanel'

async function TallyContent() {
  const settings = await getTallySettings()
  const overview = await getTallyOverview(settings)
  return <TallyPanel settings={settings} overview={overview} />
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function TallyPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <TallyContent />
    </Suspense>
  )
}
