import { Suspense } from 'react'
import Image from 'next/image'
import type { Metadata, Viewport } from 'next'
import { siteConfig } from '@/config/site'
import { getDoctor } from '@/lib/auth'
import { isPracticeMode } from '@/lib/practice'
import { BottomNav } from '@/components/clinic/BottomNav'
import { HeaderMenu } from '@/components/clinic/HeaderMenu'

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

export const viewport: Viewport = {
  themeColor: '#2563eb',
}

export default function ClinicLayout({ children }: LayoutProps<'/app'>) {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <Suspense fallback={<LoadingScreen />}>
        <DoctorGate>{children}</DoctorGate>
      </Suspense>
    </div>
  )
}

// Nothing under /app renders until the session is verified.
async function DoctorGate({ children }: { children: React.ReactNode }) {
  await getDoctor()
  const practice = await isPracticeMode()

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8">
              <Image src={siteConfig.media.logo} alt={siteConfig.name} fill sizes="32px" className="object-contain" />
            </div>
            <span className="font-bold text-blue-700">Clinic OS</span>
          </div>
          <HeaderMenu practice={practice} />
        </div>
      </header>
      {practice && (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-900">
          Practice mode: new patients are marked TEST
        </div>
      )}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-5 pb-28">{children}</main>
      <BottomNav />
    </>
  )
}

function LoadingScreen() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
    </div>
  )
}
