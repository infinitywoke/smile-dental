import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, Camera, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { getVisitsOn } from '@/lib/data/visits'
import { getDues, type Due } from '@/lib/data/dues'
import { getAppointmentsOn, getDaySchedule, getPendingRequests } from '@/lib/data/appointments'
import { formatDate, todayInIndia } from '@/lib/dates'
import { patientAge } from '@/lib/patient-fields'
import { DEFAULT_LENGTH, addDays, formatDay, formatTimeOf, formatWhen, inIndia, lengthLabel } from '@/lib/schedule'
import { formatRupees } from '@/lib/pricing'
import { ScreenLoading } from '@/components/clinic/ui'
import { RequestCard } from '@/components/clinic/RequestCard'
import { SlotGrid } from '@/components/clinic/SlotGrid'
import { DayOffButton } from '@/components/clinic/CalendarActions'
import { VisitStatusBadge } from '@/components/clinic/VisitStatusBadge'
import { StartVisitButton } from '@/components/clinic/StartVisitButton'
import { genderLabel } from '@/lib/gender'
import { noteWithoutCallBack, wantsCallBack } from '@/lib/booking-contact'
import { getMissed, getRecalls, getReminders, type Missed, type Recall } from '@/lib/data/follow-ups'
import { DidntComeButton, MissedList, RecallCard, RemindersCard } from '@/components/clinic/FollowUps'
import { UndoProvider } from '@/components/clinic/UndoBar'
import { getMoneyOn } from '@/lib/data/tally'
import { messageLanguage, missedMessage, recallMessage, reminderMessage, whatsappLink } from '@/lib/whatsapp'
import { openStatus } from '@/lib/clinic-hours'
import { nextAppointment } from '@/lib/next-patient'
import { getBookingPause } from '@/lib/actions/booking'
import { pauseText } from '@/lib/booking-pause'
import { ClinicStatus, MoneyPill } from '@/components/clinic/TodayStatus'
import { NextPatient } from '@/components/clinic/NextPatient'
import { DayPicker } from '@/components/clinic/DayPicker'
import { KeepCopies } from '@/components/clinic/OfflineCopies'
import { HolidayNote } from '@/components/clinic/HolidayNote'
import { AppBadge } from '@/components/clinic/AppBadge'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DUES_SHOWN = 5
const RECALLS_SHOWN = 10

