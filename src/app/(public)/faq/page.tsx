import { faqs, siteConfig } from '@/config/site'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `FAQ - ${siteConfig.name}`,
  description: `Frequently asked questions about treatments, booking, and dental care at ${siteConfig.name}.`,
}

export default function FAQPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Frequently Asked Questions</h1>
      <p className="text-xl text-gray-600 mb-12">
        Find answers to common questions about our dental services.
      </p>
      
      <div className="space-y-8">
        {faqs.map((faq, index) => (
          <div key={index} className="bg-white p-8 rounded-2xl shadow-sm ring-1 ring-gray-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{faq.question}</h2>
            <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 p-8 bg-blue-50 rounded-2xl text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Still have questions?</h2>
        <p className="text-gray-600 mb-8">Our team is happy to help with any specific concerns you might have.</p>
        <Link 
          href="/contact"
          className="inline-flex justify-center items-center rounded-full bg-blue-600 px-8 py-3.5 text-base font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          Contact Us
        </Link>
      </div>
    </div>
  )
}
