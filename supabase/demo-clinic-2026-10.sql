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

-- A full price list of its own, so its website and visits look real (the template's standard list)
delete from public.price_list where clinic_id = (select id from public.clinics where slug = 'demo-brightside');
insert into public.price_list (owner_id, clinic_id, line_no, slug, treatment, description, detail, cost)
select m.user_id, c.id, v.line_no, v.slug, v.treatment, v.description, v.detail, v.cost
from public.clinics c
join public.clinic_members m on m.clinic_id = c.id and m.role = 'owner'
cross join (values
  (1, 'consultation', 'Consultation', 'Initial dental examination and assessment by the dentist.', 'Standard Consultation', '200/-'),
  (2, 'x-ray', 'X-Ray', 'Radiographic imaging used to diagnose hidden dental issues.', 'Standard X-Ray', '350/-'),
  (3, 'scaling-teeth-cleaning', 'Scaling / Teeth Cleaning / Prophylaxis', 'Removal of plaque, tartar, and stains to maintain oral hygiene.', 'Mild case', '400/-'),
  (4, 'scaling-teeth-cleaning', 'Scaling / Teeth Cleaning / Prophylaxis', '', 'Moderate case', '600/-'),
  (5, 'scaling-teeth-cleaning', 'Scaling / Teeth Cleaning / Prophylaxis', '', 'Severe case', '800/-'),
  (6, 'scaling-teeth-cleaning', 'Scaling / Teeth Cleaning / Prophylaxis', '', 'Polishing (Henry Schein)', '300/-'),
  (7, 'complete-dentures', 'Complete Dentures', 'Full arch removable prosthetics to replace all missing teeth.', 'Complete Denture Basic quality', '7,000/-'),
  (8, 'complete-dentures', 'Complete Dentures', '', 'Complete Denture AcryRock quality', '9,000/-'),
  (9, 'complete-dentures', 'Complete Dentures', '', 'Complete Denture Ivoclar quality', '14,000/-'),
  (10, 'orthodontics', 'Orthodontics', 'Treatments to correct teeth alignment and bite issues.', 'Basic Metal braces', '25,000/-'),
  (11, 'orthodontics', 'Orthodontics', '', 'Premium Metal braces', '30,000/-'),
  (12, 'orthodontics', 'Orthodontics', '', 'Ceramic Braces', '45,000/-'),
  (13, 'orthodontics', 'Orthodontics', '', 'Illusion aligners (based on no. of trays)', '45,000/- to 65,000/-'),
  (14, 'orthodontics', 'Orthodontics', '', 'Invisalign aligners', '1,25,000/-'),
  (15, 'root-canal-treatment', 'Root Canal Treatment', 'Procedure to repair and save a severely infected or damaged tooth.', 'Standard Treatment', '3,500/-'),
  (16, 'post-and-core-build-up', 'Post and Core Build Up', 'Restoration performed to anchor a crown on a tooth after a root canal.', 'Standard Build Up', '1,200/-'),
  (17, 'removable-partial-dentures', 'Removable Partial Dentures', 'Removable replacement for one or more missing teeth.', 'AcryRock Single tooth', '1,200/-'),
  (18, 'removable-partial-dentures', 'Removable Partial Dentures', '', 'AcryRock additional tooth', '1,200/- + 400/-* number of additional teeth.'),
  (19, 'tooth-extraction', 'Tooth Extraction', 'Removal of a tooth from its socket in the jawbone.', 'Mobile Tooth Extraction', '500/-'),
  (20, 'tooth-extraction', 'Tooth Extraction', '', 'Regular Extraction', '700/-'),
  (21, 'tooth-extraction', 'Tooth Extraction', '', 'Sectioning Charge', '300/-'),
  (22, 'tooth-extraction', 'Tooth Extraction', '', 'Wisdom Tooth/3rd Molar', '800/-'),
  (23, 'tooth-extraction', 'Tooth Extraction', '', 'Difficult wisdom tooth', '1,200/-'),
  (24, 'tooth-extraction', 'Tooth Extraction', '', 'Suture/Stitch', '300/-'),
  (25, 'fillings', 'Fillings', 'Restorative materials used to repair decayed or broken teeth.', 'ZOE/Medicated Temporary', '300/-'),
  (26, 'fillings', 'Fillings', '', '3M Ketac Molar GIC', '700/-'),
  (27, 'fillings', 'Fillings', '', 'Wizdent Master Design Composite', '800/-'),
  (28, 'fillings', 'Fillings', '', 'Dengen Nanotech Composite', '900/-'),
  (29, 'fillings', 'Fillings', '', '3M Z350 Composite', '1,200/-'),
  (30, 'crowns-bridges-ceramic', 'Crowns & Bridges (Ceramic)', 'Custom-fitted tooth-shaped caps for restoring damaged teeth.', 'Vita Ceramic', '3,499/- (Per Crown)'),
  (31, 'crowns-bridges-ceramic', 'Crowns & Bridges (Ceramic)', '', 'Ivoclar Ceramic', '3,999/- (Per Crown)'),
  (32, 'crowns-bridges-ceramic', 'Crowns & Bridges (Ceramic)', '', 'DMLS Ivoclar Ceramic', '4,999/- (Per Crown)'),
  (33, 'crowns-bridges-zirconia', 'Crowns & Bridges (Zirconia/Emax)', 'Highly durable and aesthetically pleasing tooth-shaped caps.', 'Vita Zirconia (5 years warranty)', '6,499/- (Per Crown)'),
  (34, 'crowns-bridges-zirconia', 'Crowns & Bridges (Zirconia/Emax)', '', 'Ivoclar Zirconia (10 years warranty)', '7,499/- (Per Crown)'),
  (35, 'crowns-bridges-zirconia', 'Crowns & Bridges (Zirconia/Emax)', '', 'IPS Emax Lithium Disilicate (10 years warranty, balances Beauty and strength)', '9,999/- (Per Crown)')
) as v (line_no, slug, treatment, description, detail, cost)
where c.slug = 'demo-brightside';
