import type { Metadata } from 'next'
import { Instrument_Serif, Manrope } from 'next/font/google'
import { siteConfig } from '@/config/site'
import { MobileBar } from '@/components/home/MobileBar'
import { SiteFooter } from '@/components/home/SiteFooter'
import { SiteHeader } from '@/components/home/SiteHeader'
import { SourceTracker } from '@/components/site/SourceTracker'
import './home.css'

const display = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-display' })
const body = Manrope({ subsets: ['latin'], variable: '--font-body' })

// The pages' own addresses in their metadata (canonical, the Markdown copy) are on the clinic's domain
export const metadata: Metadata = { metadataBase: new URL(siteConfig.url), ...(siteConfig.demo ? { robots: { index: false, follow: false } } : {}) }

// The website (D): its own fonts and styles, and on every page the header, the visit details at the
// foot and the phone bar.
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div id="top" className={`h-root ${display.variable} ${body.variable}`}>
      <SourceTracker />
      <SiteHeader />
      {children}
      <SiteFooter />
      <MobileBar />
    </div>
  )
}
