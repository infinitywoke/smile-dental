import type { VisitSummary } from './visit-summary'

// PRODUCT.md worked example, visit 1: Prakash Shetty, 38, lower-right molar pain.
// Dictated on Sat 10 Oct 2026; bill 4,200 = consultation 200 + X-ray 350 + RCT 3,500 + unlabelled 150.
export const prakashVisit1: VisitSummary = {
  tidy_note: [
    'Complaint: Pain in the lower right back tooth for one week, worse at night.',
    'Findings: Deep caries on 46, tender on percussion. IOPA: caries approaching the pulp.',
    'Diagnosis: 46 symptomatic irreversible pulpitis.',
    'Treatment done: Consultation, IOPA X-ray, RCT started on 46.',
    'Plan: Post and core on 46, then crown (type undecided).',
    'Medicines: Amoxicillin 500 mg three times a day for 5 days.',
    'Next visit: Thursday 15th, 6 PM.',
  ].join('\n'),
  complaint: 'Pain in the lower right back tooth for one week, worse at night',
  findings: 'Deep caries on 46, tender on percussion. IOPA: caries approaching the pulp.',
  teeth: [{ tooth: '46', note: 'Deep caries, symptomatic irreversible pulpitis; RCT started' }],
  diagnoses: [{ tooth: '46', diagnosis: 'Symptomatic irreversible pulpitis' }],
  procedures_done: [
    { tooth: '', procedure: 'Consultation', treatment_slug: 'consultation', amount: 200 },
    { tooth: '46', procedure: 'IOPA X-ray', treatment_slug: 'x-ray', amount: 350 },
    { tooth: '46', procedure: 'Root canal treatment', treatment_slug: 'root-canal-treatment', amount: 3500 },
  ],
  plan: [
    { tooth: '46', procedure: 'Post and core build-up', price: 1200, price_min: null, price_max: null },
    { tooth: '46', procedure: 'Crown (type undecided)', price: null, price_min: 3499, price_max: 9999 },
  ],
  medicines: [
    { name: 'Amoxicillin', dose: '500 mg', frequency: 'Three times a day', duration: '5 days', instructions: 'After food' },
  ],
  aftercare: ['Avoid chewing on the right side until the crown is fitted'],
  next_visit: { when_text: 'Thursday 15th, 6 PM', date: '2026-10-15', time: '18:00', within_days: null },
  payment: { collected: 4200, method: 'upi', advance: null, balance_next_visit: null },
  patient_updates: { medical_alerts_add: [], preferred_times: 'Evenings after 6' },
  warnings: [],
  unclear: ['Extra ₹150 charge was not labelled'],
}
