'use client'

import { useEffect } from 'react'
import { openWhatsApp, whatsappHref } from '@/lib/whatsapp-business'

// Every wa.me link tapped in Clinic OS opens the WhatsApp chosen on this phone, Business unless set
// otherwise (see whatsapp-business.ts)
export function WhatsAppBusiness() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      const link = (event.target as Element | null)?.closest?.('a[href^="https://wa.me/"]') as HTMLAnchorElement | null
      if (!link || whatsappHref(link.href) === link.href) return
      event.preventDefault()
      openWhatsApp(link.href)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  return null
}
