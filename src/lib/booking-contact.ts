// A website request from someone without WhatsApp: the clinic calls them to confirm. The request's
// note starts with this line, so Clinic OS can show "Call to confirm" on its card.
export const CALL_BACK_NOTE = '📞 No WhatsApp: please call to confirm.'

export function wantsCallBack(notes: string | null | undefined): boolean {
  return !!notes && notes.startsWith(CALL_BACK_NOTE)
}

// The note as the clinic should read it, without the call-back line
export function noteWithoutCallBack(notes: string | null | undefined): string | null {
  if (!notes) return null
  const rest = wantsCallBack(notes) ? notes.slice(CALL_BACK_NOTE.length).trim() : notes
  return rest || null
}
