import { siteConfig } from '@/config/site'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: `Privacy Policy - ${siteConfig.name}`,
  description: `Privacy policy and patient data handling for ${siteConfig.name}.`,
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-gray-900 tracking-tight mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function List({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc pl-6 space-y-2 marker:text-blue-600">{children}</ul>
}

export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-8">Privacy Policy</h1>

      <div className="prose prose-lg prose-blue max-w-none text-gray-700 text-lg leading-relaxed">
        <p className="text-sm text-gray-500">Last updated: October 2026</p>

        <p className="mt-6">
          {siteConfig.name} is a small dental practice run by {siteConfig.dentist.name}. Your health
          information is private, and we treat it with the same care as your treatment. This page
          explains, in plain language, what we collect, why, where it is kept and the choices you have.
        </p>

        <Section title="1. What we collect">
          <p>
            <strong className="font-semibold text-gray-900">Through this website.</strong> If you
            request an appointment, we save the details you typed (name, phone or WhatsApp number,
            date of birth, address, any medical alerts, how you heard about us, the time you chose and
            the reason for the visit) so the clinic can confirm your appointment and prepare for you.
            The form then opens WhatsApp on your phone with a short message to the clinic; nothing is
            sent on WhatsApp until you press Send. We keep these details in the same private records
            as our patients&apos; details, and only the clinic can see them. To save you typing, the
            &quot;how did you hear about us&quot; answer is pre-filled from the link you came from (for
            example Google or Instagram); you can change it.
          </p>
          <p>
            <strong className="font-semibold text-gray-900">At the clinic.</strong> When you visit us,
            we record:
          </p>
          <List>
            <li>your details: name, date of birth, address, phone or WhatsApp number, any medical alerts or allergies, and how you heard about us;</li>
            <li>notes about each visit: your examination, diagnosis, treatment plan and the treatment you received;</li>
            <li>bills, payments and any balance or advance;</li>
            <li>photos of your prescription, X-rays or scans, where needed for your care.</li>
          </List>
        </Section>

        <Section title="2. Why we use it">
          <p>We use your information only to look after you as our patient:</p>
          <List>
            <li>to provide and plan your dental care;</li>
            <li>to arrange appointments and send you reminders;</li>
            <li>to prepare bills and keep a record of payments;</li>
            <li>to keep the clinical records a dental practice is expected to keep.</li>
          </List>
        </Section>

        <Section title="3. Help from AI">
          <p>
            To save time on paperwork, the dentist may use Anthropic&apos;s Claude AI service to tidy up
            visit notes he has dictated or typed, and to read handwritten prescriptions and other photos.
            For this, the relevant notes or photos are sent securely to Anthropic for processing.
          </p>
          <p>
            Anthropic does not use this information to train its AI models by default. The AI only
            assists: the dentist reviews and confirms everything before it is saved to your record, and
            all decisions about your care are made by the dentist.
          </p>
        </Section>

        <Section title="4. Where your information is kept">
          <p>
            Clinic records and photos are stored with Supabase, a secure cloud database with private
            file storage. Access is limited to the dentist&apos;s own account, which is protected by a
            password. This website is hosted by Vercel.
          </p>
          <p>
            These service providers store or process information on our behalf so that we can run the
            clinic. They may keep data on servers outside India.
          </p>
        </Section>

        <Section title="5. WhatsApp messages">
          <p>
            Bills, prescriptions, appointment details and reminders are sent to you on WhatsApp from the
            clinic&apos;s phone. The dentist sends each message himself, one at a time. We do not use
            automated or bulk messaging. If you would rather not receive reminders, just tell us.
          </p>
        </Section>

        <Section title="6. Who we share it with">
          <p>
            We do not sell your information, and we do not share it with anyone for marketing or
            advertising. Apart from the service providers named above, we only share your information
            when you ask us to (for example, with another doctor or a dental laboratory involved in your
            treatment) or when the law requires it.
          </p>
        </Section>

        <Section title="7. How long we keep it">
          <p>
            We keep your records for as long as they are needed for your care and for the period we
            must keep clinical and financial records under the law. You can ask us to delete your
            information at any time (see below).
          </p>
        </Section>

        <Section title="8. Your rights">
          <p>
            In line with India&apos;s Digital Personal Data Protection Act, 2023, you can ask us to:
          </p>
          <List>
            <li>tell you what information we hold about you and give you access to it;</li>
            <li>correct or update anything that is wrong or out of date;</li>
            <li>delete your information, unless we need to keep it to meet a legal obligation.</li>
          </List>
          <p>
            You can also raise any concern with us about how your information is handled. Contact us
            using the details below and we will respond as soon as we can.
          </p>
        </Section>

        <Section title="9. Contact us">
          <p>
            For any question or request about your privacy or your records, please speak to{' '}
            {siteConfig.dentist.name} at the clinic, email{' '}
            <a href={`mailto:${siteConfig.email}`} className="font-medium text-blue-600 hover:underline">
              {siteConfig.email}
            </a>{' '}
            or call{' '}
            <a href={`tel:${siteConfig.phone.replace(/\s/g, '')}`} className="font-medium text-blue-600 hover:underline">
              {siteConfig.phone}
            </a>
            .
          </p>
          <p>
            {siteConfig.name}, {siteConfig.address}
          </p>
        </Section>
      </div>
    </div>
  )
}
