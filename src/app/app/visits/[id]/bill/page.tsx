import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { ScreenLoading } from '@/components/clinic/ui'

// The bill is step 2 of the visit; old links open it there
async function BillRedirect({ params }: PageProps<'/app/visits/[id]/bill'>): Promise<null> {
  const { id } = await params
  redirect(`/app/visits/${id}?step=bill`)
  return null
}

export default function BillPage(props: PageProps<'/app/visits/[id]/bill'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <BillRedirect {...props} />
    </Suspense>
  )
}
