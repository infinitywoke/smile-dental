import { Suspense } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { siteConfig } from '@/config/site'
import { ForgetKeptScreens } from '@/components/clinic/OfflineLock'
import { signIn } from './actions'

export const metadata: Metadata = {
  title: `Clinic Login - ${siteConfig.name}`,
  robots: { index: false },
}

const errorMessages: Record<string, string> = {
  'not-allowed': 'This account is not allowed to use Clinic OS.',
  invalid: 'Wrong email or password. Please try again.',
}

const inputClass =
  'block w-full rounded-lg border-0 px-4 py-3 text-base text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600'

export default function LoginPage({ searchParams }: PageProps<'/login'>) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-blue-50 px-4 py-12">
      {/* Only a signed-out phone sees this page: the screens kept for no signal go */}
      <ForgetKeptScreens />
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg ring-1 ring-gray-200">
        <div className="text-center">
          <div className="relative mx-auto h-16 w-16">
            <Image src={siteConfig.media.logo} alt={siteConfig.name} fill sizes="64px" className="object-contain" priority />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-900">Clinic OS</h1>
          <p className="mt-1 text-sm text-gray-500">{siteConfig.name}</p>
        </div>

        <Suspense fallback={null}>
          <LoginError searchParams={searchParams} />
        </Suspense>

        <form action={signIn} className="mt-8 space-y-4">
          <Suspense fallback={null}>
            <NextField searchParams={searchParams} />
          </Suspense>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-gray-700">Email</label>
            <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-gray-700">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
          </div>
          <button
            type="submit"
            className="w-full rounded-full bg-blue-600 px-5 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>

      <Link href="/" className="mt-6 inline-flex min-h-12 items-center text-sm text-gray-500 hover:text-blue-600">
        &larr; Back to website
      </Link>
    </main>
  )
}

// Carries the page the doctor was opening through sign-in
async function NextField({ searchParams }: { searchParams: PageProps<'/login'>['searchParams'] }) {
  const { next } = await searchParams
  return typeof next === 'string' ? <input type="hidden" name="next" value={next} /> : null
}

async function LoginError({ searchParams }: { searchParams: PageProps<'/login'>['searchParams'] }) {
  const { error } = await searchParams
  const message = typeof error === 'string' ? errorMessages[error] : undefined
  if (!message) return null

  return (
    <div className="mt-6 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
      {message}
    </div>
  )
}
