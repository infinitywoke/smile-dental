import { Suspense } from 'react'
import Image from 'next/image'
import type { Metadata } from 'next'
import { LogOut } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { getDoctor } from '@/lib/auth'

export const metadata: Metadata = {
  title: `Clinic OS - ${siteConfig.name}`,
  robots: { index: false },
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
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="relative h-8 w-8">
              <Image src={siteConfig.media.logo} alt={siteConfig.name} fill sizes="32px" className="object-contain" />
            </div>
            <span className="font-bold text-blue-700">Clinic OS</span>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">{children}</main>
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
