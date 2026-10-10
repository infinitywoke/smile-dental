import Link from 'next/link'
import Form from 'next/form'
import { AlertTriangle, ChevronLeft } from 'lucide-react'

// Shared building blocks for Clinic OS screens

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
      <ChevronLeft className="h-4 w-4" />
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

export function SearchBox({ defaultValue = '' }: { defaultValue?: string }) {
  return (
    <Form action="/app/patients" className="flex gap-2">
      <input name="q" type="search" defaultValue={defaultValue} placeholder="Search name or phone"
        className="block w-full rounded-full border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600" />
      <button type="submit" className="rounded-full bg-gray-900 px-5 text-sm font-semibold text-white">Search</button>
    </Form>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 ${className}`}>{children}</div>
}
