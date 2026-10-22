import Link from 'next/link'
import { AlertTriangle, ChevronLeft } from 'lucide-react'

// Shared building blocks for Clinic OS screens

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-2 inline-flex min-h-12 items-center gap-1 pr-4 pl-2 text-base font-medium text-blue-600">
      <ChevronLeft className="h-5 w-5" />
      {label}
    </Link>
  )
}

export function MedicalAlert({ alerts }: { alerts: string | null }) {
  if (!alerts) return null
  return (
    <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p><span className="font-semibold">Medical alert:</span> {alerts}</p>
    </div>
  )
}

// A Cockpit readout tile: a small label over a number or a short word. Label and value are one sentence
// to a screen reader ("Visits 5").
export function Readout({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return (
    <p className={`flex min-w-0 flex-col gap-1.5 rounded-[14px] p-3 ring-1 ${tone === 'amber' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-gray-200'}`}>
      <span className="text-xs font-bold text-gray-500">{label}</span>{' '}
      <span className="hud-mono truncate text-lg font-bold text-gray-900">{value}</span>
    </p>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 ${className}`}>{children}</div>
}

// Shown while a Clinic OS screen loads its data
export function ScreenLoading() {
  return (
    <div className="flex justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
    </div>
  )
}
