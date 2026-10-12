'use client'

import { LogOut } from 'lucide-react'

// Notes typed but not saved are kept on the phone as a safety net. Signing out removes them, so
// nothing about a patient is left behind on a phone that is lent or sold.
function clearDrafts() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('visit-draft:')) localStorage.removeItem(key)
    }
  } catch {
    // Storage can be unavailable; signing out still goes ahead
  }
}

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post" onSubmit={clearDrafts}>
      <button type="submit"
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-base font-semibold text-gray-700 ring-1 ring-gray-300">
        <LogOut className="h-5 w-5 text-gray-500" /> Sign out
      </button>
    </form>
  )
}
