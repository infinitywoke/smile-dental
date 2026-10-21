import { Instrument_Serif, Manrope } from 'next/font/google'
import { SourceTracker } from '@/components/site/SourceTracker'
import './home.css'

const display = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-display' })
const body = Manrope({ subsets: ['latin'], variable: '--font-body' })

// The new homepage (website D): its own fonts and styles. At /preview until it is approved.
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${body.variable}`}>
      <SourceTracker />
      {children}
    </div>
  )
}
