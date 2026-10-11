// Gender is asked for every patient (female, male or other). It is shown in the clinic app and
// gives the smart note clinical context. It is never written into a WhatsApp message.

export const GENDERS = ['female', 'male', 'other'] as const
export type Gender = (typeof GENDERS)[number]

export const GENDER_LABEL: Record<Gender, string> = { female: 'Female', male: 'Male', other: 'Other' }

// Anything that is not one of the three is treated as not given
export function parseGender(value: unknown): Gender | null {
  return typeof value === 'string' && (GENDERS as readonly string[]).includes(value) ? (value as Gender) : null
}

export function genderLabel(value: unknown): string | null {
  const gender = parseGender(value)
  return gender ? GENDER_LABEL[gender] : null
}
