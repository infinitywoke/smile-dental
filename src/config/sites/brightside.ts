import { bookingReasons, homeServices as smileServices, toothAreas, treatments, siteConfig as smile } from './smile-dental'

// An invented clinic, for showing prospective clinics what the package does. Nothing here is a real clinic,
// dentist or patient; its bookings go to the demo clinic in Clinic OS (supabase/demo-clinic-2026-10.sql). The
// treatments are the template's standard list until a real clinic gives its own.
export { bookingReasons, toothAreas, treatments }

export const siteConfig: typeof smile = {
  name: 'Brightside Dental',
  description: 'Dental clinic in Manipal, run by Dr. Kavya Shenoy, BDS, MDS: check-ups, cleaning, fillings, root canals, crowns and braces.',
  place: 'Manipal',
  area: 'Manipal, Udupi',
  street: 'End Point Road',
  postal: { locality: 'Manipal', region: 'Karnataka', code: '576104' },
  demo: true,
  // Its hosting project's address, once it has one
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://brightside-dental-demo.vercel.app',
  clinicOsUrl: smile.clinicOsUrl,
  clinicSlug: 'demo-brightside',

  phone: '+91 9000000001',
  whatsapp: '+91 9000000001',
  email: 'hello@brightside.example',
  address: '2nd Floor, Lakeview Arcade, End Point Road, Manipal - 576104',
  mapEmbedLink: 'https://www.google.com/maps?q=Manipal,+Karnataka&output=embed',
  googleReviewsLink: 'https://www.google.com/maps/search/?api=1&query=Manipal',
  directionsLink: 'https://www.google.com/maps/search/?api=1&query=Manipal',
  reviewRequestLink: 'https://www.google.com/maps/search/?api=1&query=Manipal',
  googlePhotosLink: 'https://www.google.com/maps/search/?api=1&query=Manipal',

  // Clinic OS reads these from the database; the types are shared with the website's own config
  payments: { upiId: 'brightside.demo@example', payeeName: 'Brightside Dental' },
  chairMonitor: { name: '', wifi: '', password: '', address: 'http://192.168.1.1' },
  tally: { version: '', company: '', cashLedger: '', bankLedger: '', patientGroup: '', incomeLedger: '' },

  operatingHours: smile.operatingHours,
  socials: smile.socials,

  dentist: {
    name: 'Dr. Kavya Shenoy',
    short: 'Dr. Kavya',
    pronouns: { subject: 'she', object: 'her', possessive: 'her', reflexive: 'herself' },
    years: 10,
    degree: 'BDS, MDS',
    byline: ['Manipal, 2014 · 10 years in practice', 'Sees every patient herself'],
    summary: 'BDS, MDS (invented for this demo), with 10 years of practice. She sees every patient herself.',
    quote: "She takes the time to understand each patient's needs and explains treatment options in a simple and reassuring way.",
    points: [
      'BDS and MDS, 2014',
      '10 years of practice in Karnataka',
      'Sees every patient herself, from the first check-up to the last sitting',
    ],
    qualifications: 'BDS, MDS',
    experience: '10 years',
    registration: '12345-A',
    signature: '',
    bio: 'Dr. Kavya Shenoy is the invented dentist of this demo clinic.',
    portraitPhoto: '/images/demo/dr-kavya.svg',
    actionPhoto: '/images/demo/dr-kavya.svg',
  },

  media: { logo: '/images/demo/brightside-logo.svg', priceList: '' },
}

export const homeServices = smileServices.map((s) => ({ ...s, line: s.line.replace('Dr. Rahil', 'Dr. Kavya') }))

export const faqs = [
  { question: 'Is this a real clinic?', answer: 'No. Brightside Dental is an invented clinic, here to show what a clinic website and its booking can do.', isVerified: true },
  { question: 'Where is Brightside Dental?', answer: 'In this demo, on the 2nd floor of Lakeview Arcade, End Point Road, Manipal.', isVerified: true },
  { question: 'Who is the dentist?', answer: 'Dr. Kavya Shenoy, BDS, MDS, who sees every patient herself and explains the options and the cost before any treatment.', isVerified: true },
  { question: 'Are you open on Sundays?', answer: 'Yes. Everyday timings are 8:30 AM to 1:00 PM and 2:30 PM to 7:30 PM. We are only closed on Fridays.', isVerified: true },
]
