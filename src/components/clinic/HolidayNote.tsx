import { holidaysOn, type HolidayKind } from '@/lib/holidays'

// Gold: filled for a holiday (offices and schools shut), a ring for a festival
export function HolidayDot({ kind }: { kind: HolidayKind }) {
  return (
    <span aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${kind === 'holiday' ? 'bg-[var(--hud-gold)]' : 'ring-1 ring-inset ring-[var(--hud-gold)]'}`} />
  )
}

// A day's holidays and festivals in one line under its date: "Holiday: Balipadyami, Deepavali"
export function HolidayNote({ date, className = '' }: { date: string; className?: string }) {
  const day = holidaysOn(date)
  if (day.length === 0) return null
  const kind = day[0].kind
  return (
    <p className={`flex items-center gap-1.5 text-sm font-semibold text-gray-700 ${className}`}>
      <HolidayDot kind={kind} />
      <span className="min-w-0">{kind === 'holiday' ? 'Holiday' : 'Festival'}: {day.map((h) => h.name).join(' · ')}</span>
    </p>
  )
}
