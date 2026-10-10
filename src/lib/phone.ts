// Phone numbers are stored as 10-digit Indian mobile numbers (digits only),
// so "+91 98450 21763", "098450 21763" and "9845021763" all match.
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null
  let digits = input.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return digits.length > 0 ? digits : null
}

export function isValidPhone(phone: string | null): boolean {
  return !!phone && /^[6-9]\d{9}$/.test(phone)
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone
}
