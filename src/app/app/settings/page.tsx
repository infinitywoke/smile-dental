import Link from 'next/link'
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { Bell, ChevronRight } from 'lucide-react'
import { getDoctor } from '@/lib/auth'
import { THEME_COOKIE, themeFrom } from '@/lib/theme'
import { Card, ScreenLoading } from '@/components/clinic/ui'
import { PracticeTabs } from '@/components/clinic/PracticeTabs'
import { SignOutButton } from '@/components/clinic/SignOutButton'
import { ThemeSwitch } from '@/components/clinic/ThemeSwitch'

async function SettingsContent() {
  await getDoctor()
  const store = await cookies()
  const theme = themeFrom(store.get(THEME_COOKIE)?.value)
  return (
    <div className="space-y-5">
      <PracticeTabs />
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
      <Card className="space-y-3">
        <div>
          <p className="font-semibold text-gray-900">Look</p>
          <p className="text-sm text-gray-500">Light reads best in a bright surgery. Phone follows this phone&apos;s dark or light mode.</p>
        </div>
        <ThemeSwitch initial={theme} />
      </Card>
      <Link href="/app/notifications" className="flex min-h-14 items-center gap-3 rounded-2xl bg-white px-4 font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200">
        <Bell className="h-5 w-5 text-gray-500" aria-hidden="true" />
        <span className="flex-1">Notifications</span>
        <ChevronRight className="h-5 w-5 text-gray-400" aria-hidden="true" />
      </Link>
      <div className="pt-4">
        <SignOutButton />
      </div>
    </div>
  )
}

// Each screen streams in behind its own placeholder, so navigation is instant
export default function SettingsPage() {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <SettingsContent />
    </Suspense>
  )
}
