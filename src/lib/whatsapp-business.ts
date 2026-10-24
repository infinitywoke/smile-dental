// Messages open in WhatsApp Business on Dr. Rahil's phone (package com.whatsapp.w4b) unless that phone is
// set to open WhatsApp (com.whatsapp) instead, in Settings or under Send. A wa.me link becomes an Android
// intent link for the chosen app, with the wa.me link as the fallback when it isn't installed. Used only
// on Android phones, and never under test automation (the e2e tests read the wa.me link itself).
export type WhatsAppApp = 'business' | 'whatsapp'
export const WHATSAPP_APPS: { app: WhatsAppApp; label: string }[] = [
  { app: 'business', label: 'WhatsApp Business' },
  { app: 'whatsapp', label: 'WhatsApp' },
]
const PACKAGES: Record<WhatsAppApp, string> = { business: 'com.whatsapp.w4b', whatsapp: 'com.whatsapp' }
const WA_ME = /^https:\/\/wa\.me\/(\d+)(?:\?text=(.*))?$/

// The choice is kept on this phone
const KEY = 'clinic-whatsapp-app'
const listeners = new Set<() => void>()
export function preferredWhatsAppApp(): WhatsAppApp {
  try {
    return localStorage.getItem(KEY) === 'whatsapp' ? 'whatsapp' : 'business'
  } catch {
    return 'business'
  }
}
export function setPreferredWhatsAppApp(app: WhatsAppApp): void {
  try {
    localStorage.setItem(KEY, app)
  } catch {
    // No storage: this phone opens WhatsApp Business
  }
  listeners.forEach((listener) => listener())
}
export function subscribeWhatsAppApp(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function appIntent(url: string, app: WhatsAppApp): string {
  const match = WA_ME.exec(url)
  if (!match) return url
  const [, phone, text = ''] = match
  return `intent://send?phone=${phone}${text ? `&text=${text}` : ''}#Intent;scheme=whatsapp;package=${PACKAGES[app]};S.browser_fallback_url=${encodeURIComponent(url)};end`
}
// The WhatsApp Business intent (as before the choice existed)
export const businessIntent = (url: string) => appIntent(url, 'business')

export function onAndroidPhone(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && !navigator.webdriver
}

// The link to open: the chosen app's intent on Android, the wa.me link elsewhere
export function whatsappHref(url: string, app: WhatsAppApp = preferredWhatsAppApp()): string {
  return onAndroidPhone() ? appIntent(url, app) : url
}

// Opens WhatsApp from code (after a server reply), the same way
export function openWhatsApp(url: string, app?: WhatsAppApp): void {
  window.location.assign(whatsappHref(url, app))
}
