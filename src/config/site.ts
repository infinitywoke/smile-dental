/**
 * CLINIC CONTENT CONFIGURATION
 * 
 * IMPORTANT: 
 * - [VERIFIED]: Information explicitly known/provided for Smile Dental Clinic.
 * - [PLACEHOLDER]: Information intentionally awaiting clinic-owner input. Must not be published as fact.
 * - [GENERATED]: Generic copy generated during implementation. Requires owner review.
 */

export const siteConfig = {
  // --- Clinic Identity ---
  name: "Smile Dental Clinic", // [VERIFIED]
  description: "Dental clinic in Katapadi, Udupi, run by Dr. Rahil Yusuf, BDS: check-ups, cleaning, fillings, root canals, crowns and braces.", // [VERIFIED facts]
  // [VERIFIED] The live address. Switch to the clinic's own domain once it is connected in Vercel.
  url: "https://smile-dental-hin3.vercel.app",
  
  // --- Contact Information ---
  phone: "+91 6361816711", // [VERIFIED]
  whatsapp: "+91 6361816711", // [VERIFIED]
  email: "smiledental8925@gmail.com", // [VERIFIED]
  address: "1st Floor, YM Zohara Building, Shirva Rd, near Bank of Baroda (formerly Vijaya Bank), Yenna Gudde, Katapadi - 574105", // [VERIFIED]
  mapEmbedLink: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3690.9245645463925!2d74.7497085!3d13.2845037!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bbcbba33e21b099%3A0xcafb512227026d47!2sSmile%20Dental%20Clinic%20-%20Katapady!5e1!3m2!1sen!2sin!4v1789624673623!5m2!1sen!2sin", // [VERIFIED]
  googleReviewsLink: "https://maps.app.goo.gl/b8YHvgUQt4hPuCQL6", // [VERIFIED]
  directionsLink: "https://maps.app.goo.gl/b8YHvgUQt4hPuCQL6", // [VERIFIED] the clinic on Google Maps, as sent in confirmations
  // [PLACEHOLDER] The "write a review" link from Google Business Profile (Ask for reviews). Until it is
  // filled in, review requests use the Maps link above (the patient then taps Reviews, Write a review).
  reviewRequestLink: "",
  googlePhotosLink: "https://maps.app.goo.gl/b8YHvgUQt4hPuCQL6", // [VERIFIED]
  
  // --- Payments (Clinic OS shows a UPI QR for this payee) ---
  payments: {
    upiId: "rahil.yusuf.k-1@okhdfcbank", // [VERIFIED]
    payeeName: "Smile Dental Clinic", // [VERIFIED]
  },

  // --- Tally (Send to Tally fills these in; the dentist can change them on the screen) ---
  tally: {
    version: "Tally.ERP 9", // [VERIFIED] owner, 19 Oct 2026
    cashLedger: "Cash", // [VERIFIED]
    bankLedger: "Savings A/C", // [VERIFIED] where UPI payments arrive: the ledger his Day Book uses (owner, 24 Oct 2026)
    incomeLedger: "", // [PLACEHOLDER] the ledger under his Direct Incomes group that fees are credited to
  },

  operatingHours: [
    { day: "Everyday (Fridays Off)", hours: ["8:30 AM - 1:00 PM", "2:30 PM - 7:30 PM"] }, // [VERIFIED] matches Google Business Profile
  ],
  
  socials: {
    instagram: "[LINK PENDING]", // [PLACEHOLDER]
    facebook: "[LINK PENDING]", // [PLACEHOLDER]
  },
  
  // --- Dentist Information ---
  dentist: {
    name: "Dr. Rahil Yusuf", // [VERIFIED]
    qualifications: "BDS, November 2020 - Yenapoya Deemed to be University", // [VERIFIED]
    experience: "5 Years across India & Middle East", // [VERIFIED]
    registration: "", // [PLACEHOLDER] Dental Council registration number: printed on typed prescriptions once filled in
    signature: "", // [PLACEHOLDER] his signature, a transparent PNG in public/images: drawn on typed prescriptions once added
    bio: "Dr Rahil Yusuf is a caring and approachable dental professional who believes that every patient deserves to feel comfortable, heard, and confident about their dental care. He takes the time to understand each patient’s needs and explains treatment options in a simple and reassuring way. At Smile Dental Clinic, Katapady, Udupi, his goal is to make every dental visit a positive experience while helping patients achieve healthy, natural-looking smiles that they can be proud of. Your comfort, trust, and smile are always at the heart of our care.", // [VERIFIED]
    portraitPhoto: "/images/dr-rahil-front.jpg", // [VERIFIED]
    actionPhoto: "/images/clinical-procedure.jpg" // [VERIFIED]
  },
  
  // --- Clinic Media ---
  media: {
    logo: "/images/logo.jpg", // [VERIFIED]
    priceList: "/images/price-list.jpg", // [VERIFIED]
  }
}

