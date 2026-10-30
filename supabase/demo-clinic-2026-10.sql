-- The demo clinic, for showing prospective clinics: Brightside Dental, Manipal. Every detail here is invented,
-- and its patients are made up by seed_demo_clinic, so nothing of a real clinic or patient is shown.
-- Make its login first (Supabase: Authentication, Add user, email demo@brightside.example, auto-confirm).
-- Run this once to set it up, and again before a demo to start the records over from today.

select public.setup_clinic($json$
{
  "slug": "demo-brightside",
  "name": "Brightside Dental",
  "place": "Manipal",
  "placeKn": "ಮಣಿಪಾಲ",
  "phone": "+91 9000000001",
  "email": "hello@brightside.example",
  "address": "2nd Floor, Lakeview Arcade, End Point Road, Manipal - 576104",
  "shortAddress": "2nd Floor, Lakeview Arcade, End Point Road, Manipal",
  "upi": { "id": "brightside.demo@example", "payee": "Brightside Dental" },
  "tally": { "version": "TallyPrime", "company": "BRIGHTSIDE DENTAL", "cashLedger": "Cash", "bankLedger": "Axis Bank", "patientGroup": "Sundry Debtors", "incomeLedger": "Treatment Fees" },
  "languages": ["en", "kn", "hi"],
  "chairs": ["Chair 1", "Chair 2"],
  "dentists": [
    { "name": "Dr. Kavya Shenoy", "email": "demo@brightside.example", "shortName": "Dr. Kavya", "shortNameKn": "ಡಾ. ಕಾವ್ಯಾ", "qualifications": "BDS, MDS", "registration": "12345-A" },
    { "name": "Dr. Arun Pai", "shortName": "Dr. Arun", "qualifications": "BDS, MDS (Orthodontics)" }
  ],
  "members": [{ "email": "demo@brightside.example", "role": "owner" }]
}
$json$::jsonb);

select public.seed_demo_clinic('demo-brightside');
