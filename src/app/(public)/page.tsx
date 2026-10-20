import Link from 'next/link'
import Image from 'next/image'
import { siteConfig, treatments, faqs } from '@/config/site'
import { Calendar, CheckCircle, Star, MapPin, Phone } from 'lucide-react'
import type { Metadata } from 'next'
import { TreatmentsCarousel } from '@/components/site/TreatmentsCarousel'

export const metadata: Metadata = {
  title: `${siteConfig.name} - Trusted Local Dental Care`,
  description: siteConfig.description,
}

export default function HomePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    telephone: siteConfig.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: siteConfig.address,
    },
  }

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer
      }
    }))
  }

  return (
    <div className="flex flex-col min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* 1. Hero Section */}
      <section className="relative bg-blue-50 py-20 sm:py-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="max-w-2xl lg:max-w-none">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight mb-6">
              Your Smile,<br className="hidden sm:block" /> Our Priority.
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-8 leading-relaxed">
              Check-ups, cleaning, fillings, root canals, crowns and braces in Katapadi, Udupi.{" "}
              {siteConfig.dentist.name} sees every patient himself and explains each step simply.
            </p>

            {/* Mobile Photo - Shows above CTA buttons on mobile */}
            <div className="relative h-80 sm:h-96 w-full rounded-2xl overflow-hidden shadow-2xl mb-8 lg:hidden">
              <Image
                src={siteConfig.dentist.actionPhoto!}
                alt="Clinical Procedure"
                fill
                className="object-cover"
                sizes="100vw"
                priority
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 flex-wrap">
              <Link 
                href="/book" 
                className="inline-flex justify-center items-center rounded-full bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                <Calendar className="w-5 h-5 mr-2" />
                Schedule Consultation
              </Link>
              <a 
                href={`tel:${siteConfig.phone.replace(/\s+/g, '')}`}
                className="inline-flex justify-center items-center rounded-full bg-white px-8 py-3.5 text-base font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
              >
                <Phone className="w-5 h-5 mr-2 text-gray-500" />
                Call the Clinic
              </a>
              <a 
                href={siteConfig.googleReviewsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex justify-center items-center rounded-full bg-white px-8 py-3.5 text-base font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
              >
                <MapPin className="w-5 h-5 mr-2 text-gray-500" />
                Navigate to Clinic
              </a>
            </div>
          </div>
          
          {/* Desktop Photo - Hidden on mobile */}
          <div className="hidden lg:block relative h-full min-h-[400px] w-full rounded-2xl overflow-hidden shadow-2xl">
            <Image
              src={siteConfig.dentist.actionPhoto!}
              alt="Clinical Procedure"
              fill
              className="object-cover"
              sizes="50vw"
              priority
            />
          </div>
        </div>
      </section>

      {/* 2. Key Trust / Value Prop */}
      <section className="py-16 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: "Your dentist, every visit", desc: "Dr. Rahil sees every patient himself, from the first check-up to the last sitting." },
              { title: "Explained simply", desc: "Your options and what to expect, explained clearly before anything is done." },
              { title: "Prices you can see", desc: "Every treatment's price is on this website, so you know before you come." }
            ].map((feature, i) => (
              <div key={i} className="flex gap-4">
                <div className="flex-shrink-0 mt-1">
                  <CheckCircle className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{feature.title}</h3>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Treatments Section */}
      <section className="pt-16 pb-20 bg-gray-50 overflow-hidden border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10 text-center sm:text-left">
            <p className="text-xl md:text-2xl font-medium text-gray-800">Comprehensive dental care tailored to your needs.</p>
          </div>
          
          <TreatmentsCarousel treatments={treatments} />
        </div>
      </section>

      {/* 4. Dentist Introduction */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-blue-600 rounded-3xl overflow-hidden shadow-xl flex flex-col md:flex-row">
            <div className="p-10 md:p-16 md:w-2/3 text-white flex flex-col justify-center">
              <h2 className="text-3xl font-bold mb-4">Meet {siteConfig.dentist.name}</h2>
              <p className="text-blue-100 font-medium mb-6">
                {siteConfig.dentist.qualifications} &bull; {siteConfig.dentist.experience}
              </p>
              <p className="text-lg leading-relaxed mb-8 opacity-90">
                &quot;{siteConfig.dentist.bio}&quot;
              </p>
            </div>
            <div className="md:w-1/3 relative min-h-[400px]">
              <Image 
                src={siteConfig.dentist.portraitPhoto!} 
                alt={siteConfig.dentist.name}
                fill
                className="object-cover object-top"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 5. Location & Reviews */}
      <section className="py-20 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Visit Our Clinic</h2>
              <div className="flex items-start gap-4 mb-6">
                <MapPin className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-gray-900">Address</h3>
                  <p className="text-gray-600 mt-1">{siteConfig.address}</p>
                </div>
              </div>
              <div className="flex items-start gap-4 mb-8">
                <Calendar className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-gray-900">Working Hours</h3>
                  <div className="mt-1">
                    <p className="font-medium text-gray-900">{siteConfig.operatingHours[0].day}:</p>
                    {siteConfig.operatingHours[0].hours.map((time, idx) => (
                      <p key={idx} className="text-gray-600">{time}</p>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-sm ring-1 ring-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                  <span className="font-bold text-gray-900">Reviews on Google</span>
                </div>
                <p className="text-gray-600 mb-6">Read what patients say about {siteConfig.name} on Google.</p>
                <a 
                  href={siteConfig.googleReviewsLink} 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
                >
                  Read all Google Reviews
                </a>
              </div>
            </div>
            
            <div className="rounded-2xl overflow-hidden shadow-xl ring-1 ring-gray-200 h-[450px] w-full bg-gray-200">
              <iframe 
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3690.9245645463925!2d74.7497085!3d13.2845037!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bbcbba33e21b099%3A0xcafb512227026d47!2sSmile%20Dental%20Clinic%20-%20Katapady!5e1!3m2!1sen!2sin!4v1789624673623!5m2!1sen!2sin" 
                width="100%" 
                height="100%" 
                style={{ border: 0 }} 
                allowFullScreen={true} 
                loading="lazy" 
                referrerPolicy="no-referrer-when-downgrade"
              ></iframe>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Frequently Asked Questions */}
      <section className="py-20 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-gray-50 p-6 rounded-2xl shadow-sm ring-1 ring-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-2">{faq.question}</h3>
                <p className="text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Final CTA */}
      <section className="py-20 bg-white text-center">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">Ready to improve your smile?</h2>
          <p className="text-lg text-gray-600 mb-8">
            Book an appointment online in seconds. New patients are always welcome.
          </p>
          <Link 
            href="/book" 
            className="inline-flex justify-center items-center rounded-full bg-blue-600 px-8 py-4 text-lg font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Calendar className="w-6 h-6 mr-2" />
            Book Your Visit Now
          </Link>
        </div>
      </section>
    </div>
  )
}
