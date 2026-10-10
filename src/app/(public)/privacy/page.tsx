import { siteConfig } from '@/config/site'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `Privacy Policy - ${siteConfig.name}`,
  description: `Privacy policy and patient data handling for ${siteConfig.name}.`,
}

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-8">Privacy Policy</h1>
      
      <div className="prose prose-lg prose-blue max-w-none text-gray-700">
        <p>Last updated: September 2026</p>
        
        <h2>1. Patient Confidentiality</h2>
        <p>
          At {siteConfig.name}, patient privacy and medical confidentiality are our highest priorities. All clinical records, consultation notes, and treatment histories are stored securely and accessible only by authorized clinical staff.
        </p>

        <h2>2. Data Collection</h2>
        <p>
          When you submit a booking request through our website, we collect your name, phone number, preferred appointment time, and the reason for your visit. This information is used strictly to schedule your appointment and establish a preliminary patient record.
        </p>

        <h2>3. Data Protection</h2>
        <p>
          Our clinic management system utilizes modern database security, including Row Level Security (RLS) and strict tenant isolation, ensuring that your data remains absolutely private. We do not sell or share patient data with third-party marketing services.
        </p>

        <h2>4. Contact Information</h2>
        <p>
          If you have any questions or concerns regarding your privacy or clinical records, please contact us at {siteConfig.email} or call {siteConfig.phone}.
        </p>
      </div>
    </div>
  )
}
