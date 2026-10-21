import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, Flame, UserPlus } from 'lucide-react'
import { LUNCH_SPAN, ringDash, type StripBlock } from '@/lib/cockpit'
import { formatRupees } from '@/lib/pricing'
import { formatBlock, inIndia } from '@/lib/schedule'
import { StartVisitButton } from './StartVisitButton'
import { Countdown, LiveClock, NowMarker, RunningLate } from './CockpitLive'

type Props = {
  status: { open: boolean; text: string }
  seen: number
  total: number
  // One mark per patient today, in time order: seen or still to come
  marks: boolean[]
  next: { appointmentId: string; patientId: string; name: string; startsAt: string; detail: string; alert: boolean } | null
  collected: number
  requests: number
  owed: number
  strip: StripBlock[]
  late: { id: string; name: string; startsAt: string; phone: string }[]
  // Game touches (Settings): the ring glows when everyone today is seen; the all-sent streak in days
  fun: boolean
  streak: number
}

const R = 92
const CIRCUMFERENCE = 2 * Math.PI * R
const label = 'hud-mono text-[10px] tracking-[0.14em] text-gray-500'

// Today at a glance, like an instrument panel: whether the clinic is open, how much of the day is done,
// who is next, the money, what is waiting, and the day's appointments on one strip
export function Cockpit({ status, seen, total, marks, next, collected, requests, owed, strip, late, fun, streak }: Props) {
  const allSeen = fun && total > 0 && seen >= total
  return (
    <section aria-label="Cockpit" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className={`flex min-w-0 flex-1 items-center gap-2 text-[13px] leading-snug font-bold text-balance ${status.open ? 'text-green-700' : 'text-gray-600'}`}>
          <span className={`h-2 w-2 shrink-0 rounded-full ${status.open ? 'bg-[var(--hud-green)] shadow-[0_0_0_4px_rgba(61,220,151,0.18)]' : 'bg-gray-400'}`} aria-hidden="true" />
          <span>{status.text}</span>
        </span>
        <LiveClock />
      </div>

      <div className="relative mx-auto flex h-48 w-48 items-center justify-center">
        <svg viewBox="0 0 220 220" className={`absolute inset-0 h-full w-full${allSeen ? ' hud-ring-done' : ''}`} aria-hidden="true">
          <circle cx="110" cy="110" r={R} fill="none" strokeWidth="12" className="stroke-gray-200" />
          <circle cx="110" cy="110" r={R} fill="none" strokeWidth="12" strokeLinecap="round" stroke="var(--hud-amber)"
            strokeDasharray={ringDash(seen, total, CIRCUMFERENCE)} transform="rotate(-90 110 110)" />
          <circle cx="110" cy="110" r="74" fill="none" strokeWidth="1" strokeDasharray="2 7" stroke="var(--hud-amber)" strokeOpacity="0.4" />
          {marks.slice(0, 16).map((done, i) => (
            <circle key={i} cx="110" cy="6" r={done ? 4 : 3.5} transform={`rotate(${(360 / Math.min(marks.length, 16)) * i} 110 110)`}
              className={done ? '' : 'fill-gray-300'} fill={done ? 'var(--hud-amber)' : undefined} />
          ))}
        </svg>
        <div className="flex flex-col items-center gap-1.5">
          <span className="hud-mono text-5xl leading-none font-bold">{seen}<span className="text-3xl text-gray-500">/{total}</span></span>
          <span className={label}>SEEN TODAY</span>
        </div>
      </div>

      {(allSeen || (fun && streak >= 2)) && (
        <div className="flex flex-wrap justify-center gap-2">
          {allSeen && (
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-amber-50 px-3 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />Everyone has been seen
            </span>
          )}
          {fun && streak >= 2 && (
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-gray-700 ring-1 ring-gray-200">
              <Flame className="h-4 w-4 text-[var(--hud-amber-text)]" aria-hidden="true" />
              <span className="hud-mono">{streak}</span> days in a row, every visit sent
            </span>
          )}
        </div>
      )}

      {next ? (
        <div className="flex items-center gap-3 rounded-[18px] bg-white py-3.5 pr-3.5 pl-4 ring-1 ring-[color:var(--hud-amber)]">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="hud-mono text-[10px] tracking-[0.14em] text-[var(--hud-amber-text)]">
              NEXT · {formatBlock(inIndia(next.startsAt).time)}<Countdown startsAt={next.startsAt} />
            </p>
            <p className="flex items-center gap-1.5 truncate text-lg font-extrabold">
              {next.name}
              {next.alert && <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" aria-label="Has medical alert" />}
            </p>
            {next.detail && <p className="truncate text-sm text-gray-500">{next.detail}</p>}
          </div>
          <StartVisitButton patientId={next.patientId} appointmentId={next.appointmentId} label="Start visit"
            className="min-h-12 shrink-0 rounded-[14px] bg-[#FFC46B] px-4 text-[15px] font-extrabold text-[#0B2357] transition-transform active:scale-95 disabled:opacity-70" />
        </div>
      ) : (
        <p className="rounded-[18px] bg-white p-4 text-center text-sm font-semibold text-gray-500 ring-1 ring-gray-200">No one else is booked today.</p>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <div className="space-y-1.5 rounded-[14px] bg-white p-3 ring-1 ring-gray-200">
          <p className={label}>COLLECTED</p>
          <p className="hud-mono text-lg font-bold">{formatRupees(collected)}</p>
        </div>
        <a href="#needs-you" className={`space-y-1.5 rounded-[14px] p-3 ring-1 ${requests > 0 ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-gray-200'}`}>
          <p className={`flex items-center justify-between ${label} ${requests > 0 ? 'text-amber-800' : ''}`}>
            REQUESTS{requests > 0 && <span className="h-2 w-2 rounded-full bg-[var(--hud-amber)] shadow-[0_0_8px_var(--hud-amber)]" aria-hidden="true" />}
          </p>
          <p className="hud-mono text-lg font-bold">{requests > 0 ? `${requests} new` : 'None'}</p>
        </a>
        <a href="#needs-you" className="space-y-1.5 rounded-[14px] bg-white p-3 ring-1 ring-gray-200">
          <p className={label}>OWED</p>
          <p className="hud-mono text-lg font-bold">{formatRupees(owed)}</p>
        </a>
      </div>

      <div aria-label="Today's appointments on the day" role="img">
        <div className="hud-mono relative h-3 text-[9px] text-gray-500" aria-hidden="true">
          <span className="absolute left-0">8:30</span>
          <span className="absolute" style={{ left: `${LUNCH_SPAN.left - 3}%` }}>1:10</span>
          <span className="absolute" style={{ left: `${LUNCH_SPAN.left + LUNCH_SPAN.width}%` }}>2:30</span>
          <span className="absolute right-0">7:50</span>
        </div>
        <div className="relative mt-1.5 h-[22px] rounded-md bg-gray-100">
          <span className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,var(--color-gray-300)_0_3px,transparent_3px_7px)] opacity-60"
            style={{ left: `${LUNCH_SPAN.left}%`, width: `${LUNCH_SPAN.width}%` }} />
          {strip.map((block, i) => (
            <span key={i} className={`absolute inset-y-[3px] box-border rounded-[3px] ${
              block.state === 'done' ? 'bg-[var(--hud-amber)] opacity-55' : block.state === 'now' ? 'bg-[var(--hud-amber)]' : 'border-[1.5px] border-gray-400'
            }`} style={{ left: `${block.left}%`, width: `${block.width}%` }} />
          ))}
          <NowMarker />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Link href="/app/patients/new"
          className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white text-[11px] font-bold text-gray-900 ring-1 ring-gray-200 transition-transform active:scale-[0.97]">
          <UserPlus className="h-5 w-5 text-[var(--hud-amber-text)]" aria-hidden="true" />Walk-in
        </Link>
        <RunningLate patients={late} />
        <a href="#free-times"
          className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl bg-white text-[11px] font-bold text-gray-900 ring-1 ring-gray-200 transition-transform active:scale-[0.97]">
          <Clock className="h-5 w-5 text-[var(--hud-amber-text)]" aria-hidden="true" />Block time
        </a>
      </div>
    </section>
  )
}
