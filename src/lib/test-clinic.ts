// Two clinics for unit tests only (nothing in the app imports this).
import type { ClinicContext } from '@/lib/clinic'

// Smile Dental Clinic, exactly as supabase/multi-clinic-3-2026-10.sql fills it in: what every message,
// prescription and Tally file of Dr. Rahil's clinic says. The tests that were written when these came from
// src/config/site.ts pass this, and still expect the same words.
export const SMILE_DENTAL: ClinicContext = {
  clinic: {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'smile-dental-katapadi',
    name: 'Smile Dental Clinic',
    place: 'Katapadi',
    placeKn: 'ಕಟಪಾಡಿ',
    phone: '+91 6361816711',
    whatsapp: '+91 6361816711',
    email: 'smiledental8925@gmail.com',
    address: '1st Floor, YM Zohara Building, Shirva Rd, near Bank of Baroda (formerly Vijaya Bank), Yenna Gudde, Katapadi - 574105',
    shortAddress: '1st Floor, YM Zohara Building, Shirva Road, Katapadi',
    mapsLink: 'https://maps.app.goo.gl/b8YHvgUQt4hPuCQL6',
    reviewLink: 'https://g.page/r/CUdtAiciUfvKEBM/review',
    upi: { id: 'rahil.yusuf.k-1@okhdfcbank', payee: 'Smile Dental Clinic' },
    logo: '/images/logo.jpg',
    tally: { version: 'Tally.ERP 9', company: 'SMILE DENTAL0', cashLedger: 'Cash', bankLedger: 'Savings A/C', patientGroup: 'Direct Incomes', incomeLedger: '' },
    chairMonitor: { name: 'Intellicam', wifi: 'Q5Y422EW500-294', password: '12345678', address: 'http://192.168.1.1' },
  },
  dentist: {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Dr. Rahil Yusuf',
    shortName: 'Dr. Rahil',
    shortNameKn: 'ಡಾ. ರಾಹಿಲ್',
    qualifications: 'BDS, November 2020 - Yenapoya Deemed to be University',
    registration: '51950-A',
    signature: '/images/signature.png',
  },
}

// An invented second clinic, with nothing in common with Smile Dental's: a message, prescription, UPI code or
// Tally file made for it must carry these details and none of the other clinic's. It has no chair monitor.
export const OTHER_CLINIC: ClinicContext = {
  clinic: {
    id: '00000000-0000-4000-8000-000000000011',
    slug: 'brightside-manipal',
    name: 'Brightside Dental',
    place: 'Manipal',
    placeKn: 'ಮಣಿಪಾಲ',
    phone: '+91 9000000001',
    whatsapp: '+91 9000000001',
    email: 'hello@brightside.example',
    address: '2nd Floor, Lakeview Arcade, End Point Road, Manipal - 576104',
    shortAddress: '2nd Floor, Lakeview Arcade, End Point Road, Manipal',
    mapsLink: 'https://maps.app.goo.gl/BrightsideManipal',
    reviewLink: 'https://g.page/r/BrightsideManipal/review',
    upi: { id: 'brightside.manipal@okaxis', payee: 'Brightside Dental' },
    logo: '/images/brightside-logo.png',
    tally: { version: 'TallyPrime', company: 'BRIGHTSIDE DENTAL', cashLedger: 'Cash', bankLedger: 'Axis Bank', patientGroup: 'Sundry Debtors', incomeLedger: 'Treatment Fees' },
    chairMonitor: null,
  },
  dentist: {
    id: '00000000-0000-4000-8000-000000000012',
    name: 'Dr. Kavya Shenoy',
    shortName: 'Dr. Kavya',
    shortNameKn: 'ಡಾ. ಕಾವ್ಯಾ',
    qualifications: 'BDS, MDS (Orthodontics) - Example University',
    registration: '12345-A',
    signature: '/images/kavya-signature.png',
  },
}
