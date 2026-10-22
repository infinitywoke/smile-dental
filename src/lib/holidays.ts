// The days that change who comes in: holidays (government offices and schools shut) and festivals, shown
// on every day the doctor picks. From the official lists only, never worked out from a calendar:
// - 2026: Government of Karnataka, general and restricted holidays, notification of 17 November 2025
//   (as published: Sakshi Post; the dates from October checked against Goodreturns and TeamLease), with
//   the state holidays that fall on a Sunday or a second Saturday, and the festivals that share a day
//   with another holiday. The Kodagu-only local holidays are left out.
// - 2027: Government of India, DoPT O.M. F.No.12/2/2023-JCA of July 2026: the compulsory holidays, and
//   as festivals the other occasions from its lists that Karnataka keeps; plus Karnataka's own holidays
//   with a fixed date (Ambedkar Jayanthi, May Day, Kannada Rajyotsava). Karnataka's 2027 list comes
//   out around November 2026: then the 2027 days are replaced with it (Basava and Kanakadasa
//   Jayanthi, Mahalaya Amavasya and Varamahalakshmi are missing until then).
// Id, Bakrid, Muharram and Milad follow the moon and may move by a day; the state announces it.

export type HolidayKind = 'holiday' | 'festival'
export type Holiday = { date: string; name: string; kind: HolidayKind }

const holiday = (date: string, name: string): Holiday => ({ date, name, kind: 'holiday' })
const festival = (date: string, name: string): Holiday => ({ date, name, kind: 'festival' })

