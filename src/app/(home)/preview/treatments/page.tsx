import Link from 'next/link'
import type { Metadata } from 'next'
import { ChevronRight } from 'lucide-react'
import { homeServices, treatments } from '@/config/site'
import { priceForPatients } from '@/lib/pricing'
import { PageHead } from '@/components/home/PageHead'
import { sitePath } from '@/components/home/site-links'

export const metadata: Metadata = {
  title: 'Treatments and prices · Smile Dental Clinic, Katapadi',
  description:
    "Every treatment at Smile Dental Clinic in Katapadi, Udupi, with the clinic's own prices: check-ups, cleaning, fillings, root canals, crowns, braces, tooth removal and dentures.",
}

// The whole price list, under the same headings as the homepage (a test checks nothing is left out)
const groups = homeServices.map((service) => ({
  ...service,
  items: treatments.filter((t) => service.slugs.includes(t.slug)),
}))

export default function TreatmentsPreview() {
  return (
    <>
      <PageHead eyebrow="Treatments and prices" title="Every treatment, with the price."
        lead="The clinic's own price list. Some prices depend on the material or on how much work a tooth needs: Dr. Rahil examines first, and explains the options and the cost before any treatment." />

      <section className="h-section mist first">
        <div className="h-wrap h-price-grid">
          {groups.map((group) => (
            <article key={group.id} id={group.id} className="h-price-card">
              <div className="h-price-head">
                <h2 className="h-serif h-h3">{group.name}</h2>
                <strong>{group.price}</strong>
              </div>
              <p className="h-small">{group.line}</p>
              {group.items.map((t) => (
                <div key={t.slug} className="h-price-list">
                  <h3><Link href={sitePath(`/treatments/${t.slug}`)}>{t.name}<ChevronRight className="h-icon-sm" aria-hidden="true" /></Link></h3>
                  {(t.pricing ?? []).map((p) => (
                    <div key={p.detail} className="h-leader-row">
                      <span>{p.detail}</span>
                      <span className="h-leader" />
                      <strong>{priceForPatients(p.cost)}</strong>
                    </div>
                  ))}
                </div>
              ))}
              <Link href={`${sitePath('/book')}?reason=${group.id}`} className="h-btn small" aria-label={`Book ${group.name}`}>Book</Link>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
