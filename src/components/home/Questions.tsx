import { ChevronDown } from 'lucide-react'
import { faqs } from '@/config/site'
import { PHONE_SHOWN, TEL, WHATSAPP } from './site-links'

// Only the answers the clinic has checked
export const questions = faqs.filter((f) => f.isVerified)

// What patients ask, opening in place, with the ways to ask anything else
export function Questions() {
  return (
    <section id="questions" className="h-section mist">
      <div className="h-wrap h-split">
        <div className="h-col" style={{ flex: '1 1 300px' }} data-reveal>
          <p className="h-eyebrow">Questions</p>
          <h2 className="h-serif h-h2">What patients ask.</h2>
          <p className="h-lead">
            Anything else? <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">WhatsApp the clinic</a> or{' '}
            <a href={TEL}>call {PHONE_SHOWN}</a>.
          </p>
        </div>
        <div className="h-col h-faq" style={{ flex: '1.5 1 460px' }} data-reveal>
          {questions.map((f) => (
            <details key={f.question} className="h-faq-item">
              <summary><span>{f.question}</span><ChevronDown className="h-icon" aria-hidden="true" /></summary>
              <p>{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
