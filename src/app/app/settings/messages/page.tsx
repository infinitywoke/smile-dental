import { Fragment, Suspense } from 'react'
import { getDoctor } from '@/lib/auth'
import { siteConfig } from '@/config/site'
import { visitMessage } from '@/lib/billing'
import { todayInIndia } from '@/lib/dates'
import { addDays, blockInstant, isClosedDay } from '@/lib/schedule'
import {
  KANNADA_READY, cancelledMessage, confirmationMessage, declineMessage, missedMessage, movedMessage, recallMessage,
  reminderMessage, reviewMessage, runningLateMessage, type MessageLanguage,
} from '@/lib/whatsapp'
import { BackLink, ScreenLoading } from '@/components/clinic/ui'

// WhatsApp's *bold* and _italic_, as WhatsApp shows them
function Formatted({ text }: { text: string }) {
  return text.split('\n').map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line.split(/(\*[^*\n]+\*|_[^_\n]+_)/).map((part, j) =>
        /^\*.+\*$/.test(part) ? <strong key={j}>{part.slice(1, -1)}</strong>
          : /^_.+_$/.test(part) ? <em key={j}>{part.slice(1, -1)}</em>
            : part)}
    </Fragment>
  ))
}

// Every message a patient gets, with made-up details, in either language
function samples(language: MessageLanguage, day: string, earlier: string) {
  const name = 'Prakash Shetty'
  const startsAt = blockInstant(day, '18:00')
  return [
    { title: 'Appointment confirmed', text: confirmationMessage({ name, startsAt, language }) },
    { title: 'Appointment moved', text: movedMessage({ name, startsAt, language }) },
    { title: 'Appointment cancelled', text: cancelledMessage({ name, startsAt, language }) },
    { title: 'Reminder, the day before', text: reminderMessage({ name, startsAt, tomorrow: true, language }) },
    { title: 'Running late', text: runningLateMessage({ name, startsAt, minutes: 15, language }) },
    { title: "Didn't come", text: missedMessage({ name, startsAt: blockInstant(earlier, '10:00'), language }) },
    { title: 'After the visit: the bill and the next visit', text: visitMessage({
      patientName: name,
      visitDate: earlier,
      lines: [{ description: 'Consultation', amount: 200 }, { description: 'Scaling / Teeth Cleaning / Prophylaxis', amount: 1000 }],
      payments: [{ amount: 1000, method: 'upi' }],
      summary: { total: 1200, paid: 1000, balance: 200, earlier: 0, due: 200 },
      nextAppointment: { starts_at: startsAt },
      photos: [{ label: 'X-ray', url: `${siteConfig.url}/r/sample` }],
      language,
    }) },
    { title: 'Google review', text: reviewMessage({ name, language }) },
    { title: 'Six-month check-up', text: recallMessage({ name, lastVisit: addDays(earlier, -183), language }) },
    { title: "The time asked for can't be given", text: declineMessage({ name, language }) },
  ]
}

async function MessagesContent() {
  await getDoctor()
  const today = todayInIndia()
  let day = addDays(today, 1)
  while (isClosedDay(day)) day = addDays(day, 1)
  const kannada = samples('kn', day, addDays(today, -1))
  const english = samples('en', day, addDays(today, -1))
  return (
    <div className="space-y-5">
      <BackLink href="/app/settings" label="Settings" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Messages in Kannada</h1>
        <p className="mt-1 text-sm text-gray-600">
          {KANNADA_READY
            ? 'What a patient set to Kannada gets on WhatsApp, with made-up details.'
            : 'Not sent to any patient yet. This is what a patient who prefers Kannada would get on WhatsApp, with made-up details. If any words should change, note the message and the better words and pass them on; once they read right, Kannada can be turned on for those patients.'}
        </p>
      </div>
      {kannada.map((message, i) => (
        <section key={message.title} className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">{i + 1}. {message.title}</h2>
          <div lang="kn" className="rounded-2xl rounded-tl-sm bg-white p-4 text-[15px] leading-relaxed text-gray-900 shadow-sm ring-1 ring-gray-200 [overflow-wrap:anywhere]">
            <Formatted text={message.text} />
          </div>
          <details className="px-1">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-blue-600">The English one</summary>
            <div className="rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-700 ring-1 ring-gray-200 [overflow-wrap:anywhere]">
              <Formatted text={english[i].text} />
            </div>
          </details>
        </section>
      ))}
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function KannadaMessagesPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <MessagesContent />
    </Suspense>
  )
}
