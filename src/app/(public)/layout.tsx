import Link from 'next/link'
import Image from 'next/image'
import { siteConfig } from '@/config/site'
import { cacheLife } from 'next/cache'
import { PublicHeader } from '@/components/site/PublicHeader'
import { SourceTracker } from '@/components/site/SourceTracker'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col font-sans">
      <PublicHeader />
      <SourceTracker />

      <main className="flex-1 bg-white">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 bg-white rounded p-1.5 flex-shrink-0">
                <Image 
                  src={siteConfig.media.logo} 
                  alt={siteConfig.name} 
                  fill
                  className="object-contain p-1"
                  sizes="48px"
                />
              </div>
              <h3 className="text-xl font-bold text-white tracking-tight">{siteConfig.name}</h3>
            </div>
            <p className="text-sm text-gray-400 mt-2">{siteConfig.description}</p>
            <Link href="/app" className="text-xs text-gray-500 hover:text-white transition-colors">Clinic Login</Link>
          </div>
          
          <div>
            <h4 className="text-white font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/treatments" className="hover:text-white transition-colors">Treatments</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
              <li><Link href="/faq" className="hover:text-white transition-colors">FAQ</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-white font-semibold mb-4">Contact</h4>
            <ul className="space-y-2 text-sm">
              <li>{siteConfig.phone}</li>
              <li>{siteConfig.email}</li>
              <li className="pt-2">{siteConfig.address}</li>
            </ul>
          </div>
          
          <div>
            <h4 className="text-white font-semibold mb-4">Hours</h4>
            <ul className="space-y-4 text-sm">
              {siteConfig.operatingHours.map((h, i) => (
                <li key={i} className="flex flex-col gap-1">
                  <span className="font-semibold text-gray-300">{h.day}</span>
                  {h.hours.map((time, j) => (
                    <span key={j} className="text-gray-400">{time}</span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t border-gray-800 text-xs text-center text-gray-500 flex flex-col md:flex-row justify-between items-center gap-4">
          <p>&copy; <CopyrightYear /> {siteConfig.name}. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

async function CopyrightYear() {
  'use cache'
  cacheLife('days')
  return new Date().getFullYear()
}
