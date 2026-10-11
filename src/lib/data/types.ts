// Row types for the Clinic OS tables (supabase/phase2.sql, supabase/phase3-5.sql).
// Dates are 'YYYY-MM-DD' strings, timestamps are ISO strings, and numeric(10,2)
// money columns arrive from Supabase JS as numbers (rupees).

// Phase 2 --------------------------------------------------------------------

export type Patient = {
  id: string
  name: string
  phone: string | null
  date_of_birth: string | null
  // 'female' | 'male' | 'other'; null on patients added before it was asked
  gender?: string | null
  address: string | null
  medical_alerts: string | null
  heard_from: string | null
  // Trial data, removable in one go from the Patients screen
  is_test: boolean
  // Optional until every patient query selects it
  preferred_times?: string | null
  created_at: string
  updated_at: string
}

export type Visit = {
  id: string
  patient_id: string
  visit_date: string
  notes: string
  // Phase 3 columns, no longer used (the AI tidy-up was removed); dropped in the clean-up wave
  notes_original?: string | null
  summary?: unknown | null
  confirmed_at?: string | null
  // When the WhatsApp message for this visit was sent (null: not sent)
  closed_at?: string | null
  created_at: string
  updated_at: string
}

// Two plain facts shown wherever a visit is listed (see src/lib/visit-status.ts)
export type VisitStatus = {
  money: 'none' | 'paid' | 'due'
  // Still owed on this visit (0 unless money is 'due')
  due: number
  // The WhatsApp message was sent
  sent: boolean
}

export type VisitPhoto = {
  id: string
  caption: string
  // A short-lived signed link to the private photo, for the screen only (never sent to a patient)
  url: string | null
}

export type VisitDetail = Visit & {
  patient: Pick<Patient, 'id' | 'name' | 'phone' | 'medical_alerts' | 'is_test'>
  photos: VisitPhoto[]
  linked_appointment?: Pick<Appointment, 'id' | 'starts_at' | 'status'> | null
  next_appointment?: Pick<Appointment, 'id' | 'starts_at' | 'status'> | null
}

// Phases 3-5 -----------------------------------------------------------------

export type TreatmentItemStatus = 'planned' | 'in_progress' | 'done' | 'cancelled'

export type TreatmentItem = {
  id: string
  owner_id: string
  patient_id: string
  tooth: string | null
  procedure: string
  price: number | null
  price_min: number | null
  price_max: number | null
  status: TreatmentItemStatus
  planned_visit_id: string | null
  done_visit_id: string | null
  created_at: string
  updated_at: string
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
  treatment_item_id: string | null
  created_at: string
  updated_at: string
}

export type PaymentMethod = 'upi' | 'cash'
export type PaymentKind = 'payment' | 'advance'

export type Payment = {
  id: string
  owner_id: string
  patient_id: string
  visit_id: string | null
  amount: number
  method: PaymentMethod
  kind: PaymentKind
  reference: string | null
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
  reminder_sent_at: string | null
  created_at: string
  updated_at: string
}

export type BookingRequestStatus = 'new' | 'contacted' | 'booked' | 'declined'

export type BookingRequest = {
  id: string
  owner_id: string
  name: string
  phone: string
  // Older requests (before Phase 5a) have area + city instead of address
  area: string | null
  city: string | null
  address: string | null
  date_of_birth: string | null
  gender?: string | null
  medical_alerts: string | null
  heard_from: string | null
  reason: string | null
  preferred_date: string | null
  preferred_time: string | null
  // The block the patient asked for (a moment in time)
  requested_start: string | null
  notes: string | null
  is_emergency: boolean
  is_test: boolean
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
  p_date_of_birth: string | null
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

export type ReminderKind = 'appointment' | 'crown' | 'recall' | 'unfinished' | 'booking'

// ref_id: appointment -> appointments.id, crown / unfinished -> treatment_items.id,
// recall -> patients.id, booking -> booking_requests.id
export type ReminderLog = {
  id: string
  owner_id: string
  kind: ReminderKind
  ref_id: string
  sent_at: string
  created_at: string
}

export type ExpenseCategory = 'lab' | 'materials' | 'rent' | 'salary' | 'utilities' | 'equipment' | 'other'
export type ExpenseMethod = 'cash' | 'upi' | 'bank' | 'card'

export type Expense = {
  id: string
  owner_id: string
  spent_on: string
  payee: string
  category: ExpenseCategory
  description: string
  amount: number
  method: ExpenseMethod
  patient_id: string | null
  treatment_item_id: string | null
  receipt_path: string | null
  // Set when the expense was confirmed from a fixed monthly cost
  recurring_expense_id: string | null
  created_at: string
  updated_at: string
}

export type RecurringExpense = {
  id: string
  owner_id: string
  name: string
  payee: string
  category: ExpenseCategory
  amount: number
  method: ExpenseMethod
  day_of_month: number
  active: boolean
  created_at: string
  updated_at: string
}

export type DayClose = {
  id: string
  owner_id: string
  day: string
  cash_counted: number
  cash_expected: number
  note: string
  closed_at: string
  created_at: string
  updated_at: string
}

export type AppConfig = {
  id: true
  clinic_owner_id: string
}
