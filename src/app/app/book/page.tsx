import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getPatient, searchPatients } from '@/lib/data/patients'
import { getDaySchedule, type DaySchedule } from '@/lib/data/appointments'
import { todayInIndia } from '@/lib/dates'
import { patientAge } from '@/lib/patient-fields'
import { ALL_BLOCKS, DEFAULT_LENGTH, addDays, clinicStartOf, endOf, formatBlock, formatDay, formatWhen, lengthFrom, lengthLabel } from '@/lib/schedule'
import { WhenPicker } from '@/components/clinic/WhenPicker'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'
import { BookAppointment } from '@/components/clinic/BookAppointment'
import { BlockThisTimeButton, DayOffButton, UnblockButton } from '@/components/clinic/CalendarActions'
import { SlotGrid } from '@/components/clinic/SlotGrid'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// How far ahead the page looks for a day with a free time when today has none
const MAX_DAYS_AHEAD = 14

const hasFreeTime = (schedule: DaySchedule) => !schedule.closed && !schedule.dayOff && schedule.blocks.some((b) => b.state === 'free')

// Book by phone. Step 1: pick a free time. Step 2: type to find the patient (or add a new one), then Book.
async function BookContent({ searchParams }: PageProps<'/app/book'>) {
  await getDoctor()
  const { at, d, patient: patientParam, len } = await searchParams
  // How long the appointment is (30 minutes unless chosen)
  const minutes = lengthFrom(len)
  const withLength = minutes === DEFAULT_LENGTH ? '' : `&len=${minutes}`
  // Booking for a patient already known (from their page)
  const known = typeof patientParam === 'string' && UUID.test(patientParam) ? await getPatient(patientParam) : null
  const withPatient = known ? `&patient=${known.id}` : ''

  // ---- Step 2: who is it for? ----
  if (typeof at === 'string') {
    const slot = clinicStartOf(at, minutes)
    if (!slot) notFound()
    const start = new Date(slot.iso)
    const { date, time } = slot

    const schedule = await getDaySchedule(date, minutes)
    const block = schedule.blocks.find((b) => b.time === time)
    const when = `${formatWhen(start)} – ${formatBlock(endOf(time, minutes))} (${lengthLabel(minutes)})`
    const backTo = `/app?d=${date}`

    // Shown instead of the form while the time is taken. The panel itself stays mounted, so a
    // booking just made here still shows "Booked" after the page refreshes.
    // Inside a closed day, Reopen reopens the day (reopening one time there would change nothing).
    const notice =
      block && block.state === 'blocked' ? (
        <div className="space-y-3 rounded-2xl bg-gray-100 p-4">
          <p className="text-sm text-gray-700">
            {schedule.dayOff ? 'This whole day is closed.' : `This time is blocked off${block.note ? ` (${block.note})` : ''}.`}
          </p>
          {schedule.dayOff ? <DayOffButton date={date} dayOff reopenLabel="Reopen the day" /> : <UnblockButton instant={block.instant} />}
        </div>
      ) : block && (block.state === 'booked' || block.state === 'request') ? (
        <p className="rounded-2xl bg-gray-100 p-4 text-sm text-gray-700">
          This time is already {block.state === 'booked' ? `booked for ${block.patientName}` : 'asked for by a website request'}.{' '}
          <Link href={backTo} className="inline-flex min-h-12 items-center font-semibold text-blue-700">Back</Link>
        </p>
      ) : null

    const patients = known || notice ? [] : (await searchPatients('')).slice(0, 8)

    return (
      <div className="space-y-5">
        <BackLink href={`/app/book?d=${date}${withPatient}${withLength}`} label="Pick another time" />
        <div>
          <p className="text-sm font-medium text-gray-500">{known ? `Book ${known.name}` : 'Book a patient'}</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{when}</h1>
        </div>

        <BookAppointment
          startsAt={start.toISOString()}
          when={when}
          backTo={known ? `/app/patients/${known.id}` : backTo}
          backLabel={known ? known.name : 'Today'}
          only={known ? { id: known.id, name: known.name } : undefined}
          notice={notice}
          minutes={minutes}
          patients={patients.map((p) => ({ id: p.id, name: p.name, phone: p.phone, age: patientAge(p) }))}
        />

        {!known && !notice && ALL_BLOCKS.includes(time) && <BlockThisTimeButton startsAt={start.toISOString()} backTo={backTo} />}
      </div>
    )
  }

  // ---- Step 1: pick a time ----
  const today = todayInIndia()
  const chosen = typeof d === 'string' && DATE.test(d) && d >= today ? d : null
  let date = chosen ?? today
  let schedule = await getDaySchedule(date, minutes)
  // No day chosen and nothing left to book today (late, full or closed): open the next day with a free time
  const skippedToday = !chosen && !hasFreeTime(schedule)
  for (let i = 0; i < MAX_DAYS_AHEAD && !chosen && !hasFreeTime(schedule); i++) {
    date = addDays(date, 1)
    schedule = await getDaySchedule(date, minutes)
  }
  // A day he moved to himself that has nothing left: say so, with a big way on
  const nothingLeft = !schedule.closed && !schedule.blocks.some((b) => b.state === 'free' || b.state === 'blocked')
  const nextDayHref = `/app/book?d=${addDays(date, 1)}${withPatient}${withLength}`

  return (
    <div className="space-y-5">
      <BackLink href={known ? `/app/patients/${known.id}` : '/app'} label={known ? known.name : 'Today'} />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">{known ? `Book ${known.name}` : 'Book an appointment'}</h1>

      <WhenPicker
        length={minutes}
        lengthLink={{ path: `/app/book?d=${date}${withPatient}`, defaultLength: DEFAULT_LENGTH }}
        day={date === today ? `Today, ${formatDay(date)}` : formatDay(date)}
        prev={date > today ? { href: `/app/book?d=${addDays(date, -1)}${withPatient}${withLength}` } : null}
        next={schedule.closed || nothingLeft ? null : { href: nextDayHref }}
      >
      {skippedToday && date !== today && (
        <p className="rounded-xl bg-blue-50 p-3 text-center text-sm font-medium text-blue-900">No times left today.</p>
      )}

      {schedule.closed || nothingLeft ? (
        <div className="space-y-3 rounded-xl bg-gray-100 p-4 text-center">
          <p className="text-base font-medium text-gray-700">
            {schedule.closed ? 'The clinic is closed on Fridays.' : date === today ? 'No times left today.' : 'No times left on this day.'}
          </p>
          <Link href={nextDayHref}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-lg font-semibold text-white shadow-sm hover:bg-blue-700">
            Next day <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <SlotGrid
          blocks={schedule.blocks.filter((b) => b.state !== 'past')}
          hrefs={Object.fromEntries(
            schedule.blocks
              .filter((b) => b.state === 'free' || b.state === 'blocked')
              .map((b) => [b.instant, `/app/book?at=${encodeURIComponent(b.instant)}${withPatient}${withLength}`]),
          )}
        />
      )}
      </WhenPicker>
    </div>
  )
}

export default function BookPage(props: PageProps<'/app/book'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <BookContent {...props} />
    </Suspense>
  )
}