// Today is the day sheet, quiet unless something needs him (the Quiet Cockpit): whether the clinic is
// open, what needs a decision, everyone on the day in one list, and the next patient docked at the thumb.
async function TodayContent({ searchParams }: PageProps<'/app'>) {
  // The session check comes first: it makes this screen request-time before the date is read
  await getDoctor()
  const { d, free } = await searchParams
  const today = todayInIndia()
  const date = typeof d === 'string' && DATE.test(d) ? d : today
  const isToday = date === today

  const [schedule, appointments, visits, requests, dues, reminders, missed, recalls, money, pause] = await Promise.all([
    getDaySchedule(date),
    getAppointmentsOn(date),
    getVisitsOn(date),
    getPendingRequests(),
    // Everyone who owes, for the money pill's total; Needs you shows the first few
    isToday ? getDues(1000) : Promise.resolve([] as Due[]),
    isToday ? getReminders(today) : Promise.resolve(null),
    isToday ? getMissed() : Promise.resolve([] as Missed[]),
    isToday ? getRecalls(today) : Promise.resolve([] as Recall[]),
    isToday ? getMoneyOn(today) : Promise.resolve(null),
    isToday ? getBookingPause() : Promise.resolve(null),
  ])
  // A booked appointment whose time is over and that has no visit: the patient may not have come
  const now = new Date().getTime()
  const over = (startsAt: string, minutes: number) => new Date(startsAt).getTime() + minutes * 60_000 < now
  const reminderItems = (reminders?.items ?? []).map((r) => ({
    id: r.id, startsAt: r.starts_at, name: r.patient.name, patientId: r.patient.id, reminded: r.reminded,
    href: r.patient.phone ? whatsappLink(r.patient.phone, reminderMessage({ name: r.patient.name, startsAt: r.starts_at, tomorrow: reminders!.tomorrow, language: messageLanguage(r.patient.language) })) : null,
  }))
  const showReminders = reminderItems.some((r) => !r.reminded && r.href)
  const missedItems = missed.map((m) => ({
    id: m.id, startsAt: m.starts_at, name: m.patient.name, patientId: m.patient.id, phone: m.patient.phone,
    href: m.patient.phone ? whatsappLink(m.patient.phone, missedMessage({ name: m.patient.name, startsAt: m.starts_at, language: messageLanguage(m.patient.language) })) : null,
  }))
  const recallItems = recalls.slice(0, RECALLS_SHOWN).map((r) => ({
    patientId: r.id, name: r.name, lastVisit: r.lastVisit, recalledAt: r.recalledAt,
    href: whatsappLink(r.phone!, recallMessage({ name: r.name, lastVisit: r.lastVisit, language: messageLanguage(r.language) })),
  }))

  const poolBlocks = schedule.blocks.filter((b) => b.state === 'free' || b.state === 'blocked' || b.state === 'request')
  const freeCount = poolBlocks.filter((b) => b.state === 'free').length
  const freeSummary = schedule.closed ? 'Closed on Fridays' : schedule.dayOff ? 'Blocked off' : freeCount === 0 ? 'None left' : `${freeCount} free`

  // Money owed is a today thing: other days show only who is coming. A due is left out of Needs you
  // only when a row below already shows the whole amount (one money rule, src/lib/billing.ts).
  const showDues = dues
    .filter((due) => !visits.some((v) => v.patient.id === due.patientId && v.status.due === due.amount))
    .slice(0, DUES_SHOWN)

  // One list in time order. An appointment whose own visit is listed shows once, as the visit;
  // the patient's other bookings that day still show.
  const listed = new Set(visits.map((v) => v.id))
  const rows = [
    ...appointments
      .filter((a) => !a.visit_id || !listed.has(a.visit_id))
      .map((appointment) => ({ kind: 'booked' as const, at: new Date(appointment.starts_at).getTime(), appointment })),
    ...visits.map((visit) => ({ kind: 'seen' as const, at: new Date(visit.created_at).getTime(), visit })),
  ].sort((x, y) => x.at - y.at)

  // Today only: the clinic's state, the money (hidden until tapped) and the next patient
  const at = new Date(now)
  const booked = rows.flatMap((row) => (row.kind === 'booked' ? [row.appointment] : []))
  const next = isToday ? nextAppointment(booked, at) : null
  const later = booked
    .filter((a) => new Date(a.starts_at).getTime() > now && a.patient.phone)
    .map((a) => ({ id: a.id, name: a.patient.name, startsAt: a.starts_at, phone: a.patient.phone!, language: messageLanguage(a.patient.language) }))
  const website = pause?.ready ? { paused: pause.until !== null, text: pauseText(pause.until, at) } : null
  const needsYou = requests.length > 0 || showDues.length > 0 || missedItems.length > 0

  return (
    <UndoProvider>
    <div className="space-y-6">
      {/* The app icon's number: requests waiting for a decision */}
      <AppBadge count={requests.length} />
      {/* Each visit and patient on today's list, and each bill to collect, opens with no signal too */}
      {isToday && (
        <KeepCopies urls={[
          ...rows.map((row) => (row.kind === 'seen' ? `/app/visits/${row.visit.id}` : `/app/patients/${row.appointment.patient_id}`)),
          ...showDues.map((due) => `/app/visits/${due.visitId}`),
        ]} />
      )}

      {/* The day's name, its date (a tap shows the next two weeks) and the arrows */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{isToday ? 'Today' : formatDay(date)}</h1>
            <DayPicker label={isToday ? formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Pick a day'} date={date} today={today} />
            <HolidayNote date={date} />
          </div>
          <div className="-mr-2 flex shrink-0">
            <Link href={`/app?d=${addDays(date, -1)}`} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Previous day">
              <ChevronLeft className="h-6 w-6" />
            </Link>
            <Link href={`/app?d=${addDays(date, 1)}`} className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="Next day">
              <ChevronRight className="h-6 w-6" />
            </Link>
          </div>
        </div>
        {isToday && (
          <div className="flex flex-col items-start gap-2">
            <ClinicStatus status={openStatus(at)} website={website} />
            <div className="flex w-full items-center gap-2">
              {rows.length > 0 && (
                <span className="flex min-h-10 items-center gap-1 rounded-full bg-gray-100 px-3 text-[13px] font-bold text-gray-900">
                  <span className="hud-mono">{visits.length}/{rows.length}</span> seen
                </span>
              )}
              <MoneyPill collected={(money?.cash ?? 0) + (money?.upi ?? 0)} owed={dues.reduce((total, due) => total + due.amount, 0)} />
            </div>
          </div>
        )}
      </div>

      {/* What needs a decision: shown only when something does */}
      {needsYou && (
        <section id="needs-you" aria-label="Needs you" className="scroll-mt-4 space-y-2">
          <h2 className="hud-heading">Needs you</h2>
          {requests.map((request) => {
            const wanted = request.requested_start ? inIndia(request.requested_start) : null
            const age = patientAge(request)
            return (
              <RequestCard
                key={request.id}
                id={request.id}
                name={request.name}
                whenLabel={request.requested_start ? formatWhen(request.requested_start) : null}
                reason={request.reason}
                alerts={request.medical_alerts}
                canConfirm={request.confirmable}
                notice={request.notice}
                callBack={wantsCallBack(request.notes)}
                phone={request.phone}
                voiceUrl={request.voice_url}
                voiceVariant={request.voice_variant}
                otherTimeHref={`/app/requests/${request.id}${wanted ? `?d=${wanted.date >= today ? wanted.date : today}` : ''}`}
                details={{
                  age: [age !== null && `${age} yrs`, genderLabel(request.gender)].filter(Boolean).join(' · ') || null,
                  address: request.address || null,
                  heardFrom: request.heard_from,
                  notes: noteWithoutCallBack(request.notes),
                }}
              />
            )
          })}
          {showDues.map((due) => (
            <Link key={due.patientId} href={`/app/visits/${due.visitId}?step=bill`}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-amber-200 hover:ring-amber-300">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-semibold text-gray-900">{due.patientName}</span>
                <span className="hud-mono block text-sm font-semibold text-amber-800">{formatRupees(due.amount)} due</span>
              </span>
              <span className="flex min-h-11 items-center rounded-xl bg-blue-600 px-4 text-base font-bold text-white">Collect</span>
            </Link>
          ))}
          <MissedList items={missedItems} />
        </section>
      )}

      {/* Everyone on this day, in time order: booked, in the chair, finished */}
      <section aria-labelledby="schedule-heading" className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="schedule-heading" className="hud-heading">{rows.length === 0 ? `No patients ${isToday ? 'today' : 'this day'}` : 'Schedule'}</h2>
          {/* Today says it once, in 'seen' above */}
          {rows.length > 0 && !isToday && <span className="text-[13px] font-semibold text-gray-500">{rows.length} {rows.length === 1 ? 'patient' : 'patients'}</span>}
        </div>
        {rows.length > 0 && (
          <ul aria-label="Schedule" className="divide-y divide-gray-100 overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200">
            {rows.map((row) =>
              row.kind === 'booked' ? (
                <li key={`a-${row.appointment.id}`} className="flex items-center gap-2 py-1.5 pr-2 pl-4">
                  <Link href={`/app/patients/${row.appointment.patient_id}`} className="flex min-h-12 min-w-0 flex-1 flex-col justify-center">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-base font-semibold text-gray-900">{row.appointment.patient.name}</span>
                      {row.appointment.patient.medical_alerts && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
                    </span>
                    <span className="truncate text-sm text-gray-500">
                      <span className="hud-mono font-semibold text-gray-900">{formatTimeOf(row.appointment.starts_at)}</span>
                      {[row.appointment.reason, row.appointment.duration_min !== DEFAULT_LENGTH && lengthLabel(row.appointment.duration_min)].filter(Boolean).map((part) => ` · ${part}`).join('')}
                    </span>
                  </Link>
                  {/* Start (today), and once the time is over, "Didn't come" under it */}
                  {(isToday || over(row.appointment.starts_at, row.appointment.duration_min)) && (
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {isToday && (
                        <StartVisitButton patientId={row.appointment.patient_id} appointmentId={row.appointment.id} label="Start"
                          className="flex min-h-11 min-w-16 items-center justify-center rounded-xl px-4 text-sm font-bold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-70" />
                      )}
                      {over(row.appointment.starts_at, row.appointment.duration_min) && (
                        <DidntComeButton appointmentId={row.appointment.id} name={row.appointment.patient.name} />
                      )}
                    </div>
                  )}
                </li>
              ) : (
                <li key={`v-${row.visit.id}`}>
                  <Link href={`/app/visits/${row.visit.id}`} className="block min-h-14 px-4 py-3 hover:bg-gray-50">
                    {/* The whole name on its own line; the time and the badges under it */}
                    <p className="flex items-start gap-2">
                      <span className="min-w-0 text-base font-semibold break-words text-gray-900">{row.visit.patient.name}</span>
                      {row.visit.patient.medical_alerts && <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="hud-mono text-sm font-semibold text-gray-900">
                        {formatTimeOf(row.visit.created_at)}
                      </span>
                      <VisitStatusBadge status={row.visit.status} />
                      {row.visit.photo_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                          <Camera className="h-3.5 w-3.5" aria-hidden="true" /> {row.visit.photo_count} photo{row.visit.photo_count === 1 ? '' : 's'}
                        </span>
                      )}
                    </p>
                  </Link>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {/* WhatsApp to send today: tomorrow's reminders and check-ups, folded until opened */}
      {(showReminders || recallItems.length > 0) && (
        <section aria-label="To send" className="space-y-2">
          {showReminders && <RemindersCard dayLabel={reminders!.tomorrow ? 'tomorrow' : formatDay(reminders!.date).split(',')[0]} items={reminderItems} />}
          {recallItems.length > 0 && <RecallCard items={recallItems} />}
        </section>
      )}

      {/* Free times: folded on today (booking from here is the rare job), open on other days */}
      <details id="free-times" open={!isToday || free === '1'} className="group scroll-mt-4 rounded-2xl bg-white ring-1 ring-gray-200">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-base font-semibold text-gray-900">
          <span className="flex-1">Free times</span>
          <span className="text-sm font-semibold text-gray-500">{freeSummary}</span>
          <ChevronDown className="h-5 w-5 text-gray-400 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-3 px-4 pb-4">
          {schedule.closed ? (
            <p className="rounded-xl bg-gray-100 p-4 text-center text-sm font-medium text-gray-600">The clinic is closed on Fridays.</p>
          ) : (
            <>
              {schedule.dayOff && <p className="rounded-xl bg-gray-100 p-3 text-center text-sm font-medium text-gray-600">This day is blocked off.</p>}
              {poolBlocks.length === 0 ? (
                <p className="text-sm text-gray-500">Nothing free left{isToday ? ' today' : ''}.</p>
              ) : (
                <SlotGrid
                  blocks={poolBlocks}
                  hrefs={Object.fromEntries(
                    poolBlocks.map((b) => [
                      b.instant,
                      b.state === 'request' ? `/app/requests/${b.requestId}?d=${date}` : `/app/book?at=${encodeURIComponent(b.instant)}`,
                    ]),
                  )}
                />
              )}
              <DayOffButton date={date} dayOff={schedule.dayOff} />
            </>
          )}
        </div>
      </details>

      {/* Room at the foot of the page for the next patient's card */}
      {next && <div className="h-52" aria-hidden="true" />}
      {next && (
        <NextPatient
          next={{
            appointmentId: next.id,
            patientId: next.patient_id,
            name: next.patient.name,
            startsAt: next.starts_at,
            detail: [next.reason, lengthLabel(next.duration_min)].filter(Boolean).join(' · '),
            alert: Boolean(next.patient.medical_alerts),
          }}
          later={later}
        />
      )}
    </div>
    </UndoProvider>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function TodayPage(props: PageProps<'/app'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <TodayContent {...props} />
    </Suspense>
  )
}
