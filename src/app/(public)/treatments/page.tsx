import Link from 'next/link'
import { treatments } from '@/config/site'
import { ArrowRight } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dental Treatments & Services - Smile Dental Clinic',
  description: 'Explore our comprehensive range of dental treatments including cleanings, root canals, fillings, and more.',
}

export default function TreatmentsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-3xl mb-12">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Dental Treatments</h1>
        <p className="text-xl text-gray-600">
          We offer a full spectrum of dental services designed to keep your smile healthy and beautiful.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {treatments.map(t => (
          <Link key={t.slug} href={`/treatments/${t.slug}`} className="group bg-white p-8 rounded-2xl shadow-sm ring-1 ring-gray-200 hover:shadow-md hover:ring-blue-600 transition-all flex flex-col h-full">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 group-hover:text-blue-600 transition-colors">{t.name}</h2>
            <p className="text-gray-600 mb-8 flex-1">{t.description}</p>
            <span className="text-sm font-semibold text-blue-600 flex items-center gap-1 mt-auto">
              View Details <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
