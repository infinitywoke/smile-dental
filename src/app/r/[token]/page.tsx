import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Download } from 'lucide-react'
import { linkWord } from '@/lib/billing'
import { degreeOf } from '@/lib/clinic'
import { formatRupees } from '@/lib/pricing'
import { formatDate } from '@/lib/dates'
import { inIndia } from '@/lib/schedule'
import type { Letterhead } from '@/lib/prescription-image'
import { createPublicClient } from '@/lib/supabase/public'
import { isSharedBill, isSharedPrescription, type SharedBill, type SharedItem } from '@/lib/share-link'
import { dateIn, firstName, kannadaDate, messageHeader, messageLanguage, questionsLine, type MessageLanguage } from '@/lib/whatsapp'
import { ScreenLoading } from '@/components/clinic/ui'
import { SharedPrescription } from '@/components/SharedPrescription'

// The page a visit message's link opens (src/lib/actions/visits.ts makes the link): the typed
// prescription on the letterhead, the ticked photos and the bill, for 30 days, to anyone with the link
// and to no one else. Kept out of search engines. The page names the clinic and dentist the link is from
// (shared_photos tells it), so its title names none.
export const metadata: Metadata = {
  title: 'Your visit',
  robots: { index: false, follow: false },
}

// What a link says about its clinic (shared_photos), whoever opens it: only what the page prints. The
// dentist is the one the prescription is from, if the clinic has one.
type SharedClinic = {
  name: string
  place: string
  phone: string
  address: string
  logo: string | null
  dentist: { name: string; qualifications: string | null; registration: string | null; signature: string | null } | null
}
type Shared =
  | { visit_date: string; first_name: string; language: string | null; expires_at: string; photos: SharedItem[]; clinic: SharedClinic }
  // An expired link still says which clinic to call, and nothing more
  | { expired: true; clinic: { name: string; place: string; phone: string } }

// 32 random characters; anything else is not one of the clinic's links
const CODE = /^[A-Za-z0-9_-]{32,128}$/

