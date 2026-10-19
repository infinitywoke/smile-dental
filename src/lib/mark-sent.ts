// Marks a WhatsApp tap as sent. Sent with keepalive: opening WhatsApp right after may leave this page,
// which would cancel an ordinary request (a server action) still on its way.
export type SentKind = 'reminded' | 'followed-up' | 'recalled' | 'review'

export async function markSent(kind: SentKind, id: string): Promise<{ error?: string }> {
  try {
    const response = await fetch('/app/marks', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    })
    if (response.ok) return {}
    const data = (await response.json().catch(() => ({}))) as { error?: string }
    return { error: data.error ?? 'Something went wrong.' }
  } catch {
    return { error: "Couldn't reach the server. Check the internet and try again." }
  }
}
