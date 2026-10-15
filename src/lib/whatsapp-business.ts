// Dr. Rahil runs WhatsApp Business on his phone, so Clinic OS opens that app (package com.whatsapp.w4b)
// rather than letting Android pick personal WhatsApp. A wa.me link becomes an Android intent link for the
// Business app, with the wa.me link as the fallback when Business isn't installed. Used only on Android
// phones, and never under test automation (the e2e tests read the wa.me link itself).
const BUSINESS_PACKAGE = 'com.whatsapp.w4b'
const WA_ME = /^https:\/\/wa\.me\/(\d+)(?:\?text=(.*))?$/

export function businessIntent(url: string): string {
  const match = WA_ME.exec(url)
  if (!match) return url
  const [, phone, text = ''] = match
  return `intent://send?phone=${phone}${text ? `&text=${text}` : ''}#Intent;scheme=whatsapp;package=${BUSINESS_PACKAGE};S.browser_fallback_url=${encodeURIComponent(url)};end`
}

function onAndroidPhone(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && !navigator.webdriver
}

// The link to open: the WhatsApp Business intent on Android, the wa.me link elsewhere
export function whatsappHref(url: string): string {
  return onAndroidPhone() ? businessIntent(url) : url
}

// Opens WhatsApp from code (after a server reply), the same way
export function openWhatsApp(url: string): void {
  window.location.assign(whatsappHref(url))
}