export type Treatment = {
  slug: string
  name: string
  shortDescription: string
  description?: string
  isVerified: boolean
  pricing?: { detail: string; cost: string }[]
}

export const treatments: Treatment[] = [
  {
    slug: "consultation",
    name: "Consultation",
    shortDescription: "Initial dental examination and assessment by the dentist.",
    isVerified: true,
    pricing: [
      { detail: "Standard Consultation", cost: "200/-" }
    ]
  },
  {
    slug: "x-ray",
    name: "X-Ray",
    shortDescription: "Radiographic imaging used to diagnose hidden dental issues.",
    isVerified: true,
    pricing: [
      { detail: "Standard X-Ray", cost: "350/-" }
    ]
  },
  {
    slug: "scaling-teeth-cleaning",
    name: "Scaling / Teeth Cleaning / Prophylaxis",
    shortDescription: "Removal of plaque, tartar, and stains to maintain oral hygiene.",
    isVerified: true,
    pricing: [
      { detail: "Mild case", cost: "400/-" },
      { detail: "Moderate case", cost: "600/-" },
      { detail: "Severe case", cost: "800/-" },
      { detail: "Polishing (Henry Schein)", cost: "300/-" }
    ]
  },
  {
    slug: "complete-dentures",
    name: "Complete Dentures",
    shortDescription: "Full arch removable prosthetics to replace all missing teeth.",
    isVerified: true,
    pricing: [
      { detail: "Complete Denture Basic quality", cost: "7,000/-" },
      { detail: "Complete Denture AcryRock quality", cost: "9,000/-" },
      { detail: "Complete Denture Ivoclar quality", cost: "14,000/-" }
    ]
  },
  {
    slug: "orthodontics",
    name: "Orthodontics",
    shortDescription: "Treatments to correct teeth alignment and bite issues.",
    isVerified: true,
    pricing: [
      { detail: "Basic Metal braces", cost: "25,000/-" },
      { detail: "Premium Metal braces", cost: "30,000/-" },
      { detail: "Ceramic Braces", cost: "45,000/-" },
      { detail: "Illusion aligners (based on no. of trays)", cost: "45,000/- to 65,000/-" },
      { detail: "Invisalign aligners", cost: "1,25,000/-" }
    ]
  },
  {
    slug: "root-canal-treatment",
    name: "Root Canal Treatment",
    shortDescription: "Procedure to repair and save a severely infected or damaged tooth.",
    isVerified: true,
    pricing: [
      { detail: "Standard Treatment", cost: "3,500/-" }
    ]
  },
  {
    slug: "post-and-core-build-up",
    name: "Post and Core Build Up",
    shortDescription: "Restoration performed to anchor a crown on a tooth after a root canal.",
    isVerified: true,
    pricing: [
      { detail: "Standard Build Up", cost: "1,200/-" }
    ]
  },
  {
    slug: "removable-partial-dentures",
    name: "Removable Partial Dentures",
    shortDescription: "Removable replacement for one or more missing teeth.",
    isVerified: true,
    pricing: [
      { detail: "AcryRock Single tooth", cost: "1,200/-" },
      { detail: "AcryRock additional tooth", cost: "1,200/- + 400/-* number of additional teeth." }
    ]
  },
  {
    slug: "tooth-extraction",
    name: "Tooth Extraction",
    shortDescription: "Removal of a tooth from its socket in the jawbone.",
    isVerified: true,
    pricing: [
      { detail: "Mobile Tooth Extraction", cost: "500/-" },
      { detail: "Regular Extraction", cost: "700/-" },
      { detail: "Sectioning Charge", cost: "300/-" },
      { detail: "Wisdom Tooth/3rd Molar", cost: "800/-" },
      { detail: "Difficult wisdom tooth", cost: "1,200/-" },
      { detail: "Suture/Stitch", cost: "300/-" }
    ]
  },
  {
    slug: "fillings",
    name: "Fillings",
    shortDescription: "Restorative materials used to repair decayed or broken teeth.",
    isVerified: true,
    pricing: [
      { detail: "ZOE/Medicated Temporary", cost: "300/-" },
      { detail: "3M Ketac Molar GIC", cost: "700/-" },
      { detail: "Wizdent Master Design Composite", cost: "800/-" },
      { detail: "Dengen Nanotech Composite", cost: "900/-" },
      { detail: "3M Z350 Composite", cost: "1,200/-" }
    ]
  },
  {
    slug: "crowns-bridges-ceramic",
    name: "Crowns & Bridges (Ceramic)",
    shortDescription: "Custom-fitted tooth-shaped caps for restoring damaged teeth.",
    isVerified: true,
    pricing: [
      { detail: "Vita Ceramic", cost: "3,499/- (Per Crown)" },
      { detail: "Ivoclar Ceramic", cost: "3,999/- (Per Crown)" },
      { detail: "DMLS Ivoclar Ceramic", cost: "4,999/- (Per Crown)" }
    ]
  },
  {
    slug: "crowns-bridges-zirconia",
    name: "Crowns & Bridges (Zirconia/Emax)",
    shortDescription: "Highly durable and aesthetically pleasing tooth-shaped caps.",
    isVerified: true,
    pricing: [
      { detail: "Vita Zirconia (5 years warranty)", cost: "6,499/- (Per Crown)" },
      { detail: "Ivoclar Zirconia (10 years warranty)", cost: "7,499/- (Per Crown)" },
      { detail: "IPS Emax Lithium Disilicate (10 years warranty, balances Beauty and strength)", cost: "9,999/- (Per Crown)" }
    ]
  }
]

