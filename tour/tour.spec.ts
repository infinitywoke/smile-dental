import fs from 'node:fs'
import path from 'node:path'
import { test, type Locator, type Page } from '@playwright/test'
import { addDays, inIndia, isClosedDay } from '../src/lib/schedule'
import { NO_TEST_LOGIN, testLogin } from '../e2e/env'
import { cleanTestAccount, makeRequest as makeTestRequest } from '../e2e/helpers'

// Evidence tour for the simplification build (docs/BUILD_LOG.md). Not part of the test suite:
// run it against a production build (see the log) after each wave that changes screens.
// Walks Dr. Rahil's real jobs on a OnePlus 13-sized Android screen, as the test account, and records
// screenshots, taps, typing, screens, layout measurements and Android Back behaviour.
// Runs as the test account; everything it makes is deleted at the start and the end.

test.skip(!testLogin, NO_TEST_LOGIN)
test.use({
  viewport: { width: 412, height: 905 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 15; CPH2649) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
})

const OUT = path.join(__dirname, 'out')
const runId = `TOUR-${Date.now()}`
const patientName = `${runId} Walkin`
const phone = `9${String(Date.now()).slice(-9)}`

type Job = { job: string; taps: number; typed: number; pickers: number; screens: string[]; notes: string[]; ok: boolean }
const jobs: Job[] = []
let current: Job = { job: 'setup', taps: 0, typed: 0, pickers: 0, screens: [], notes: [], ok: true }
const shots: Record<string, unknown>[] = []
const back: Record<string, unknown>[] = []
const failures: string[] = []
const messages: Record<string, string> = {}
let shotNo = 0

const visible = <T extends Locator>(l: T) => l.filter({ visible: true }) as T

function startJob(name: string) {
  current = { job: name, taps: 0, typed: 0, pickers: 0, screens: [], notes: [], ok: true }
  jobs.push(current)
}
async function tap(l: Locator) {
  await l.first().click()
  current.taps++
}
async function type(l: Locator, value: string) {
  await l.first().fill(value)
  current.typed++
}
async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn()
  } catch (e) {
    current.ok = false
    const msg = `${current.job} / ${name}: ${(e as Error).message.split('\n')[0].slice(0, 300)}`
    failures.push(msg)
    console.log('FAIL', msg)
  }
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const isVisible = (el: Element) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]')
    }
    const label = (el: Element) =>
      ((el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('placeholder') || el.getAttribute('name') || el.tagName) ?? '')
        .replace(/\s+/g, ' ').trim().slice(0, 50)
    const interactive = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=radio],[role=menuitem],[role=menuitemcheckbox]')]
      .filter(isVisible)
      .filter((el) => !(el instanceof HTMLInputElement && el.type === 'hidden'))
    const small = interactive
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => (r.width < 48 || r.height < 48) && !(el instanceof HTMLInputElement && (el.type === 'file')))
      .map(({ el, r }) => `${label(el)} (${Math.round(r.width)}x${Math.round(r.height)})`)
    const fields = [...document.querySelectorAll('input,textarea,select')]
      .filter(isVisible)
      .filter((el) => !(el instanceof HTMLInputElement && ['hidden', 'file'].includes(el.type)))
      .map((el) => {
        const i = el as HTMLInputElement
        return {
          label: (i.labels?.[0]?.innerText || i.placeholder || i.name || i.id || '').replace(/\s+/g, ' ').trim().slice(0, 40),
          type: i.type, inputmode: i.inputMode || '', enterkeyhint: i.enterKeyHint || '', autocomplete: i.autocomplete || '',
          fontSize: getComputedStyle(i).fontSize,
        }
      })
    const tinyText = [...document.querySelectorAll('body *')].filter((el) => {
      if (!isVisible(el) || !(el as HTMLElement).innerText?.trim() || el.children.length > 0) return false
      return parseFloat(getComputedStyle(el).fontSize) < 13
    }).map((el) => (el as HTMLElement).innerText.trim().slice(0, 40))
    return {
      url: location.pathname + location.search,
      interactiveCount: interactive.length,
      belowAndroid48dp: small,
      fields,
      textUnder13px: tinyText.slice(0, 15),
      textUnder13pxCount: tinyText.length,
      words: document.body.innerText.split(/\s+/).filter(Boolean).length,
      pageHeight: document.documentElement.scrollHeight,
      screensTall: Math.round((document.documentElement.scrollHeight / window.innerHeight) * 10) / 10,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      historyLength: history.length,
    }
  })
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  await page.locator('.animate-spin').filter({ visible: true }).first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(400)
}

