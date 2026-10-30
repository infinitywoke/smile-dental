-- Multi-clinic, slice 3a of docs/build/PLAN-multi-clinic.md (owner, 30 Oct 2026: "continue"): the clinic's
-- details in the database, so each clinic's messages, prescriptions, bills, UPI code and Tally files carry its
-- own. Until now Clinic OS read them from src/config/site.ts (the website still does: it is Smile Dental's own).
--   - clinics: the place (in the sign-off: "Smile Dental Clinic, Katapadi"), phone and WhatsApp, email, the
--     address in full and in one line, the map and review links, UPI, logo, the Tally names, the chair monitor;
--   - dentists: the short name ("Dr. Rahil is running late"), in Kannada too, qualifications, registration
--     number and signature (on prescriptions);
--   - Smile Dental Clinic's filled in as src/config/site.ts has them. Set up by the operator; the app only
--     reads them (slice 3b).
-- Additive: nothing reads them yet. Folded into schema.sql, all but the test clinic's copy below.

begin;

-- On the live database: wait at most 10 seconds for a table the app is using, then stop with nothing changed
set local lock_timeout = '10s';

-- The clinic's details --------------------------------------------------------------------------------------
alter table public.clinics
  add column if not exists place text check (char_length(place) <= 60),
  add column if not exists place_kn text check (char_length(place_kn) <= 60),
  add column if not exists phone text check (char_length(phone) <= 30),
  add column if not exists whatsapp text check (char_length(whatsapp) <= 30),
  add column if not exists email text check (char_length(email) <= 120),
  add column if not exists address text check (char_length(address) <= 300),
  add column if not exists short_address text check (char_length(short_address) <= 120),
  add column if not exists maps_link text check (maps_link ~ '^https://' and char_length(maps_link) <= 300),
  add column if not exists review_link text check (review_link ~ '^https://' and char_length(review_link) <= 300),
  add column if not exists upi_id text check (char_length(upi_id) <= 100),
  add column if not exists upi_payee text check (char_length(upi_payee) <= 100),
  add column if not exists logo text check (char_length(logo) <= 300),
  -- {version, company, cashLedger, bankLedger, patientGroup, incomeLedger}: what Send to Tally starts from
  add column if not exists tally jsonb not null default '{}'::jsonb,
  -- {name, wifi, password, address}: the chair's camera monitor, where a clinic has one
  add column if not exists chair_monitor jsonb;

-- A dentist's details (a visiting specialist's too) ---------------------------------------------------------
alter table public.dentists
  add column if not exists short_name text check (char_length(short_name) <= 60),
  add column if not exists short_name_kn text check (char_length(short_name_kn) <= 60),
  add column if not exists qualifications text check (char_length(qualifications) <= 200),
  add column if not exists registration text check (char_length(registration) <= 60),
  add column if not exists signature text check (char_length(signature) <= 300);

-- Smile Dental Clinic, as src/config/site.ts has it (each value verified with the owner) ---------------------
update public.clinics set
  place = 'Katapadi',
  place_kn = 'ಕಟಪಾಡಿ',
  phone = '+91 6361816711',
  whatsapp = '+91 6361816711',
  email = 'smiledental8925@gmail.com',
  address = '1st Floor, YM Zohara Building, Shirva Rd, near Bank of Baroda (formerly Vijaya Bank), Yenna Gudde, Katapadi - 574105',
  short_address = '1st Floor, YM Zohara Building, Shirva Road, Katapadi',
  maps_link = 'https://maps.app.goo.gl/b8YHvgUQt4hPuCQL6',
  review_link = 'https://g.page/r/CUdtAiciUfvKEBM/review',
  upi_id = 'rahil.yusuf.k-1@okhdfcbank',
  upi_payee = 'Smile Dental Clinic',
  logo = '/images/logo.jpg',
  tally = jsonb_build_object('version', 'Tally.ERP 9', 'company', 'SMILE DENTAL0', 'cashLedger', 'Cash',
                             'bankLedger', 'Savings A/C', 'patientGroup', 'Direct Incomes', 'incomeLedger', ''),
  chair_monitor = jsonb_build_object('name', 'Intellicam', 'wifi', 'Q5Y422EW500-294', 'password', '12345678',
                                     'address', 'http://192.168.1.1')
where slug = 'smile-dental-katapadi' and phone is null;

update public.dentists d set
  short_name = 'Dr. Rahil',
  short_name_kn = 'ಡಾ. ರಾಹಿಲ್',
  qualifications = 'BDS, November 2020 - Yenapoya Deemed to be University',
  registration = '51950-A',
  signature = '/images/signature.png'
from public.clinics c
where c.id = d.clinic_id and c.slug = 'smile-dental-katapadi' and d.name = 'Dr. Rahil Yusuf' and d.short_name is null;

-- This file only: the other clinic slice 1 made ("New clinic", no details yet) is the owner's test account's,
-- for the browser tests. It becomes a copy of Smile Dental Clinic, so the tests read the messages Dr. Rahil's
-- patients get. Its owner, the test login, is its dentist under Dr. Rahil's name. A clinic set up for a
-- dentist (slice 5) has its own name and details, and is never touched here.
update public.clinics t set
  name = s.name, place = s.place, place_kn = s.place_kn, phone = s.phone, whatsapp = s.whatsapp, email = s.email,
  address = s.address, short_address = s.short_address, maps_link = s.maps_link, review_link = s.review_link,
  upi_id = s.upi_id, upi_payee = s.upi_payee, logo = s.logo, tally = s.tally, chair_monitor = s.chair_monitor
from public.clinics s
where s.slug = 'smile-dental-katapadi' and t.id <> s.id and t.name = 'New clinic' and t.phone is null;

update public.dentists d set
  name = s.name, short_name = s.short_name, short_name_kn = s.short_name_kn, qualifications = s.qualifications,
  registration = s.registration, signature = s.signature
from public.dentists s
join public.clinics sc on sc.id = s.clinic_id and sc.slug = 'smile-dental-katapadi'
where s.name = 'Dr. Rahil Yusuf' and d.clinic_id <> s.clinic_id and d.name = 'Dentist' and d.short_name is null
  and d.clinic_id in (select c.id from public.clinics c where c.slug <> 'smile-dental-katapadi' and c.phone = sc.phone);

commit;