// --- The website (D): the homepage's treatments, the booking card's reasons and the tooth chart ---
// Every price shown here is checked against the price list above by src/lib/home-content.test.ts.
export type HomeService = {
  id: string
  name: string
  line: string
  price: string
  // The price-list treatments it is drawn from
  slugs: string[]
}

export const homeServices: HomeService[] = [
  { id: 'checkup', name: 'Check-up and consultation', line: 'An examination by Dr. Rahil; an X-ray, if needed, is ₹350.', price: '₹200', slugs: ['consultation', 'x-ray'] },
  { id: 'cleaning', name: 'Teeth cleaning', line: 'Scaling and polishing to remove tartar and stains.', price: '₹400 – ₹800', slugs: ['scaling-teeth-cleaning'] },
  { id: 'filling', name: 'Fillings', line: 'Tooth-coloured fillings for cavities and small chips.', price: 'from ₹700', slugs: ['fillings'] },
  { id: 'rootcanal', name: 'Root canal treatment', line: 'Saves a badly decayed or infected tooth.', price: '₹3,500', slugs: ['root-canal-treatment', 'post-and-core-build-up'] },
  { id: 'crown', name: 'Crowns and bridges', line: 'Ceramic or zirconia crowns, and bridges for gaps.', price: 'from ₹3,499', slugs: ['crowns-bridges-ceramic', 'crowns-bridges-zirconia'] },
  { id: 'braces', name: 'Braces and aligners', line: 'Metal or ceramic braces, or clear aligners.', price: 'from ₹25,000', slugs: ['orthodontics'] },
  { id: 'removal', name: 'Tooth removal', line: 'Including wisdom teeth, after an X-ray.', price: 'from ₹500', slugs: ['tooth-extraction'] },
  { id: 'dentures', name: 'Dentures', line: 'Partial or complete, to replace missing teeth.', price: 'from ₹1,200', slugs: ['removable-partial-dentures', 'complete-dentures'] },
]

// "What do you need?" on the booking card. A treatment's Book link picks the one with its id.
export const bookingReasons = [
  { id: 'checkup', label: 'Check-up' },
  { id: 'cleaning', label: 'Cleaning' },
  { id: 'toothache', label: 'Toothache' },
  { id: 'filling', label: 'Filling' },
  { id: 'rootcanal', label: 'Root canal' },
  { id: 'crown', label: 'Crown or bridge' },
  { id: 'braces', label: 'Braces or aligners' },
  { id: 'removal', label: 'Tooth removal' },
  { id: 'dentures', label: 'Dentures' },
  { id: 'unsure', label: 'Not sure' },
] as const

export type ToothArea = {
  label: string
  title: string
  body: string
  items: [string, string][]
  // The reason it picks on the booking card, and the button that books it
  reason: (typeof bookingReasons)[number]['id']
  cta: string
  slugs: string[]
}

