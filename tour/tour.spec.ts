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
  startJob('A. Walk-in: new patient to finished visit (notes, bill, payment, WhatsApp, next visit)')
  let visitUrl = ''
  await step('add sheet', async () => {
    await page.goto('/app')
    current.taps = 0; current.typed = 0; current.screens = ['/app']
    await tap(page.getByRole('button', { name: 'Add' })); await snap(page, 'add-sheet')
    await tap(page.getByRole('link', { name: /New patient/ }))
    await page.waitForURL(/patients\/new/); await snap(page, 'new-patient-empty')
  })
  await step('new patient form', async () => {
    await type(visible(page.getByLabel('WhatsApp number')), phone)
    await type(visible(page.getByLabel('Name', { exact: true })), patientName)
    await tap(visible(page.getByRole('radio', { name: 'Male', exact: true })))
    await type(visible(page.getByLabel('Date of birth')), '1988-02-10'); current.pickers++
    await type(visible(page.getByLabel('Address')), 'Near Church Road, Pangala')
    await type(visible(page.getByLabel('Medical alerts')), 'Penicillin allergy')
    await tap(visible(page.getByRole('button', { name: 'Walked past' })))
    await snap(page, 'new-patient-filled')
    await tap(visible(page.getByRole('button', { name: 'Save and start visit' })))
    await page.waitForURL(/visits\/new/); await snap(page, 'visit-new')
  })
  await step('notes + photo', async () => {
    await type(visible(page.getByLabel('Notes', { exact: true })),
      'Pain lower right back tooth for a week, worse at night. Deep caries 46, tender on percussion. Did consultation 200 and IOPA 350. Started RCT on 46, 3500. Amoxicillin 500 three times a day for 5 days. Review Thursday evening.')
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Gallery' }).click()])
    current.taps++
    await chooser.setFiles(path.join(__dirname, '..', 'e2e', 'fixtures', 'tooth.png'))
    await type(visible(page.getByPlaceholder('What is this?')), 'x-ray')
    await snap(page, 'visit-new-filled')
    await tap(page.getByRole('button', { name: 'Next: Bill' }))
    await page.waitForURL(/\/app\/visits\/[^/?]+\?step=bill/, { timeout: 30_000 })
    visitUrl = page.url().split('?')[0]
    await snap(page, 'visit-bill-empty')
  })
  await step('back gesture from Bill step', async () => {
    await page.goBack(); await page.waitForTimeout(1200)
    back.push({ where: 'Visit, Bill step (reached with "Next: Bill")', after: new URL(page.url()).pathname + new URL(page.url()).search, heading: await page.locator('h1').first().innerText().catch(() => '') })
    await page.goto(`${visitUrl}?step=notes`)
  })
  await step('tidy up with AI', async () => {
    const started = Date.now()
    await tap(visible(page.getByRole('button', { name: /Tidy up/ })))
    const card = visible(page.getByLabel('Tidy note'))
    const error = page.locator('p[role="alert"]').filter({ visible: true }).filter({ hasNotText: 'Clinic OS' })
    await page.waitForFunction(() => {
      const busy = [...document.querySelectorAll('button')].some((b) => b.offsetParent !== null && /Tidying up/.test(b.textContent ?? ''))
      return !busy && (document.querySelector('#tidy-note') !== null || document.querySelector('p[role="alert"]') !== null)
    }, undefined, { timeout: 75_000 }).catch(() => {})
    const secs = Math.round((Date.now() - started) / 1000)
    if (await card.count()) {
      current.notes.push(`Tidy up answered in ${secs}s`)
      await snap(page, 'smart-note-card')
      const cardFull = await page.locator('body').innerText()
      messages['tidy-card-text'] = cardFull.slice(0, 3000)
      await page.goBack(); await page.waitForTimeout(1200)
      back.push({ where: 'Smart-note Confirm card open', after: new URL(page.url()).pathname + new URL(page.url()).search, cardStillOpen: (await visible(page.getByLabel('Tidy note')).count()) > 0 })
      if (!page.url().includes('/visits/')) await page.goto(`${visitUrl}?step=notes`)
      if (await visible(page.getByLabel('Tidy note')).count()) {
        await tap(visible(page.getByRole('button', { name: /Confirm and bill/ })))
        await page.waitForTimeout(3000)
      } else {
        current.notes.push('Card was gone after Back; tidy-up not confirmed')
      }
    } else {
      current.notes.push(`Tidy up gave no card after ${secs}s; message: ${(await error.allInnerTexts()).join(' | ').slice(0, 200)}`)
      await snap(page, 'smart-note-failed')
    }
  })
  await step('bill: add charge, UPI QR, part payment', async () => {
    await page.goto(`${visitUrl}?step=bill`)
    await snap(page, 'visit-bill')
    await tap(visible(page.getByRole('button', { name: 'Add charge' })))
    await snap(page, 'add-charge-open')
    await type(visible(page.getByLabel('What for')), 'Scaling')
    await type(visible(page.locator('#charge-amount')), '1500')
    await tap(visible(page.getByRole('button', { name: 'Add to bill' })))
    await page.waitForTimeout(1500)
    await type(visible(page.locator('#payment-amount')), '1000')
    await tap(visible(page.getByRole('button', { name: /Show UPI QR/ })))
    await snap(page, 'upi-qr')
    await tap(visible(page.getByRole('button', { name: /Collected cash/ })))
    await page.waitForTimeout(1500)
    await snap(page, 'visit-bill-part-paid')
  })
  await step('send: next visit + WhatsApp', async () => {
    await tap(visible(page.getByRole('button', { name: 'Next: Send' })))
    await page.waitForTimeout(800)
    await snap(page, 'visit-send')
    const box = visible(page.getByLabel('x-ray'))
    if (await box.count()) await tap(box)
    await captureWhatsapp(page, 'visit-message')
    await tap(visible(page.getByRole('button', { name: 'Send on WhatsApp' })))
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
    await page.waitForTimeout(1500); await snap(page, 'collect-bill')
    await tap(visible(page.getByRole('button', { name: /Collected cash/ })))
    await page.waitForTimeout(1500); await snap(page, 'collect-done')
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
      if (await go.count()) await tap(go); else await search.first().press('Enter')
      await page.waitForTimeout(1500)
      await snap(page, 'book-2-search')
    } else current.notes.push('No patient search box on the booking screen')
    const option = visible(page.locator('label').filter({ hasText: patientName }))
    if (await option.count()) await tap(option)
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
    const menu = visible(page.getByRole('button', { name: 'Visit menu' }))
    if (await menu.count()) { await menu.click(); await snap(page, 'visit-menu-open') }
    await page.goto(visitUrl); await snap(page, 'visit-notes-after')
  })

  // ---------------------------------------------------------------- clean up
  startJob('cleanup')
  await step('clean the test account', async () => { await cleanTestAccount() })

  fs.writeFileSync(path.join(OUT, 'tour.json'), JSON.stringify({ device: 'OnePlus 13 size (412x905 CSS px), Android 15 Chrome UA, touch', jobs, back, messages, failures, consoleErrors: [...new Set(consoleErrors)].slice(0, 40), shots }, null, 2))
  console.log('JOBS', JSON.stringify(jobs.map((j) => ({ job: j.job, taps: j.taps, typed: j.typed, pickers: j.pickers, screens: j.screens.length, ok: j.ok }))))
  console.log('FAILURES', JSON.stringify(failures))
})
