// Row types for the Clinic OS tables (supabase/schema.sql).
// Dates are 'YYYY-MM-DD' strings, timestamps are ISO strings, and numeric(10,2)
// money columns arrive from Supabase JS as numbers (rupees).

export type Patient = {
  id: string
  name: string
  phone: string | null
  // Year of birth (from the date of birth, or from the age when only that is known)
  birth_year?: number | null
  // When known (YYYY-MM-DD); birth_year is kept in step with it
  birth_date?: string | null
  // 'female' | 'male' | 'other'; null on patients added before it was asked
  gender?: string | null
  address: string | null
  medical_alerts: string | null
  heard_from: string | null
  // When the Google review request was sent on WhatsApp (null: never)
  review_asked_at?: string | null
  // When they agreed to the clinic keeping their records (null: not asked yet, or withdrawn)
  consent_at?: string | null
  // The language of their WhatsApp messages: 'kn' for Kannada, null for English
  language?: string | null
  created_at: string
  updated_at: string
}

export type Visit = {
  id: string
  patient_id: string
  visit_date: string
  notes: string
  // When the WhatsApp message for this visit was last sent (null: not sent)
  closed_at?: string | null
  // Set by the database when a sent visit's charges or payments change; cleared by the next send
  resend_needed?: boolean
  created_at: string
  updated_at: string
}

// Two plain facts shown wherever a visit is listed (see src/lib/visit-status.ts)
export type VisitStatus = {
  // 'ahead': money paid, nothing charged
  money: 'none' | 'paid' | 'due' | 'ahead'
  // This visit's part of what the patient owes (0 unless money is 'due')
  due: number
  // The WhatsApp message was sent
  sent: boolean
  // Sent, but the bill changed since: send again
  resend: boolean
}

export type VisitPhoto = {
  id: string
  caption: string
  // A short-lived signed link to the private photo, for the screen only (never sent to a patient)
  url: string | null
}

export type VisitDetail = Visit & {
  patient: Pick<Patient, 'id' | 'name' | 'phone' | 'medical_alerts' | 'review_asked_at' | 'birth_year' | 'birth_date' | 'consent_at' | 'language'>
  photos: VisitPhoto[]
  linked_appointment?: Pick<Appointment, 'id' | 'starts_at' | 'status'> | null
  next_appointment?: Pick<Appointment, 'id' | 'starts_at' | 'status' | 'duration_min'> | null
  // Recorded notes kept with the visit, playable through short-lived links
  recordings?: { id: string; seconds: number | null; created_at: string; url: string | null }[]
}

export type VisitChargeKind = 'item' | 'extra'

export type VisitCharge = {
  id: string
  owner_id: string
  visit_id: string
  patient_id: string
  description: string
  amount: number
  kind: VisitChargeKind
  treatment_slug: string | null
  created_at: string
  updated_at: string
}

export type PaymentMethod = 'upi' | 'cash'

export type Payment = {
  id: string
  owner_id: string
  patient_id: string
  // Every payment belongs to a visit; a visit that holds payments can't be deleted
  visit_id: string
  amount: number
  method: PaymentMethod
  received_at: string
  created_at: string
  updated_at: string
}

export type ShareLink = {
  id: string
  owner_id: string
  visit_id: string
  token: string
  expires_at: string
  created_at: string
  updated_at: string
}

export type AppointmentStatus = 'booked' | 'done' | 'cancelled' | 'no_show'

export type Appointment = {
  id: string
  owner_id: string
  patient_id: string
  starts_at: string
  duration_min: number
  reason: string
  status: AppointmentStatus
  from_visit_id: string | null
  visit_id: string | null
  created_at: string
  updated_at: string
}

export type BookingRequestStatus = 'new' | 'contacted' | 'booked' | 'declined'

export type BookingRequest = {
  id: string
  owner_id: string
  name: string
  phone: string
  address: string | null
  birth_year?: number | null
  gender?: string | null
  medical_alerts: string | null
  heard_from: string | null
  // When its WhatsApp reached the clinic (the asked time is held from then)
  received_at?: string | null
  // The voice note test: which version the patient saw, and the recording (page version)
  voice_variant?: 'page' | 'whatsapp' | null
  voice_note?: string | null
  reason: string | null
  // The block the patient asked for (a moment in time)
  requested_start: string | null
  notes: string | null
  // Sender's IP, kept only for rate limiting
  client_ip: string | null
  status: BookingRequestStatus
  patient_id: string | null
  appointment_id: string | null
  created_at: string
  updated_at: string
}

// Arguments of the public RPC public.submit_booking_request (returns the new id)
export type SubmitBookingRequestArgs = {
  p_name: string
  p_phone: string
  p_address: string | null
  p_medical_alerts: string | null
  p_heard_from: string | null
  p_reason: string | null
  p_notes: string | null
  p_requested_start: string
  p_gender: string | null
  p_birth_year: number | null
}

// Time the doctor has blocked off; hidden from the website
export type TimeOff = {
  id: string
  owner_id: string
  starts_at: string
  ends_at: string
  note: string
  created_at: string
  updated_at: string
}

export type AppConfig = {
  id: true
  clinic_owner_id: string
}
