import { Suspense } from 'react'
import type { Metadata, Viewport } from 'next'
import { siteConfig } from '@/config/site'
import { getDoctor } from '@/lib/auth'
import { BottomNav } from '@/components/clinic/BottomNav'

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
  return (
    <>
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
