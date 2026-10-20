import { notFound } from 'next/navigation'
import { treatments } from '@/config/site'
import Link from 'next/link'
import { Calendar, ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params
  const treatment = treatments.find(t => t.slug === p.slug)
  if (!treatment) return {}

  return {
    title: `${treatment.name} - Smile Dental Clinic`,
    description: treatment.description,
  }
}

export function generateStaticParams() {
  return treatments.map(t => ({
    slug: t.slug,
  }))
}

// All treatment slugs are prerendered. Awaiting params outside <Suspense> keeps
// unknown slugs returning a real 404 instead of a streamed not-found page.
export const instant = false

export default async function TreatmentDetailPage({ params }: Props) {
  const p = await params
  const treatment = treatments.find(t => t.slug === p.slug)
  
  if (!treatment) {
    notFound()
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Link href="/treatments" className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline mb-8">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to all treatments
      </Link>
      
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight mb-6">
        {treatment.name}
      </h1>
      
      <div className="prose prose-lg prose-blue max-w-none text-gray-700 mb-12">
        <p className="text-xl leading-relaxed text-gray-600 mb-8 font-medium">
          {treatment.shortDescription}
        </p>
        {treatment.description && (
          <p className="leading-relaxed mb-8">
            {treatment.description}
          </p>
        )}
        
        {treatment.pricing && treatment.pricing.length > 0 && (
          <div className="mt-8 mb-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Pricing Details</h3>
            <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Treatment Variant</th>
                    <th scope="col" className="px-6 py-4 text-right text-sm font-semibold text-gray-900">Approximate Cost (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {treatment.pricing.map((item, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 text-sm text-gray-700 font-medium">{item.detail}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right whitespace-nowrap">{item.cost.replace('/-', '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-8 p-6 bg-blue-50 rounded-xl text-blue-900">
          <strong>Note:</strong> Treatment details and timelines vary per patient. A comprehensive consultation is required before beginning any restorative or cosmetic procedure.
        </p>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm ring-1 ring-gray-200 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Book your {treatment.name.toLowerCase()} consultation</h2>
        <p className="text-gray-600 mb-8">Dr. Rahil will explain your options and the cost before any treatment.</p>
        <Link 
          href={`/book?reason=${encodeURIComponent(treatment.name)}`}
          className="inline-flex justify-center items-center rounded-full bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Calendar className="w-6 h-6 mr-2" />
          Book Appointment
        </Link>
      </div>
    </div>
  )
}
