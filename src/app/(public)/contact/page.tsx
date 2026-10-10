import { siteConfig } from '@/config/site'
import { Phone, Mail, MapPin, Clock } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `Contact Us - ${siteConfig.name}`,
  description: `Contact ${siteConfig.name} to schedule your dental appointment.`,
}

export default function ContactPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-12">Contact Us</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="space-y-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Get in Touch</h2>
          
          <div className="flex gap-4">
            <div className="flex-shrink-0 mt-1">
              <Phone className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Phone & WhatsApp</h3>
              <p className="mt-1 text-gray-600">{siteConfig.phone}</p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex-shrink-0 mt-1">
              <Mail className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Email</h3>
              <p className="mt-1 text-gray-600">{siteConfig.email}</p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex-shrink-0 mt-1">
              <MapPin className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Clinic Address</h3>
              <p className="mt-1 text-gray-600">{siteConfig.address}</p>
            </div>
          </div>

          <div className="flex gap-4 pt-6 border-t">
            <div className="flex-shrink-0 mt-1">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
            <div className="w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Operating Hours</h3>
              <ul className="space-y-4 text-gray-600">
                {siteConfig.operatingHours.map((h, i) => (
                  <li key={i} className="flex flex-col sm:flex-row sm:justify-between max-w-xs">
                    <span className="font-semibold text-gray-900 mb-1 sm:mb-0">{h.day}</span>
                    <div className="flex flex-col text-right">
                      {h.hours.map((time, j) => (
                        <span key={j} className="font-medium text-gray-700">{time}</span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        
        <div className="rounded-2xl overflow-hidden shadow-xl ring-1 ring-gray-200 min-h-[400px] w-full bg-gray-200">
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
  )
}
