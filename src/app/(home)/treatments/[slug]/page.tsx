import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getWebsiteTreatments } from '@/lib/data/price-list'
import { treatmentGroups } from '@/lib/price-list'
import { priceForPatients } from '@/lib/pricing'
import { treatmentJsonLd } from '@/lib/structured-data'
import { clinicWhatsappLink } from '@/lib/website-whatsapp'
import { JsonLd } from '@/components/home/JsonLd'
import { PageHead } from '@/components/home/PageHead'

type Props = {
  params: Promise<{ slug: string }>
}

const find = async (slug: string) => (await getWebsiteTreatments()).find((t) => t.slug === slug)

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const treatment = await find((await params).slug)
  if (!treatment) return {}
  return {
    title: `${treatment.name} · Smile Dental Clinic, Katapadi`,
    description: treatment.shortDescription || `${treatment.name} at Smile Dental Clinic, Katapadi, with its prices.`,
    alternates: { canonical: `/treatments/${treatment.slug}`, types: { 'text/markdown': `/treatments/${treatment.slug}.md` } },
  }
}

// Every treatment on the price list is built ahead; one the stock spreadsheet adds later is built the
// first time it is asked for
export async function generateStaticParams() {
  return (await getWebsiteTreatments()).map((t) => ({ slug: t.slug }))
}

// Awaiting params outside <Suspense> keeps unknown slugs returning a real 404 instead of a streamed
// not-found page.
export const instant = false

// One treatment from the price list: what it is, every price, and a way to book it or ask about it
export default async function TreatmentPage({ params }: Props) {
  const { slug } = await params
  const list = await getWebsiteTreatments()
  const treatment = list.find((t) => t.slug === slug)
  if (!treatment) notFound()
  const group = treatmentGroups(list).find((g) => g.items.some((t) => t.slug === treatment.slug))
  const related = (group?.items ?? []).filter((t) => t.slug !== treatment.slug)
  const reason = !group || group.id === 'other' ? 'unsure' : group.id

  return (
    <>
      <JsonLd data={treatmentJsonLd(treatment)} />
      <PageHead back={{ href: '/treatments', label: 'All treatments and prices' }} eyebrow={group?.name}
        title={treatment.name} lead={treatment.shortDescription} />

      <section className="h-section mist first">
        <div className="h-wrap h-split">
          <div className="h-col h-price-card" style={{ flex: '1.4 1 460px' }}>
            <h2 className="h-serif h-h3">Prices</h2>
            {treatment.description && <p className="h-small">{treatment.description}</p>}
            <div className="h-price-list">
              {(treatment.pricing ?? []).map((p) => (
                <div key={p.detail} className="h-leader-row">
                  <span>{p.detail}</span>
                  <span className="h-leader" />
                  <strong>{priceForPatients(p.cost)}</strong>
                </div>
              ))}
            </div>
            <p className="h-hint">The clinic&apos;s own prices. Dr. Rahil examines first, and explains the options and the cost before any treatment.</p>
          </div>
          <div className="h-col h-side-card" style={{ flex: '1 1 300px' }}>
            <h2 className="h-serif h-h3">Book a visit</h2>
            <p className="h-small">Pick a free time from Dr. Rahil&apos;s calendar. The clinic confirms your time on WhatsApp.</p>
            <Link href={`/book?reason=${reason}`} className="h-btn amber wide">Book appointment</Link>
            <a href={clinicWhatsappLink(`Hello, I have a question about ${treatment.name}.`)} target="_blank" rel="noopener noreferrer"
              className="h-linkbtn">Ask about it on WhatsApp</a>
          </div>
        </div>
        {related.length > 0 && (
          <div className="h-wrap h-related">
            <p className="h-eyebrow">See also</p>
            {related.map((t) => (
              <Link key={t.slug} href={`/treatments/${t.slug}`} className="h-booklink">{t.name}</Link>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
