import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Waves } from './Waves'

// The top of every page but the homepage: a navy band under the header with the page's title, running
// into the pale mist section below
export function PageHead({ eyebrow, title, lead, back }: {
  eyebrow?: string
  title: React.ReactNode
  lead?: React.ReactNode
  back?: { href: string; label: string }
}) {
  return (
    <section className="h-tide h-page-head">
      <div className="h-wrap">
        {back && <Link href={back.href} className="h-back"><ArrowLeft className="h-icon-sm" aria-hidden="true" /> {back.label}</Link>}
        {eyebrow && <p className="h-eyebrow amber">{eyebrow}</p>}
        <h1 className="h-serif h-page-title">{title}</h1>
        {lead && <p className="h-page-lead">{lead}</p>}
      </div>
      <Waves fill="#F3F6FB" />
    </section>
  )
}