export const HOLIDAYS: readonly Holiday[] = [
  // 2026, Karnataka
  festival('2026-01-01', 'New Year'),
  holiday('2026-01-15', 'Makara Sankranti'),
  holiday('2026-01-26', 'Republic Day'),
  festival('2026-01-27', 'Sri Madhwa Navami'),
  festival('2026-02-04', 'Shab-e-Barat'),
  holiday('2026-02-15', 'Maha Shivaratri'),
  festival('2026-03-02', 'Holi'),
  festival('2026-03-17', 'Shab-e-Qadar'),
  holiday('2026-03-19', 'Ugadi'),
  festival('2026-03-20', 'Jumat-ul-Wida'),
  holiday('2026-03-21', 'Ramzan (Khutub-e-Ramzan)'),
  festival('2026-03-23', 'Devara Dasimayya Jayanthi'),
  festival('2026-03-27', 'Sri Ramanavami'),
  holiday('2026-03-31', 'Mahaveera Jayanthi'),
  holiday('2026-04-03', 'Good Friday'),
  festival('2026-04-04', 'Holy Saturday'),
  holiday('2026-04-14', 'Dr. B.R. Ambedkar Jayanthi'),
  festival('2026-04-14', 'Souramana Ugadi (Bisu)'),
  holiday('2026-04-20', 'Basava Jayanthi, Akshaya Tritiya'),
  festival('2026-04-21', 'Sri Shankaracharya Jayanthi'),
  festival('2026-04-22', 'Sri Ramanujacharya Jayanthi'),
  holiday('2026-05-01', 'May Day'),
  festival('2026-05-01', 'Buddha Poornima'),
  holiday('2026-05-28', 'Bakrid'),
  holiday('2026-06-26', 'Last day of Moharram'),
  holiday('2026-08-15', 'Independence Day'),
  festival('2026-08-21', 'Varamahalakshmi Vrata'),
  holiday('2026-08-26', 'Eid Milad'),
  festival('2026-08-26', 'Onam, Rig Upakarma'),
  festival('2026-08-27', 'Yajur Upakarma'),
  festival('2026-08-28', 'Narayana Guru Jayanthi, Raksha Bandhan'),
  festival('2026-09-04', 'Sri Krishna Janmashtami'),
  festival('2026-09-08', 'Kanya Mariyamma Jayanthi (Monti Fest)'),
  holiday('2026-09-14', 'Ganesh Chaturthi (Varasiddhi Vinayaka Vrata)'),
  festival('2026-09-14', 'Swarna Gowri Vrata'),
  festival('2026-09-17', 'Vishwakarma Jayanthi'),
  festival('2026-09-25', 'Ananta Padmanabha Vrata'),
  holiday('2026-10-02', 'Gandhi Jayanthi'),
  holiday('2026-10-10', 'Mahalaya Amavasya'),
  holiday('2026-10-20', 'Mahanavami, Ayudha Pooja'),
  holiday('2026-10-21', 'Vijayadashami'),
  holiday('2026-10-25', 'Maharshi Valmiki Jayanthi'),
  holiday('2026-11-01', 'Kannada Rajyotsava'),
  holiday('2026-11-08', 'Naraka Chaturdashi'),
  holiday('2026-11-10', 'Balipadyami, Deepavali'),
  festival('2026-11-24', 'Guru Nanak Jayanthi'),
  festival('2026-11-26', 'Huttari'),
  holiday('2026-11-27', 'Kanakadasa Jayanthi'),
  festival('2026-12-24', 'Christmas Eve'),
  holiday('2026-12-25', 'Christmas'),

  // 2027, India (and Karnataka's fixed days): replace with Karnataka's list when it is out
  festival('2027-01-01', 'New Year'),
  festival('2027-01-14', 'Makara Sankranti'),
  holiday('2027-01-26', 'Republic Day'),
  festival('2027-03-06', 'Maha Shivaratri'),
  holiday('2027-03-10', 'Ramzan (Id-ul-Fitr)'),
  festival('2027-03-23', 'Holi'),
  holiday('2027-03-26', 'Good Friday'),
  festival('2027-03-28', 'Easter'),
  festival('2027-04-07', 'Ugadi'),
  holiday('2027-04-14', 'Dr. B.R. Ambedkar Jayanthi'),
  festival('2027-04-14', 'Souramana Ugadi (Bisu), Vishu'),
  festival('2027-04-15', 'Sri Ramanavami'),
  holiday('2027-04-19', 'Mahaveera Jayanthi'),
  holiday('2027-05-01', 'May Day'),
  holiday('2027-05-17', 'Bakrid'),
  holiday('2027-05-20', 'Buddha Poornima'),
  holiday('2027-06-16', 'Muharram'),
  holiday('2027-08-15', 'Independence Day'),
  holiday('2027-08-15', 'Eid Milad'),
  festival('2027-08-17', 'Raksha Bandhan'),
  festival('2027-08-25', 'Sri Krishna Janmashtami'),
  festival('2027-09-04', 'Ganesh Chaturthi'),
  holiday('2027-10-02', 'Gandhi Jayanthi'),
  festival('2027-10-08', 'Mahanavami, Ayudha Pooja'),
  holiday('2027-10-09', 'Vijayadashami'),
  festival('2027-10-15', 'Maharshi Valmiki Jayanthi'),
  festival('2027-10-28', 'Naraka Chaturdashi'),
  holiday('2027-10-29', 'Deepavali'),
  festival('2027-10-30', 'Balipadyami'),
  holiday('2027-11-01', 'Kannada Rajyotsava'),
  holiday('2027-11-14', 'Guru Nanak Jayanthi'),
  festival('2027-12-24', 'Christmas Eve'),
  holiday('2027-12-25', 'Christmas'),
]

// Holidays first, then festivals, in the list's order
export function holidaysOn(date: string): Holiday[] {
  const day = HOLIDAYS.filter((h) => h.date === date)
  return [...day.filter((h) => h.kind === 'holiday'), ...day.filter((h) => h.kind === 'festival')]
}

// From one day to another, both included, in date order
export function holidaysBetween(from: string, to: string): Holiday[] {
  return HOLIDAYS.filter((h) => h.date >= from && h.date <= to)
}

// "Balipadyami, Deepavali" or "Dr. B.R. Ambedkar Jayanthi · Souramana Ugadi (Bisu)"; null on an ordinary day
export function holidayName(date: string): string | null {
  const day = holidaysOn(date)
  return day.length > 0 ? day.map((h) => h.name).join(' · ') : null
}

// The strongest of the day: a holiday over a festival
export function holidayKind(date: string): HolidayKind | null {
  const day = holidaysOn(date)
  return day.length === 0 ? null : day[0].kind
}
