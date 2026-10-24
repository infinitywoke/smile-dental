'use client'

import { useSyncExternalStore } from 'react'
import { WHATSAPP_APPS, preferredWhatsAppApp, setPreferredWhatsAppApp, subscribeWhatsAppApp, type WhatsAppApp } from '@/lib/whatsapp-business'
import { Card } from './ui'

// Settings: which WhatsApp the messages open in on this phone (WhatsApp Business unless he picks the
// other). Kept on the phone, as each phone has its own apps.
export function WhatsAppAppChoice() {
  const app = useSyncExternalStore(subscribeWhatsAppApp, preferredWhatsAppApp, () => 'business' as WhatsAppApp)
  return (
    <Card className="space-y-3">
      <div>
        <p className="font-semibold text-gray-900">WhatsApp</p>
        <p className="text-sm text-gray-500">The app messages to patients open in, on this phone.</p>
      </div>
      <div role="radiogroup" aria-label="WhatsApp app" className="grid grid-cols-2 gap-2">
        {WHATSAPP_APPS.map(({ app: value, label }) => (
          <button key={value} type="button" role="radio" aria-checked={app === value} onClick={() => setPreferredWhatsAppApp(value)}
            className={`min-h-12 rounded-xl px-3 text-base font-semibold ring-1 ring-inset ${
              app === value ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-800 ring-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>
    </Card>
  )
}
