// Clinic OS has a single user. Only the account in ALLOWED_EMAIL may sign in.
// If ALLOWED_EMAIL is not set, nobody is allowed (fail closed).
export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = process.env.ALLOWED_EMAIL?.trim().toLowerCase()
  if (!allowed || !email) return false
  return email.trim().toLowerCase() === allowed
}
