import * as brightside from './sites/brightside'
import * as smileDental from './sites/smile-dental'

// The website is one template: each clinic's own content is a file in ./sites, and a deployment picks its clinic
// with NEXT_PUBLIC_SITE (set in its hosting project). Without it, this is Smile Dental Clinic's website. Clinic OS
// never reads a clinic's details from here (src/lib/data/clinic.ts).
const site = process.env.NEXT_PUBLIC_SITE === 'brightside' ? brightside : smileDental

export const { siteConfig, treatments, homeServices, bookingReasons, toothAreas, faqs } = site
export type { HomeService, ToothArea, Treatment } from './sites/smile-dental'