// "Not sure what you need?": what each area of the mouth usually needs, and what it costs
export const toothAreas: Record<'front' | 'back' | 'wisdom' | 'gums' | 'missing', ToothArea> = {
  front: {
    label: 'Front teeth', title: 'A chipped, gapped or crooked front tooth',
    body: 'A tooth-coloured filling or a crown repairs a chip. Braces or aligners straighten crowded or gapped teeth.',
    items: [['Tooth-coloured filling', 'from ₹800'], ['Ceramic crown', 'from ₹3,499'], ['Metal braces', 'from ₹25,000'], ['Clear aligners', '₹45,000 – ₹65,000']],
    reason: 'checkup', cta: 'Book a check-up for this', slugs: ['fillings', 'crowns-bridges-ceramic', 'orthodontics'],
  },
  back: {
    label: 'Back teeth', title: 'Pain in a back tooth',
    body: 'Usually a cavity. It may need a filling; if the nerve is affected, a root canal and then a crown.',
    items: [['Check-up', '₹200'], ['Filling', 'from ₹700'], ['Root canal treatment', '₹3,500'], ['Ceramic crown', 'from ₹3,499']],
    reason: 'toothache', cta: 'Book a check-up for this', slugs: ['consultation', 'fillings', 'root-canal-treatment', 'crowns-bridges-ceramic'],
  },
  wisdom: {
    label: 'Wisdom teeth', title: 'A painful wisdom tooth',
    body: 'An X-ray first shows how the tooth sits. Then removal, if it needs to come out.',
    items: [['X-ray', '₹350'], ['Wisdom tooth removal', '₹800'], ['Difficult removal', '₹1,200']],
    reason: 'toothache', cta: 'Book a check-up for this', slugs: ['x-ray', 'tooth-extraction'],
  },
  gums: {
    label: 'Gums', title: 'Bleeding gums or tartar',
    body: 'Usually fixed with scaling and polishing. The price depends on how much build-up there is.',
    items: [['Cleaning, mild', '₹400'], ['Cleaning, moderate', '₹600'], ['Cleaning, severe', '₹800'], ['Polishing', '₹300']],
    reason: 'cleaning', cta: 'Book a cleaning', slugs: ['scaling-teeth-cleaning'],
  },
  missing: {
    label: 'Missing tooth', title: 'A missing tooth',
    body: 'A removable partial denture, a fixed bridge, or complete dentures, chosen with you after a check-up.',
    items: [['Partial denture, one tooth', '₹1,200'], ['Each extra tooth', '+ ₹400'], ['Ceramic bridge', 'from ₹3,499 a tooth'], ['Complete dentures', 'from ₹7,000']],
    reason: 'dentures', cta: 'Book a check-up for this', slugs: ['removable-partial-dentures', 'crowns-bridges-ceramic', 'complete-dentures'],
  },
}

// --- FAQs ---
// [PLACEHOLDER] Awaiting verified clinic FAQs.
export const faqs = [
  {
    question: "Where is Smile Dental Clinic located in Udupi?",
    answer: "Smile Dental Clinic is conveniently located on the 1st Floor of YM Zohara Building, on Shirva Road, near the Bank of Baroda Moodabettu Branch in Yenna Gudde, Katapadi. We proudly serve patients from Katapadi, Udupi, Kapu, Shirva, and surrounding areas.",
    isVerified: true
  },
  {
    question: "Who is the dentist at Smile Dental Clinic?",
    answer: "Dr. Rahil Yusuf, BDS (Yenepoya Deemed to be University, 2020), with 5 years of experience across India and the Middle East. He sees every patient himself and explains the options and the cost before any treatment.",
    isVerified: true
  },
  {
    question: "What dental treatments do you offer at your Katapadi clinic?",
    answer: "We offer a complete range of professional dental treatments including teeth cleaning (scaling), orthodontics (metal/ceramic braces and aligners), root canal treatments (RCT), tooth extractions, tooth-colored composite fillings, complete dentures, and zirconia crowns.",
    isVerified: true
  },
  {
    question: "Are you open on Sundays?",
    answer: "Yes, Smile Dental Clinic in Katapadi is open on Sundays! Our everyday timings are 8:30 AM to 1:00 PM and 2:30 PM to 7:30 PM. We are only closed on Fridays.",
    isVerified: true
  }
]
