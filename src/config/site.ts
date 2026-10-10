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
  description: "Modern, professional, and pain-free dental care in your locality.", // [GENERATED]
  url: "https://smiledental.test", // [PLACEHOLDER]
  
  // --- Contact Information ---
  phone: "+91 6361816711", // [VERIFIED]
  whatsapp: "+91 6361816711", // [VERIFIED]
  email: "smiledental8925@gmail.com", // [VERIFIED]
  address: "1st Floor, YM Zohara Building, Shirva Rd, near Bank of Baroda (formerly Vijaya Bank), Yenna Gudde, Katapadi - 574105", // [VERIFIED]
  mapEmbedLink: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3690.9245645463925!2d74.7497085!3d13.2845037!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bbcbba33e21b099%3A0xcafb512227026d47!2sSmile%20Dental%20Clinic%20-%20Katapady!5e1!3m2!1sen!2sin!4v1789624673623!5m2!1sen!2sin", // [VERIFIED]
  googleReviewsLink: "https://maps.app.goo.gl/b8YHvgUQt4hPuCQL6", // [VERIFIED]
  googlePhotosLink: "https://maps.app.goo.gl/b8YHvgUQt4hPuCQL6", // [VERIFIED]
  
  operatingHours: [
    { day: "Everyday (Fridays Off)", hours: ["8:30 AM - 1:00 PM", "2:30 PM - 7:30 PM"] }, // [VERIFIED]
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
    bio: "Dr Rahil Yusuf is a caring and approachable dental professional who believes that every patient deserves to feel comfortable, heard, and confident about their dental care. He takes the time to understand each patient’s needs and explains treatment options in a simple and reassuring way. At Smile Dental Clinic, Katapady, Udupi, his goal is to make every dental visit a positive experience while helping patients achieve healthy, natural-looking smiles that they can be proud of. Your comfort, trust, and smile are always at the heart of our care.", // [VERIFIED]
    portraitPhoto: "/images/dr-rahil-front.jpg", // [VERIFIED]
    actionPhoto: "/images/clinical-procedure.jpg" // [VERIFIED]
  },
  
  // --- Clinic Media ---
  media: {
    logo: "/images/logo.jpg", // [VERIFIED]
    priceList: "/images/price-list.jpg", // [VERIFIED]
    sideProfile: "/images/dr-rahil-side.jpg" // [VERIFIED]
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

// --- FAQs ---
// [PLACEHOLDER] Awaiting verified clinic FAQs.
export const faqs = [
  {
    question: "Where is Smile Dental Clinic located in Udupi?",
    answer: "Smile Dental Clinic is conveniently located on the 1st Floor of YM Zohara Building, on Shirva Road, near the Bank of Baroda Moodabettu Branch in Yenna Gudde, Katapadi. We proudly serve patients from Katapadi, Udupi, Kapu, Shirva, and surrounding areas.",
    isVerified: true
  },
  {
    question: "Who is the best dentist in Katapadi, Udupi?",
    answer: "Dr. Rahil Yusuf is a highly rated, 5-star dentist in Katapadi, Udupi, with over 5 years of clinical experience across India and the Middle East. He is known for providing gentle, pain-free, and affordable dental care.",
    isVerified: true
  },
  {
    question: "What dental treatments do you offer at your Katapadi clinic?",
    answer: "We offer a complete range of professional dental treatments including teeth cleaning (scaling), orthodontics (metal/ceramic braces and aligners), root canal treatments (RCT), painless tooth extractions, tooth-colored composite fillings, complete dentures, and premium Zirconia crowns.",
    isVerified: true
  },
  {
    question: "Are you open on Sundays?",
    answer: "Yes, Smile Dental Clinic in Katapadi is open on Sundays! Our everyday timings are 8:30 AM to 1:00 PM and 2:30 PM to 7:30 PM. We are only closed on Fridays.",
    isVerified: true
  }
]
