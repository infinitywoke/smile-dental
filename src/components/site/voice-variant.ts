import { useSyncExternalStore } from 'react'
import { canRecordVoice } from './voice-recorder'

// The patient voice note test: which version this visitor sees (kept for the browser tab). 'page' offers
// a recorder with the booking; 'whatsapp' asks for a WhatsApp voice note after Send.
export type VoiceVariant = 'page' | 'whatsapp'

const VOICE_KEY = 'smile_voice_variant'
let voiceVariantCache: VoiceVariant | null = null
function voiceVariantNow(): VoiceVariant {
  if (voiceVariantCache) return voiceVariantCache
  let chosen: VoiceVariant | null = null
  try {
    const kept = sessionStorage.getItem(VOICE_KEY)
    if (kept === 'page' || kept === 'whatsapp') chosen = kept
  } catch {
    // Storage blocked: chosen for this page only
  }
  if (!chosen) chosen = Math.random() < 0.5 ? 'page' : 'whatsapp'
  // A browser that can't record gets the WhatsApp version
  if (chosen === 'page' && !canRecordVoice()) chosen = 'whatsapp'
  try {
    sessionStorage.setItem(VOICE_KEY, chosen)
  } catch {
    // fine
  }
  voiceVariantCache = chosen
  return chosen
}
const noSubscribe = () => () => {}

// Null while the page is drawn on the server, so the page as sent and the page in the browser agree
export const useVoiceVariant = () => useSyncExternalStore(noSubscribe, voiceVariantNow, () => null)
