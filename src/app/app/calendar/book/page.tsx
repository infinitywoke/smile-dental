import { Suspense } from 'react'
import Form from 'next/form'
import { notFound } from 'next/navigation'
import { searchPatients } from '@/lib/data/patients'
import { ageOn } from '@/lib/dates'
import { ALL_BLOCKS, blockEnd, formatBlock, formatDay, inIndia, isClosedDay } from '@/lib/schedule'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { BookAppointment } from '@/components/clinic/BookAppointment'
import { BlockThisTimeButton } from '@/components/clinic/CalendarActions'

async function BookContent({ searchParams }: PageProps<'/app/calendar/book'>) {
  const { at, q } = await searchParams
  const start = typeof at === 'string' ? new Date(at) : null
  if (!start || Number.isNaN(start.getTime())) notFound()
  const { date, time } = inIndia(start)
  if (isClosedDay(date) || !ALL_BLOCKS.includes(time)) notFound()

  const query = typeof q === 'string' ? q : ''
  const patients = await searchPatients(query)
  const backTo = `/app/calendar?d=${date}`
  const when = `${formatDay(date)}, ${formatBlock(time)} – ${formatBlock(blockEnd(time))}`

  return (
    <div className="space-y-5">
      <BackLink href={backTo} label="Calendar" />
      <div>
        <p className="text-sm font-medium text-gray-500">Book a patient</p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{when}</h1>
      </div>

      <Form action="/app/calendar/book" className="flex gap-2">
        <input type="hidden" name="at" value={start.toISOString()} />
        <input name="q" type="search" defaultValue={query} placeholder="Search name or phone"
          className="block w-full rounded-full border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600" />
        <button type="submit" className="rounded-full bg-gray-900 px-5 text-sm font-semibold text-white">Search</button>
      </Form>

      <BookAppointment
        key={query}
        startsAt={start.toISOString()}
        when={when}
        backTo={backTo}
        patients={patients.map((p) => ({ id: p.id, name: p.name, phone: p.phone, isTest: p.is_test, age: p.date_of_birth ? ageOn(p.date_of_birth) : null }))}
      />

      <BlockThisTimeButton startsAt={start.toISOString()} backTo={backTo} />
    </div>
  )
}

export default function BookPage(props: PageProps<'/app/calendar/book'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <BookContent {...props} />
    </Suspense>
  )
}
