import { siteConfig } from '@/config/site'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `About Us - ${siteConfig.name}`,
  description: `Learn more about ${siteConfig.name} and our expert team.`,
}

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-8">About {siteConfig.name}</h1>
      
      <div className="prose prose-lg prose-blue max-w-none text-gray-700">
        <p className="lead text-xl text-gray-600 mb-8">
          {siteConfig.description}
        </p>
        
        <h2 className="text-2xl font-bold text-gray-900 mt-12 mb-4">Our Philosophy</h2>
        <p>
          At {siteConfig.name}, we believe that visiting the dentist shouldn&apos;t be stressful. We&apos;ve built our practice around patient comfort, transparent communication, and advanced, pain-free dental techniques.
        </p>

        <h2 className="text-3xl font-bold text-gray-900 mt-16 mb-8">Meet {siteConfig.dentist.name}</h2>
        
        <div className="flex flex-col md:flex-row gap-10 items-start mb-10">
          <div className="w-full md:w-1/3 shrink-0">
            <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden shadow-lg ring-1 ring-gray-200">
              <Image 
                src={siteConfig.dentist.portraitPhoto}
                alt={`Portrait of ${siteConfig.dentist.name}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
            </div>
          </div>
          
          <div className="w-full md:w-2/3 space-y-6">
            <div>
              <p className="text-lg font-bold text-gray-900 m-0">{siteConfig.dentist.qualifications}</p>
              <p className="text-blue-600 font-medium mt-1">{siteConfig.dentist.experience}</p>
            </div>
            
            <p className="leading-relaxed">
              <strong>{siteConfig.dentist.name}</strong> brings a caring, approachable touch to modern dentistry. He believes every patient deserves to feel comfortable, heard, and completely confident about their dental care.
            </p>
            
            <p className="leading-relaxed">
              He takes the time to understand your unique needs, carefully explaining treatment options in a simple and reassuring way. Leading the team at {siteConfig.name} in Katapadi, Udupi, he strives to transform every dental visit into a positive experience.
            </p>

            <p className="leading-relaxed">
              A firm believer in continuous education, {siteConfig.dentist.name} actively pursues the latest advancements in dental science to ensure you receive the highest standard of care. He helps you achieve a healthy, natural-looking smile you can truly be proud of.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-6 bg-gradient-to-r from-blue-50 to-white p-6 sm:p-8 rounded-2xl border border-blue-100 shadow-sm">
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-full overflow-hidden shadow-md bg-white ring-4 ring-white">
            <Image 
              src={siteConfig.media.logo!}
              alt={`${siteConfig.name} Logo`}
              fill
              className="object-contain p-1"
              sizes="112px"
            />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <p className="text-xl sm:text-2xl font-semibold text-blue-900 italic leading-relaxed">
              &quot;We put your comfort, trust, and smile at the absolute heart of our care.&quot;
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
