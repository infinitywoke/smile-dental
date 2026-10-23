import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { photosWord } from '@/lib/billing'
import { formatDate } from '@/lib/dates'
import { inIndia } from '@/lib/schedule'
import { createPublicClient } from '@/lib/supabase/public'
import { isSharedPrescription, type SharedItem } from '@/lib/share-link'
import { firstName, kannadaDate, messageLanguage, questionsLine } from '@/lib/whatsapp'
import { ScreenLoading } from '@/components/clinic/ui'
import { SharedPrescription } from '@/components/SharedPrescription'

// The page a visit message's link opens (src/lib/actions/visits.ts makes the link): the typed
// prescription on the letterhead and the ticked photos, for 30 days, to anyone with the link and to no
// one else. Kept out of search engines.
export const metadata: Metadata = {
  title: `Your photos · ${siteConfig.name}`,
  robots: { index: false, follow: false },
}

type Shared =
  | { visit_date: string; first_name: string; language: string | null; expires_at: string; photos: SharedItem[] }
  | { expired: true }

// 32 random characters; anything else is not one of the clinic's links
const CODE = /^[A-Za-z0-9_-]{32,128}$/

function Clinic() {
  const degree = siteConfig.dentist.qualifications.split(',')[0].trim()
  return (
    <header className="border-b border-gray-200 pb-4">
      <p className="text-lg font-extrabold text-gray-900">{siteConfig.name}</p>
      <p className="text-sm text-gray-600">{siteConfig.dentist.name}, {degree} · Katapadi</p>
    </header>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-lg flex-1 space-y-5 bg-white px-4 py-6">{children}</main>
}

// "Prescription-12-Oct-2026.jpg": what it is and the visit's date, in letters and numbers only
const fileName = (label: string, date: string, extension: string) =>
  `${`${label} ${date}`.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.${extension}`

async function SharedPhotos({ params }: PageProps<'/r/[token]'>) {
  const { token } = await params
  const { data } = CODE.test(token) ? await createPublicClient().rpc('shared_photos', { p_token: token }) : { data: null }
  const shared = data as Shared | null

  if (!shared || 'expired' in shared) {
    return (
      <Page>
        <Clinic />
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{shared ? 'This link has expired' : "This link doesn't work"}</h1>
        <p className="text-base text-gray-700">
          {shared ? `Photo links work for 30 days. For your photos, call or WhatsApp us on ${siteConfig.phone}.` : `Check that the whole link was copied. ${questionsLine()}`}
        </p>
      </Page>
    )
  }

  const language = messageLanguage(shared.language)
  const kn = language === 'kn'
  const date = kn ? kannadaDate(shared.visit_date, true) : formatDate(shared.visit_date)
  const until = inIndia(shared.expires_at).date
  const labels = shared.photos.map((p) => p.label)
  const save = kn ? 'ಉಳಿಸಿ' : 'Save'
  // Two X-rays read "X-ray 1", "X-ray 2"
  const numbered = labels.map((label, i) => (labels.filter((l) => l === label).length > 1 ? `${label} ${labels.slice(0, i + 1).filter((l) => l === label).length}` : label))
  return (
    <Page>
      <Clinic />
      <div lang={kn ? 'kn' : 'en'} className="space-y-1">
        <p className="text-base text-gray-700">{kn ? `ನಮಸ್ಕಾರ ${firstName(shared.first_name)} ಅವರೇ,` : `Dear ${firstName(shared.first_name)},`}</p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{kn ? photosWord(labels, 'kn') : `Your ${photosWord(labels)}`}</h1>
        <p className="text-sm text-gray-600">{date}</p>
      </div>
      {shared.photos.map((item, i) => (
        <figure key={i} className="space-y-2">
          <figcaption className="font-semibold text-gray-900">{numbered[i]}</figcaption>
          {isSharedPrescription(item) ? (
            <SharedPrescription
              sheet={{ firstName: firstName(shared.first_name), date: formatDate(shared.visit_date), medicines: item.medicines, advice: item.advice }}
              alt={numbered[i]} fileName={fileName(numbered[i], formatDate(shared.visit_date), 'jpg')} saveLabel={save} />
          ) : (
            <>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- a 30-day link to the clinic's private photo */}
                <img src={item.url} alt={numbered[i]} className="w-full rounded-xl bg-gray-50 ring-1 ring-gray-200" />
              </a>
              <a href={`${item.url}&download=${encodeURIComponent(fileName(numbered[i], formatDate(shared.visit_date), new URL(item.url).pathname.split('.').pop() || 'jpg'))}`}
                className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-base font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
                <Download className="h-5 w-5" aria-hidden="true" /> {save}
              </a>
            </>
          )}
        </figure>
      ))}
      <p lang={kn ? 'kn' : 'en'} className="text-sm text-gray-600">
        {kn ? `ಈ ಲಿಂಕ್ ${kannadaDate(until, true)} ರವರೆಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ.` : `This link works until ${formatDate(until)}.`} {questionsLine(language)}
      </p>
    </Page>
  )
}

export default function SharedPhotosPage(props: PageProps<'/r/[token]'>) {
  return (
    <Suspense fallback={<ScreenLoading />}>
      <SharedPhotos {...props} />
    </Suspense>
  )
}
