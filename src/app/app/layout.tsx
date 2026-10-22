import { Suspense } from 'react'
import { cookies } from 'next/headers'
import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Manrope } from 'next/font/google'
import { siteConfig } from '@/config/site'
import { getDoctor } from '@/lib/auth'
import { getStockAlerts } from '@/lib/data/stock'
import { todayInIndia } from '@/lib/dates'
import { THEME_COOKIE, themeFrom } from '@/lib/theme'
import { BottomNav } from '@/components/clinic/BottomNav'
import { PageTransition } from '@/components/clinic/PageTransition'
import { ThemeColor } from '@/components/clinic/ThemeColor'
import { OutboxSync } from '@/components/clinic/Outbox'
import { OfflineCopies } from '@/components/clinic/OfflineCopies'
import { WhatsAppBusiness } from '@/components/clinic/WhatsAppBusiness'

const body = Manrope({ subsets: ['latin'], variable: '--font-hud-body' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-hud-mono' })

// The manifest is linked only here, so "Add to Home screen" installs Clinic OS, not the website.
export const metadata: Metadata = {
  title: `Clinic OS - ${siteConfig.name}`,
  robots: { index: false },
  manifest: '/clinic.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Clinic OS',
    statusBarStyle: 'default',
  },
}

// Light until the page knows his choice (ThemeColor then follows it)
export const viewport: Viewport = {
  themeColor: '#FAF6EE',
}

// The Cockpit: light until the session is checked; then the dentist's choice for this phone (Settings)
export default function ClinicLayout({ children }: LayoutProps<'/app'>) {
  return (
    <div className={`hud hud-grid flex min-h-dvh flex-col ${body.variable} ${mono.variable}`} data-theme="light">
      <Suspense fallback={<LoadingScreen />}>
        <DoctorGate>{children}</DoctorGate>
      </Suspense>
    </div>
  )
}

// Nothing under /app renders until the session is verified.
async function DoctorGate({ children }: { children: React.ReactNode }) {
  await getDoctor()
  const theme = themeFrom((await cookies()).get(THEME_COOKIE)?.value)
  // Stock low or expiring soon: a dot on Practice (stock actions refresh the layout, so it stays right)
  const stock = await getStockAlerts(todayInIndia())
  return (
    <div id="hud-root" className="hud hud-grid flex flex-1 flex-col text-gray-900" data-theme={theme}>
      <ThemeColor />
      {/* Sends what was saved with no signal once it is back, and says how it stands */}
      <OutboxSync />
      {/* Keeps the screens on the phone, so the app opens with no signal */}
      <OfflineCopies />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-5 pb-28"><PageTransition>{children}</PageTransition></main>
      <BottomNav stockAlert={!!stock && stock.low + stock.expiring > 0} />
      <WhatsAppBusiness />
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
    </div>
  )
}
