export type Patient = {
  id: string
  name: string
  phone: string | null
  date_of_birth: string | null
  address: string | null
  medical_alerts: string | null
  heard_from: string | null
  created_at: string
}

export type Visit = {
  id: string
  patient_id: string
  visit_date: string
  notes: string
  created_at: string
}

export type VisitPhoto = {
  id: string
  caption: string
  url: string | null
}