function ClinicHeader({ name, place, dentist }: { name: string; place: string; dentist?: SharedClinic['dentist'] }) {
  const degree = dentist ? degreeOf(dentist) : ''
  return (
    <header className="border-b border-gray-200 pb-4">
      <p className="text-lg font-extrabold text-gray-900">{name}</p>
      <p className="text-sm text-gray-600">{dentist ? `${dentist.name}${degree ? `, ${degree}` : ''} · ${place}` : place}</p>
    </header>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-lg flex-1 space-y-5 bg-white px-4 py-6">{children}</main>
}

// The bill as it stood when the message went, in the words of the visit message
function Bill({ bill, language }: { bill: SharedBill; language: MessageLanguage }) {
  const t = language === 'hi'
    ? { title: 'बिल', charges: 'इलाज और शुल्क', charge: 'शुल्क', total: 'कुल', paid: 'भुगतान किया', cash: 'नकद', earlierDue: 'पिछली विज़िट का बकाया', earlierAdvance: 'पिछली विज़िट की अग्रिम राशि', due: 'बकाया राशि', advance: 'हमारे पास अग्रिम राशि', full: 'पूरा भुगतान हो गया' }
    : language === 'kn'
    ? { title: 'ಬಿಲ್', charges: 'ಚಿಕಿತ್ಸೆ ಮತ್ತು ಶುಲ್ಕ', charge: 'ಶುಲ್ಕ', total: 'ಒಟ್ಟು', paid: 'ಪಾವತಿಸಿದ್ದು', cash: 'ನಗದು', earlierDue: 'ಇತರ ಭೇಟಿಗಳ ಬಾಕಿ', earlierAdvance: 'ಇತರ ಭೇಟಿಗಳ ಮುಂಗಡ', due: 'ಬಾಕಿ ಮೊತ್ತ', advance: 'ನಮ್ಮಲ್ಲಿರುವ ಮುಂಗಡ', full: 'ಪೂರ್ತಿ ಪಾವತಿಯಾಗಿದೆ' }
    : { title: 'Bill', charges: 'Treatment & charges', charge: 'Charge', total: 'Total', paid: 'Paid', cash: 'Cash', earlierDue: 'Due from other visits', earlierAdvance: 'Advance from other visits', due: 'Balance due', advance: 'Advance with us', full: 'Paid in full' }
  const amount = (n: number) => (n < 0 ? `−${formatRupees(-n)}` : formatRupees(n))
  const methods = bill.methods.map((m) => (m === 'Cash' ? t.cash : m)).join(' + ')
  const row = 'flex items-baseline justify-between gap-3 py-1.5'
  return (
    <section aria-label={t.title} lang={language} className="space-y-2 rounded-xl p-4 ring-1 ring-gray-200">
      <h2 className="font-semibold text-gray-900">{t.title}</h2>
      {bill.lines.length > 0 && (
        <div className="divide-y divide-gray-100 text-base">
          <p className="pb-1 text-sm font-medium text-gray-500">{t.charges}</p>
          {bill.lines.map((line, i) => (
            <p key={i} className={row}>
              <span className="min-w-0 text-gray-800">{line.description || t.charge}</span>
              <span className="shrink-0 text-gray-900 tabular-nums">{amount(line.amount)}</span>
            </p>
          ))}
          <p className={`${row} font-semibold text-gray-900`}><span>{t.total}</span><span className="tabular-nums">{amount(bill.total)}</span></p>
        </div>
      )}
      <div className="space-y-0.5 border-t border-gray-200 pt-2 text-base">
        {bill.paid > 0 && <p className={row}><span className="text-gray-700">{t.paid}{methods ? ` (${methods})` : ''}</span><span className="tabular-nums">{amount(bill.paid)}</span></p>}
        {bill.earlier > 0 && <p className={row}><span className="text-gray-700">{t.earlierDue}</span><span className="tabular-nums">{amount(bill.earlier)}</span></p>}
        {bill.earlier < 0 && <p className={row}><span className="text-gray-700">{t.earlierAdvance}</span><span className="tabular-nums">{amount(-bill.earlier)}</span></p>}
        <p className={`${row} font-bold text-gray-900`}>
          <span>{bill.due > 0 ? t.due : bill.due < 0 ? t.advance : t.full}</span>
          {bill.due !== 0 && <span className="tabular-nums">{amount(Math.abs(bill.due))}</span>}
        </p>
      </div>
    </section>
  )
}

// "Prescription-12-Oct-2026.jpg": what it is and the visit's date, in letters and numbers only
const fileName = (label: string, date: string, extension: string) =>
  `${`${label} ${date}`.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.${extension}`

async function SharedPhotos({ params }: PageProps<'/r/[token]'>) {
  const { token } = await params
  const { data } = CODE.test(token) ? await createPublicClient().rpc('shared_photos', { p_token: token }) : { data: null }
  const shared = data as Shared | null

  // An unknown link names no clinic and gives no phone number: whoever typed it may be a stranger
  if (!shared) {
    return (
      <Page>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">This link doesn&apos;t work</h1>
        <p className="text-base text-gray-700">Check that the whole link was copied, or ask the clinic that sent it for a new one.</p>
      </Page>
    )
  }
  if ('expired' in shared) {
    return (
      <Page>
        <ClinicHeader name={shared.clinic.name} place={shared.clinic.place} />
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">This link has expired</h1>
        <p className="text-base text-gray-700">
          These links work for 30 days. For your prescription, photos or bill, call or WhatsApp us on {shared.clinic.phone}.
        </p>
      </Page>
    )
  }

  const { clinic } = shared
  // The prescription is drawn on the clinic's letterhead, signed by its dentist
  const letterhead: Letterhead | null = clinic.dentist ? { clinic, dentist: clinic.dentist } : null
  const language = messageLanguage(shared.language)
  const kn = language === 'kn'
  const date = dateIn(language, shared.visit_date)
  const until = inIndia(shared.expires_at).date
  const bill = shared.photos.find(isSharedBill)
  const shown = shared.photos.filter((item) => !isSharedBill(item)) as Exclude<SharedItem, SharedBill>[]
  const labels = shown.map((p) => p.label)
  // "prescription, X-ray and bill", as the message said it
  const holds = linkWord(shared.photos.map((p) => p.label), language)
  const save = language === 'hi' ? 'सेव करें' : kn ? 'ಉಳಿಸಿ' : 'Save'
  // Two X-rays read "X-ray 1", "X-ray 2"
  const numbered = labels.map((label, i) => (labels.filter((l) => l === label).length > 1 ? `${label} ${labels.slice(0, i + 1).filter((l) => l === label).length}` : label))
  return (
    <Page>
      <ClinicHeader name={clinic.name} place={clinic.place} dentist={clinic.dentist} />
      <div lang={language} className="space-y-1">
        <p className="text-base text-gray-700">{messageHeader(shared.first_name, language)[0]}</p>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{language === 'hi' ? holds : kn ? `ನಿಮ್ಮ ${holds}` : `Your ${holds}`}</h1>
        <p className="text-sm text-gray-600">{date}</p>
      </div>
      {shown.map((item, i) => (
        <figure key={i} className="space-y-2">
          <figcaption className="font-semibold text-gray-900">{numbered[i]}</figcaption>
          {isSharedPrescription(item) ? (
            letterhead ? (
              <SharedPrescription
                sheet={{ patient: item.patient ?? firstName(shared.first_name), age: item.age ?? null, date: formatDate(shared.visit_date), medicines: item.medicines, advice: item.advice }}
                letterhead={letterhead} alt={numbered[i]} fileName={fileName(numbered[i], formatDate(shared.visit_date), 'jpg')} saveLabel={save} />
            ) : (
              <p className="rounded-xl bg-gray-50 p-4 text-base text-gray-700 ring-1 ring-gray-200">This prescription can&apos;t be shown here. Please call {clinic.phone}.</p>
            )
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
      {bill && <Bill bill={bill} language={language} />}
      <p lang={language} className="text-sm text-gray-600">
        {language === 'hi' ? `यह लिंक ${dateIn(language, until)} तक चलेगा।` : kn ? `ಈ ಲಿಂಕ್ ${kannadaDate(until, true)} ರವರೆಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ.` : `This link works until ${formatDate(until)}.`} {questionsLine({ clinic }, language)}
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