async function snap(page: Page, name: string) {
  try {
    await settle(page)
    const no = String(++shotNo).padStart(2, '0')
    const file = `${no}-${name}.png`
    await page.screenshot({ path: path.join(OUT, file) })
    const m = await measure(page)
    if (m.screensTall > 1.3) await page.screenshot({ path: path.join(OUT, `${no}-${name}-full.png`), fullPage: true })
    shots.push({ file, job: current.job, ...m })
    if (!current.screens.includes(m.url.split('?')[0])) current.screens.push(m.url.split('?')[0])
  } catch (e) {
    failures.push(`snap ${name}: ${(e as Error).message.split('\n')[0]}`)
  }
}

async function captureWhatsapp(page: Page, key: string) {
  await page.unroute('https://wa.me/**').catch(() => {})
  await page.route('https://wa.me/**', (route) => {
    messages[key] = decodeURIComponent(new URL(route.request().url()).searchParams.get('text') ?? '')
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><h1>WhatsApp would open here</h1></body></html>' })
  })
}

const makeRequest = (label: string, hhmm: string, offset: number) => makeTestRequest(runId, label, hhmm, 2 + offset)

test('evidence tour', async ({ page }) => {
  test.setTimeout(20 * 60_000)
  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })
  await cleanTestAccount()
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) {
      const p = new URL(f.url()).pathname
      if (!current.screens.includes(p)) current.screens.push(p)
    }
  })
  const consoleErrors: string[] = []
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`))
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) })
  page.on('dialog', (d) => { current.notes.push(`browser dialog: "${d.message()}"`); d.accept() })

  // ---------------------------------------------------------------- public website
  startJob('Website: patient books online (not sent)')
  await step('home', async () => { await page.goto('/'); await snap(page, 'site-home') })
  await step('book', async () => {
    await page.goto('/book'); await snap(page, 'site-book-1-times')
    await tap(visible(page.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)$/ })))
    await page.waitForTimeout(600); await snap(page, 'site-book-2-details')
    await type(page.getByLabel('WhatsApp number'), '9845021763')
    await type(page.getByLabel('Full name'), 'Tour Visitor')
    await tap(page.getByRole('radio', { name: 'Female', exact: true }))
    await type(page.getByLabel('Date of birth'), '1990-05-15'); current.pickers++
    await type(page.getByLabel('Address'), 'Pangala, Udupi')
    await tap(page.getByRole('button', { name: 'Tooth pain' }))
    await snap(page, 'site-book-2-filled')
    await tap(page.getByRole('button', { name: 'Review' }))
    await page.waitForTimeout(600); await snap(page, 'site-book-3-review')
    current.notes.push('Stopped before "Confirm and send on WhatsApp" (that tap would be the last one).')
    current.taps++
  })

  // ---------------------------------------------------------------- sign in
  startJob('Sign in')
  await step('login', async () => {
    await page.goto('/login'); await snap(page, 'login')
    await type(page.getByLabel('Email'), testLogin!.email)
    await type(page.getByLabel('Password'), testLogin!.password)
    await tap(page.getByRole('button', { name: 'Sign in' }))
    await page.waitForURL(/\/app$/)
    await snap(page, 'today-empty')
  })
  await step('practice mode on + menu', async () => {
    await page.getByRole('button', { name: 'Menu' }).click()
    await snap(page, 'menu-open')
    await page.keyboard.press('Escape').catch(() => {})
  })

  // ---------------------------------------------------------------- job A
  startJob('A. Walk-in: new patient to finished visit (notes, photo, bill, payment, next visit, WhatsApp)')
  let visitUrl = ''
  await step('add sheet', async () => {
    await page.goto('/app')
    current.taps = 0; current.typed = 0; current.screens = ['/app']
    const add = page.getByRole('button', { name: 'Add' })
    if (await add.count()) {
      await tap(add); await snap(page, 'add-sheet')
      const link = visible(page.getByRole('link', { name: /New patient/ }))
      if (await link.count()) await tap(link)
    } else {
      await tap(visible(page.getByRole('link', { name: /New patient|Add/ })))
    }
    await page.waitForURL(/patients\/new/); await snap(page, 'new-patient-empty')
  })
  await step('new patient form', async () => {
    await type(visible(page.getByLabel('WhatsApp number')), phone)
    await type(visible(page.getByLabel('Name', { exact: true })), patientName)
    await tap(visible(page.getByRole('radio', { name: 'Male', exact: true })))
    const age = visible(page.getByLabel(/^Age/))
    if (await age.count()) await type(age, '38')
    else { await type(visible(page.getByLabel('Date of birth')), '1988-02-10'); current.pickers++ }
    const address = visible(page.getByLabel('Address'))
    if (await address.count()) await type(address, 'Near Church Road, Pangala')
    await type(visible(page.getByLabel('Medical alerts')), 'Penicillin allergy')
    const chip = visible(page.getByRole('button', { name: 'Walked past' }))
    if (await chip.count()) await tap(chip)
    await snap(page, 'new-patient-filled')
    await tap(visible(page.getByRole('button', { name: /start visit/i })))
    await page.waitForURL(/\/app\/visits\/[0-9a-f-]{36}/, { timeout: 30_000 })
    visitUrl = page.url().split(/[?#]/)[0]
    await snap(page, 'visit-page')
  })
  await step('back from the visit page', async () => {
    await page.goBack(); await page.waitForTimeout(1500)
    back.push({ where: 'Visit page, reached from the New patient form', after: new URL(page.url()).pathname, heading: await visible(page.locator('h1')).first().innerText().catch(() => '') })
    await page.goto(visitUrl)
  })
  await step('notes save by themselves', async () => {
    await type(visible(page.getByLabel('Notes', { exact: true })),
      'Pain lower right back tooth for a week, worse at night. Deep caries 46, tender on percussion. Started RCT on 46. Amoxicillin 500 three times a day for 5 days. Review Thursday evening.')
    const started = Date.now()
    await visible(page.getByText('Saved', { exact: true })).waitFor({ timeout: 20_000 })
    current.notes.push(`Notes showed "Saved" ${Math.round((Date.now() - started) / 100) / 10}s after typing stopped`)
  })
  await step('photo', async () => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), visible(page.getByRole('button', { name: 'Gallery' })).click()])
    current.taps++
    await chooser.setFiles(path.join(__dirname, '..', 'e2e', 'fixtures', 'tooth.png'))
    await visible(page.getByRole('img', { name: /^Photo 1/ })).waitFor({ timeout: 30_000 })
    await tap(visible(page.getByRole('button', { name: 'Prescription', exact: true })))
    await snap(page, 'visit-photo')
  })
  await step('add a charge from the price list', async () => {
    await tap(visible(page.getByRole('button', { name: 'Add charge' })))
    const sheet = page.getByRole('dialog', { name: 'Add charge' })
    await sheet.waitFor({ timeout: 10_000 })
    await snap(page, 'price-list')
    await page.goBack(); await page.waitForTimeout(800)
    back.push({ where: 'Price list open on the visit page', after: new URL(page.url()).pathname, listStillOpen: (await sheet.count()) > 0 && (await sheet.isVisible().catch(() => false)) })
    if (!page.url().startsWith(visitUrl)) await page.goto(visitUrl)
    await tap(visible(page.getByRole('button', { name: 'Add charge' })))
    await type(sheet.getByLabel('Filter the price list'), 'moderate')
    await tap(sheet.getByRole('button', { name: /Scaling .*Moderate case/ }))
    await page.waitForTimeout(1500)
    await snap(page, 'visit-bill')
  })
  await step('part payment, cash; UPI QR', async () => {
    await type(visible(page.locator('#payment-amount')), '400')
    await tap(visible(page.getByRole('button', { name: 'Cash received' })))
    await visible(page.getByText('Paid by cash')).first().waitFor({ timeout: 15_000 })
    await snap(page, 'visit-part-paid')
    await tap(visible(page.getByRole('button', { name: 'UPI', exact: true })))
    const qr = page.getByRole('dialog').filter({ has: page.getByRole('img', { name: /UPI QR/ }) })
    await qr.waitFor({ timeout: 10_000 })
    await snap(page, 'upi-qr')
    await page.goBack(); await page.waitForTimeout(800)
    back.push({ where: 'UPI QR open on the visit page', after: new URL(page.url()).pathname, qrStillOpen: (await qr.count()) > 0 && (await qr.isVisible().catch(() => false)) })
    if (!page.url().startsWith(visitUrl)) await page.goto(visitUrl)
    current.taps -= 1 // the QR look was for evidence, not part of the job
  })
  await step('next visit and WhatsApp', async () => {
    await snap(page, 'visit-next-and-send')
    const suggestion = visible(page.getByRole('button', { name: /^Book / }))
    if (await suggestion.count()) { await tap(suggestion); await page.waitForTimeout(2000) }
    await captureWhatsapp(page, 'visit-message')
    await tap(visible(page.getByRole('link', { name: 'Send on WhatsApp' })))
    await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
    await snap(page, 'whatsapp-handoff')
  })

  // ---------------------------------------------------------------- job G (owed money)
  startJob('G. Collect the money still owed')
  await step('today with dues', async () => {
    await page.goto('/app'); await snap(page, 'today-after-visit')
    current.taps = 0; current.typed = 0; current.screens = ['/app']
    const due = visible(page.getByRole('link').filter({ hasText: patientName }).filter({ hasText: 'Collect' }))
    await tap(due)
    await page.waitForURL(/\/app\/visits\//)
    await visible(page.getByRole('button', { name: 'Cash received' })).waitFor({ timeout: 15_000 })
    await snap(page, 'collect-payment-card')
    await tap(visible(page.getByRole('button', { name: 'Cash received' })))
    await visible(page.getByText('Paid in full')).first().waitFor({ timeout: 15_000 })
    await snap(page, 'collect-done')
  })

  // ---------------------------------------------------------------- job B / H / F
  startJob('B. Returning patient: find by phone and open their page')
  let patientUrl = ''
  await step('search', async () => {
    await page.goto('/app')
    current.taps = 0; current.typed = 0; current.screens = ['/app']
    await tap(page.getByRole('link', { name: 'Patients', exact: true }))
    await snap(page, 'patients-list')
    await type(visible(page.getByPlaceholder('Search name or phone')), phone)
    await tap(visible(page.getByRole('button', { name: 'Search' })))
    await page.waitForTimeout(1000); await snap(page, 'patients-search')
    await tap(visible(page.getByRole('link').filter({ hasText: patientName })))
    await page.waitForURL(/\/app\/patients\/[0-9a-f-]{36}$/); patientUrl = page.url()
    await visible(page.getByRole('heading', { name: patientName })).waitFor({ timeout: 20_000 })
    await snap(page, 'patient-hub')
    const primary = await page.locator('main a, main button').allInnerTexts().catch(() => [])
    current.notes.push(`Buttons on the patient page: ${primary.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12).join(' | ')}`)
  })
  await step('edit patient page', async () => {
    const edit = visible(page.getByRole('link', { name: /Edit/ }))
    if (await edit.count()) { await page.locator('summary').first().click().catch(() => {}); await snap(page, 'patient-hub-details'); await edit.first().click(); await snap(page, 'patient-edit') }
  })

  startJob('F. Move the coming appointment to another time')
  await step('move', async () => {
    await page.goto(patientUrl)
    current.taps = 0; current.typed = 0; current.screens = [new URL(patientUrl).pathname]
    await visible(page.getByRole('heading', { name: patientName })).waitFor({ timeout: 20_000 }).catch(() => {})
    const move = visible(page.getByRole('link', { name: /^Move$/ }))
    if (!(await move.count())) { current.notes.push('No Move link on the patient page'); return }
    await tap(move); await page.waitForTimeout(1500); await snap(page, 'move-page')
    current.notes.push(`Current time marked on the move page: ${(await page.locator('[aria-pressed="true"]').filter({ visible: true }).count()) > 0}`)
    const times = visible(page.getByRole('button', { name: /^\d{1,2}:\d{2} (AM|PM)/ }))
    const n = await times.count()
    if (n > 1) await tap(times.nth(n - 1))
    await snap(page, 'move-picked')
    await captureWhatsapp(page, 'move-message')
    const save = visible(page.getByRole('button', { name: /^(Save|Move|Save and confirm|Move here)/ }))
    if (await save.count()) { await tap(save); await page.waitForTimeout(2500); await snap(page, 'move-saved') }
  })

  startJob('H. Cancel the coming appointment')
  await step('cancel', async () => {
    await page.goto(patientUrl)
    current.taps = 0; current.typed = 0; current.screens = [new URL(patientUrl).pathname]
    await visible(page.getByRole('heading', { name: patientName })).waitFor({ timeout: 20_000 }).catch(() => {})
    const cancel = visible(page.getByRole('button', { name: 'Cancel appointment' }))
    if (!(await cancel.count())) { current.notes.push('No Cancel appointment button'); return }
    await tap(cancel); await page.waitForTimeout(1500); await snap(page, 'patient-hub-after-cancel')
  })

  // ---------------------------------------------------------------- job C
  startJob('C. Phone booking for an existing patient (from + button)')
  await step('book existing', async () => {
    await page.goto('/app')
    current.taps = 0; current.typed = 0; current.screens = ['/app']
    await tap(page.getByRole('button', { name: 'Add' }))
    const book = visible(page.getByRole('link', { name: /Book|Appointment/ }))
    await tap(book); await page.waitForTimeout(1500); await snap(page, 'book-1-times')
    await tap(visible(page.getByRole('link', { name: /^\d{1,2}:\d{2} (AM|PM)/ })))
    await visible(page.getByRole('button', { name: 'Book appointment' })).waitFor({ timeout: 20_000 })
    await snap(page, 'book-2-who')
    const search = visible(page.getByPlaceholder(/name or phone/i))
    if (await search.count()) {
      await type(search, phone)
      const go = visible(page.getByRole('button', { name: 'Search' }))
      if (await go.count()) await tap(go)
      await page.waitForTimeout(1500)
      await snap(page, 'book-2-search')
    } else current.notes.push('No patient search box on the booking screen')
    const row = visible(page.getByRole('button').filter({ hasText: patientName }))
    const label = visible(page.locator('label').filter({ hasText: patientName }))
    if (await row.count()) await tap(row)
    else if (await label.count()) await tap(label)
    else current.notes.push('The patient was not offered in the list to pick from')
    await snap(page, 'book-3-ready')
    await tap(visible(page.getByRole('button', { name: 'Book appointment' })))
    await page.waitForTimeout(2000); await snap(page, 'book-4-booked')
  })

  // ---------------------------------------------------------------- jobs D / E (website requests)
  startJob('D. Website request: confirm the time asked for')
  await step('confirm request', async () => {
    const { requestName } = await makeRequest('Quick', '15:10', 0)
    await page.goto('/app')
    current.taps = 0; current.typed = 0; current.screens = ['/app']
    await visible(page.getByText(requestName)).first().waitFor({ timeout: 20_000 })
    await snap(page, 'today-with-request')
    await captureWhatsapp(page, 'request-confirmation')
    const card = visible(page.locator('div').filter({ hasText: requestName }).filter({ has: page.getByRole('button', { name: 'Confirm' }) })).last()
    const more = card.getByRole('button', { name: /Details|More/ })
    if (await more.count()) { await more.first().click(); await snap(page, 'request-card-details') }
    await tap(card.getByRole('button', { name: 'Confirm' }))
    await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
  })

  startJob('E. Website request: give another time')
  await step('other time', async () => {
    const { id, requestName } = await makeRequest('Other', '10:30', 1)
    await page.goto('/app')
    current.taps = 0; current.typed = 0; current.screens = ['/app']
    const card = visible(page.locator('div').filter({ hasText: requestName }).filter({ has: page.getByRole('link', { name: 'Other time' }) })).last()
    await tap(card.getByRole('link', { name: 'Other time' }))
    await page.waitForURL(new RegExp(`/app/requests/${id}`)); await page.waitForTimeout(1500)
    await snap(page, 'request-page')
    current.notes.push(`"Save and confirm" enabled before any tap: ${await visible(page.getByRole('button', { name: 'Save and confirm' })).isEnabled().catch(() => false)}`)
    await tap(visible(page.getByRole('button', { name: /^11:10 AM/ })))
    await snap(page, 'request-picked')
    await captureWhatsapp(page, 'request-other-time')
    await tap(visible(page.getByRole('button', { name: 'Save and confirm' })))
    await page.waitForURL(/wa\.me\//, { timeout: 30_000 })
  })

  // ---------------------------------------------------------------- other screens and Back checks
  startJob('Other screens and Android Back checks')
  await step('closed day', async () => {
    let d = inIndia(new Date()).date
    for (let i = 0; i < 7 && !isClosedDay(d); i++) d = addDays(d, 1)
    await page.goto(`/app?d=${d}`); await snap(page, 'today-friday-closed')
  })
  await step('future day with booking', async () => {
    const d = addDays(inIndia(new Date()).date, 3)
    await page.goto(`/app?d=${d}`); await snap(page, 'day-sheet-future')
  })
  await step('back: + sheet', async () => {
    await page.goto('/app/patients'); await page.goto('/app')
    await page.getByRole('button', { name: 'Add' }).click(); await page.waitForTimeout(300)
    await page.goBack(); await page.waitForTimeout(1000)
    back.push({ where: '"+" sheet open on Today', after: new URL(page.url()).pathname })
  })
  await step('back: header menu', async () => {
    await page.goto('/app/patients'); await page.goto('/app')
    await page.getByRole('button', { name: 'Menu' }).click(); await page.waitForTimeout(300)
    await page.goBack(); await page.waitForTimeout(1000)
    back.push({ where: 'Header menu open on Today', after: new URL(page.url()).pathname })
  })
  await step('back: half-typed new patient', async () => {
    await page.goto('/app'); await page.goto('/app/patients/new')
    await visible(page.getByLabel('Name', { exact: true })).fill('Half typed')
    await page.goBack(); await page.waitForTimeout(1000)
    const left = new URL(page.url()).pathname
    await page.goForward(); await page.waitForTimeout(1500)
    back.push({ where: 'New patient form with a name typed', after: left, nameKeptAfterForward: await visible(page.getByLabel('Name', { exact: true })).inputValue().catch(() => 'n/a') })
  })
  await step('visit menu', async () => {
    if (!visitUrl) return
    await page.goto(visitUrl)
    await page.goto(visitUrl); await snap(page, 'visit-after-everything')
  })

  // ---------------------------------------------------------------- clean up
  startJob('cleanup')
  await step('clean the test account', async () => { await cleanTestAccount() })

  fs.writeFileSync(path.join(OUT, 'tour.json'), JSON.stringify({ device: 'OnePlus 13 size (412x905 CSS px), Android 15 Chrome UA, touch', jobs, back, messages, failures, consoleErrors: [...new Set(consoleErrors)].slice(0, 40), shots }, null, 2))
  console.log('JOBS', JSON.stringify(jobs.map((j) => ({ job: j.job, taps: j.taps, typed: j.typed, pickers: j.pickers, screens: j.screens.length, ok: j.ok }))))
  console.log('FAILURES', JSON.stringify(failures))
})
