import type { Metadata } from 'next'
import { siteConfig } from '@/config/site'
import { PageHead } from '@/components/home/PageHead'
import { PHONE_SHOWN, TEL } from '@/components/home/site-links'

export const metadata: Metadata = {
  title: `Privacy policy · ${siteConfig.name}, ${siteConfig.place}`,
  description: `Privacy policy and patient data handling for ${siteConfig.name}.`,
  alternates: { canonical: '/privacy' },
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="h-prose-part">
      <h2 className="h-serif">{title}</h2>
      {children}
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <>
      <PageHead eyebrow="Privacy" title="Privacy policy"
        lead="What the clinic collects, why, where it is kept, and the choices you have. Last updated: October 2026." />

      <section className="h-section mist first">
        <div className="h-wrap">
          <article className="h-paper h-prose">
            <p>
              {siteConfig.name} is a small dental practice run by {siteConfig.dentist.name}. Your health information is
              private, and we treat it with the same care as your treatment. This page explains, in plain language, what we
              collect, why, where it is kept and the choices you have.
            </p>

            <Part title="1. What we collect">
              <p>
                <strong>Through this website.</strong> If you request an appointment, we save what you entered: your name,
                your WhatsApp number, the time you chose and what the visit is for, and a voice note if you record one. We
                also note which site or link brought you here (for example Google or Instagram). The clinic uses these
                details to confirm your appointment and prepare for you. The page then opens WhatsApp on your phone with a
                short message to the clinic; nothing is sent on WhatsApp until you press Send. If you ask the clinic to call
                you instead, it calls the number you gave. We keep these details in the same private records as our
                patients&apos; details, and only the clinic can see them.
              </p>
              <p><strong>At the clinic.</strong> When you visit us, we record:</p>
              <ul>
                <li>your details: name, gender, date of birth, address, phone or WhatsApp number, any medical alerts or allergies, and how you heard about us;</li>
                <li>notes about each visit: your examination, diagnosis, treatment plan and the treatment you received;</li>
                <li>bills, payments and any balance or advance;</li>
                <li>photos of your prescription, X-rays or scans, where needed for your care.</li>
              </ul>
            </Part>

            <Part title="2. Why we use it">
              <p>We use your information only to look after you as our patient:</p>
              <ul>
                <li>to provide and plan your dental care;</li>
                <li>to arrange appointments and send you reminders;</li>
                <li>to prepare bills and keep a record of payments;</li>
                <li>to keep the clinical records a dental practice is expected to keep.</li>
              </ul>
            </Part>

            <Part title="3. AI">
              <p>
                The dentist may record {siteConfig.dentist.pronouns.possessive} notes about your visit by voice. The recording is sent to Google&apos;s Gemini
                service, which writes it out as text and sorts it (complaint, findings, treatment, prescription, advice) and
                may suggest a charge or a next visit for {siteConfig.dentist.pronouns.object} to check. Nothing else about you is sent: not your name, phone
                number, address, age or history. The clinic keeps the recording privately with your visit (only the dentist
                can play it), and it is deleted with your record. While the clinic uses Gemini&apos;s free version, Google
                may use what it receives to improve its services.
              </p>
              <p>
                When you book online you may record a short voice note about your problem (up to a minute), or send one on
                WhatsApp. It is kept privately with your request, only the dentist can listen to it, and it is deleted with
                your record.
              </p>
            </Part>

            <Part title="4. Where your information is kept">
              <p>
                Clinic records and photos are stored with Supabase, a secure cloud database with private file storage.
                Access is limited to the dentist&apos;s own account, which is protected by a password. This website is
                hosted by Vercel.
              </p>
              <p>
                These service providers store or process information on our behalf so that we can run the clinic. They may
                keep data on servers outside India.
              </p>
              <p>
                So that the clinic&apos;s app keeps working when the phone has no signal, the dentist&apos;s phone keeps a copy of
                the screens {siteConfig.dentist.pronouns.subject} opened, such as the day&apos;s appointments, for up to one day. With no signal they open only after
                the phone&apos;s own fingerprint or PIN, and they are deleted when {siteConfig.dentist.pronouns.subject} signs out.
              </p>
            </Part>

            <Part title="5. WhatsApp messages">
              <p>
                Bills, prescriptions, appointment details and reminders are sent to you on WhatsApp from the clinic&apos;s
                phone. The dentist sends each message {siteConfig.dentist.pronouns.reflexive}, one at a time. We do not use automated or bulk messaging.
                Prescription and X-ray photos come in the message as a private link that works for 30 days, then stops.
                Anyone you forward the link to can see the photos until then, so share it only with your pharmacist or
                another doctor. If you would rather not receive reminders, just tell us.
              </p>
            </Part>

            <Part title="6. Who we share it with">
              <p>
                We do not sell your information, and we do not share it with anyone for marketing or advertising. Apart from
                the service providers named above, we only share your information when you ask us to (for example, with
                another doctor or a dental laboratory involved in your treatment) or when the law requires it.
              </p>
            </Part>

            <Part title="7. How long we keep it">
              <p>
                We keep your records for as long as they are needed for your care and for the period we must keep clinical
                and financial records under the law. You can ask us to delete your information at any time (see below).
              </p>
            </Part>

            <Part title="8. Your rights">
              <p>In line with India&apos;s Digital Personal Data Protection Act, 2023, you can ask us to:</p>
              <ul>
                <li>tell you what information we hold about you and give you access to it;</li>
                <li>correct or update anything that is wrong or out of date;</li>
                <li>delete your information, unless we need to keep it to meet a legal obligation;</li>
                <li>stop using your information, if you withdraw your consent (we keep only what the law requires);</li>
                <li>let someone you name use these rights for you, if you cannot because of illness or death.</li>
              </ul>
              <p>
                You can also raise any concern with us about how your information is handled. Contact us using the details
                below and we will respond as soon as we can. If you are not satisfied with our reply, you can complain to the
                Data Protection Board of India.
              </p>
            </Part>

            <Part title="9. If something goes wrong">
              <p>
                If your information is ever lost, stolen or seen by someone who should not see it, we will tell you without
                delay: what happened, what it means for you and what you can do. We will also report it to the Data
                Protection Board of India, as the law requires.
              </p>
            </Part>

            <Part title="10. Contact us">
              <p>
                For any question or request about your privacy or your records, please speak to {siteConfig.dentist.name} at
                the clinic, email <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a> or call{' '}
                <a href={TEL}>{PHONE_SHOWN}</a>.
              </p>
              <p>{siteConfig.name}, {siteConfig.address}</p>
            </Part>
          </article>
        </div>
      </section>
    </>
  )
}
