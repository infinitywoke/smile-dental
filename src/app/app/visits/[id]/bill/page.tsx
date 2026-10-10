import { redirect } from 'next/navigation'

export default async function BillPage({ params }: PageProps<'/app/visits/[id]/bill'>) {
  const { id } = await params
  redirect(`/app/visits/${id}?step=bill`)
}
