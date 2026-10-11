import { describe, expect, it } from 'vitest'
import { nextActionFor, type PatientSituation } from './next-action'

const base: PatientSituation = {
  patientId: 'p1',
  openVisit: null,
  appointmentToday: null,
  due: null,
  hasFutureAppointment: false,
}

describe('nextActionFor', () => {
  it('carries on a visit that is open today, at the bill once there are notes', () => {
    expect(nextActionFor({ ...base, openVisit: { id: 'v1', hasNotes: true } })).toEqual({
      label: 'Continue visit', href: '/app/visits/v1?step=bill', tone: 'visit',
    })
    expect(nextActionFor({ ...base, openVisit: { id: 'v1', hasNotes: false } }).href).toBe('/app/visits/v1?step=notes')
  })

  it("starts today's appointment, linking it to the new visit", () => {
    expect(nextActionFor({ ...base, appointmentToday: { id: 'a1' } })).toEqual({
      label: 'Start visit', href: '/app/patients/p1/visits/new?appointmentId=a1', tone: 'visit',
    })
  })

  it('collects money owed on the most recent visit with a balance', () => {
    expect(nextActionFor({ ...base, due: { visitId: 'v9', amount: 2700 } })).toEqual({
      label: 'Collect ₹2,700', href: '/app/visits/v9?step=bill', tone: 'money',
    })
  })

  it('books the next visit when nothing is coming up, else a new visit', () => {
    expect(nextActionFor(base)).toEqual({ label: 'Book next visit', href: '/app/book?patient=p1', tone: 'calm' })
    expect(nextActionFor({ ...base, hasFutureAppointment: true })).toEqual({
      label: 'New visit', href: '/app/patients/p1/visits/new', tone: 'calm',
    })
  })

  it('respects the priority between situations', () => {
    const everything: PatientSituation = {
      ...base,
      openVisit: { id: 'v1', hasNotes: true },
      appointmentToday: { id: 'a1' },
      due: { visitId: 'v9', amount: 100 },
    }
    expect(nextActionFor(everything).label).toBe('Continue visit')
    expect(nextActionFor({ ...everything, openVisit: null }).label).toBe('Start visit')
    expect(nextActionFor({ ...everything, openVisit: null, appointmentToday: null }).label).toBe('Collect ₹100')
    expect(nextActionFor({ ...base, due: { visitId: 'v9', amount: 0 } }).label).toBe('Book next visit')
  })
})
