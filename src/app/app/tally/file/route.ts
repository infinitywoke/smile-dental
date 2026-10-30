import { siteConfig } from '@/config/site'
import { getDoctor } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { defaultTallySettings, getTallyItems, getTallySettings, indiaStart, monthWindow, withLedgers } from '@/lib/data/tally'
import { tallyTotals, tallyXml } from '@/lib/tally'
import { inIndia } from '@/lib/schedule'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const MONTH = /^\d{4}-\d{2}$/
const fail = (error: string, status = 400) => Response.json({ error }, { status })

// The Tally import file. batch "new": payments and visits recorded since the last file (the first file
// can start on a chosen day), then remembered as sent; "again": the last file once more; "month": every
// payment received and visit in a month (for the accountant), which changes nothing in what counts as new.
export async function POST(request: Request) {
  await getDoctor()
  const form = await request.formData()
  const batch = String(form.get('batch') ?? '')
  const saved = await getTallySettings()
  const settings = saved ?? defaultTallySettings

  let window
  let label: string
  const now = new Date().toISOString()
  if (batch === 'new') {
    const from = String(form.get('from') ?? '')
    const after = settings.sent_until ?? (DAY.test(from) ? new Date(new Date(indiaStart(from)).getTime() - 1).toISOString() : '1970-01-01T00:00:00Z')
    window = { by: 'recorded' as const, after, upTo: now }
    label = `${inIndia(after).date}-to-${inIndia(now).date}`
  } else if (batch === 'again') {
    if (!settings.sent_from || !settings.sent_until) return fail('No file has been made yet.')
    window = { by: 'recorded' as const, after: settings.sent_from, upTo: settings.sent_until }
    label = `${inIndia(settings.sent_from).date}-to-${inIndia(settings.sent_until).date}`
  } else if (batch === 'month' && MONTH.test(String(form.get('month')))) {
    const month = String(form.get('month'))
    window = monthWindow(month)
    label = month
  } else {
    return fail('Something went wrong.')
  }

  const perDay = settings.entries === 'day'
  if (perDay && !settings.income_ledger) return fail('One entry per day needs your income ledger: tap Change and type it.')
  // One per day holds only money; one per payment also has the visits with nothing paid
  const items = (await getTallyItems(window)).filter((i) => !perDay || i.amount > 0)
  if (items.length === 0) return fail(batch === 'new' ? 'Nothing new since the last file.' : 'Nothing in that period.', 409)
  const payments = perDay ? items : await withLedgers(items)

  if (batch === 'new' && window.by === 'recorded') {
    const supabase = await createClient()
    // Upserted: with nothing saved yet, his known ledgers are saved along with what this file covered
    const { error } = await supabase
      .from('tally_settings')
      .upsert({
        cash_ledger: settings.cash_ledger,
        bank_ledger: settings.bank_ledger,
        income_ledger: settings.income_ledger,
        entries: settings.entries,
        sent_from: window.after,
        sent_until: window.upTo,
      }, { onConflict: 'clinic_id' })
    if (error) return fail("Couldn't save which payments were sent. Please try again.", 500)
  }

  const totals = tallyTotals(payments)
  const xml = tallyXml(payments, { cash: settings.cash_ledger, bank: settings.bank_ledger, income: settings.income_ledger }, settings.entries, siteConfig.name, siteConfig.tally.company)
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="Tally-${label}.xml"`,
      'Cache-Control': 'no-store',
      // What the file holds, for the screen to show after the download
      'X-Tally-Count': String(totals.count),
      'X-Tally-Cash': String(totals.cash),
      'X-Tally-Upi': String(totals.upi),
      'X-Tally-Unpaid': String(totals.unpaid),
    },
  })
}
