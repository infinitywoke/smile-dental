import { formatRupees } from '@/lib/pricing'

export type NextAction = {
  label: string
  href: string
  // How the button should look: a visit to carry on, money to collect, or a calm default
  tone: 'visit' | 'money' | 'calm'
}

export type PatientSituation = {
  patientId: string
  // A visit started today and not finished yet
  openVisit: { id: string; hasNotes: boolean } | null
  // Booked for today and no visit started from it yet
  appointmentToday: { id: string } | null
  // The most recent visit that still has money owed
  due: { visitId: string; amount: number } | null
  hasFutureAppointment: boolean
}

// The one button the patient page leads with. Highest priority first:
// carry on today's visit, start today's appointment, collect money, book the next visit, new visit.
export function nextActionFor(s: PatientSituation): NextAction {
  if (s.openVisit) {
    return {
      label: 'Continue visit',
      href: `/app/visits/${s.openVisit.id}?step=${s.openVisit.hasNotes ? 'bill' : 'notes'}`,
      tone: 'visit',
    }
  }
  if (s.appointmentToday) {
    return {
      label: 'Start visit',
      href: `/app/patients/${s.patientId}/visits/new?appointmentId=${s.appointmentToday.id}`,
      tone: 'visit',
    }
  }
  if (s.due && s.due.amount > 0) {
    return { label: `Collect ${formatRupees(s.due.amount)}`, href: `/app/visits/${s.due.visitId}?step=bill`, tone: 'money' }
  }
  if (!s.hasFutureAppointment) {
    return { label: 'Book next visit', href: `/app/book?patient=${s.patientId}`, tone: 'calm' }
  }
  return { label: 'New visit', href: `/app/patients/${s.patientId}/visits/new`, tone: 'calm' }
}
