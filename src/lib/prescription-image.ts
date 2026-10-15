import { siteConfig } from '@/config/site'

// The typed prescription on the clinic's letterhead, drawn on the phone as a JPEG to share on WhatsApp.
// Only the patient's first name is on it (like every message to the patient).

const W = 1080
const MIN_H = 1528 // A-paper shape
const PAD = 72
const NAVY = '#0b2357'
const INK = '#111827'
const GREY = '#4b5563'
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'

export type PrescriptionSheet = {
  firstName: string
  date: string // "15 Oct 2026"
  medicines: string[]
  advice: string
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

// Splits text into lines that fit the width
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      out.push(line)
      line = word
    }
  }
  if (line) out.push(line)
  return out
}

let logo: Promise<HTMLImageElement | null> | null = null

export async function drawPrescription(sheet: PrescriptionSheet): Promise<Blob> {
  logo ??= loadImage(siteConfig.media.logo)
  const logoImg = await logo
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const degree = siteConfig.dentist.qualifications.split(',')[0].trim()
  const textWidth = W - PAD * 2

  // Work out the height first: the sheet grows for a long prescription
  const medicineFont = `400 34px ${FONT}`
  const adviceFont = `400 30px ${FONT}`
  ctx.font = medicineFont
  const medicineLines = sheet.medicines.map((m) => wrap(ctx, m, textWidth - 64))
  ctx.font = adviceFont
  const adviceLines = sheet.advice ? wrap(ctx, sheet.advice, textWidth) : []
  const HEADER_H = 300
  const bodyStart = HEADER_H + 190
  const medicinesH = medicineLines.reduce((h, l) => h + l.length * 46 + 22, 0)
  const adviceH = adviceLines.length ? 70 + adviceLines.length * 42 : 0
  const H = Math.max(MIN_H, bodyStart + medicinesH + adviceH + 320)
  canvas.width = W
  canvas.height = H

  // Paper
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Letterhead: navy band, logo, clinic, doctor, address
  ctx.fillStyle = NAVY
  ctx.fillRect(0, 0, W, HEADER_H)
  const logoSize = 176
  if (logoImg) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(PAD + logoSize / 2, 62 + logoSize / 2, logoSize / 2, 0, Math.PI * 2)
    ctx.clip()
    // The logo is a circle on navy: crop to its middle
    const s = Math.min(logoImg.width, logoImg.height) * 0.8
    ctx.drawImage(logoImg, (logoImg.width - s) / 2, (logoImg.height - s) / 2, s, s, PAD, 62, logoSize, logoSize)
    ctx.restore()
  }
  const left = PAD + logoSize + 36
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `700 54px ${FONT}`
  ctx.fillText(siteConfig.name, left, 118)
  ctx.font = `600 36px ${FONT}`
  ctx.fillText(`${siteConfig.dentist.name}, ${degree}`, left, 170)
  ctx.font = `400 26px ${FONT}`
  ctx.fillStyle = '#c7d2fe'
  const reg = siteConfig.dentist.registration
  if (reg) ctx.fillText(`Reg. No. ${reg}`, left, 210)
  ctx.fillText(`Phone / WhatsApp: ${siteConfig.phone}`, left, reg ? 248 : 214)

  // Patient and date
  let y = HEADER_H + 80
  ctx.fillStyle = INK
  ctx.font = `600 34px ${FONT}`
  ctx.fillText(`Patient: ${sheet.firstName}`, PAD, y)
  ctx.textAlign = 'right'
  ctx.fillText(`Date: ${sheet.date}`, W - PAD, y)
  ctx.textAlign = 'left'
  y += 34
  ctx.fillStyle = '#e5e7eb'
  ctx.fillRect(PAD, y, textWidth, 3)

  // Rx
  y = bodyStart + 10
  ctx.fillStyle = NAVY
  ctx.font = `700 68px Georgia, "Times New Roman", serif`
  ctx.fillText('℞', PAD, y)
  y += 40

  ctx.font = medicineFont
  medicineLines.forEach((lines, i) => {
    y += 46
    ctx.fillStyle = NAVY
    ctx.font = `700 34px ${FONT}`
    ctx.fillText(`${i + 1}.`, PAD, y)
    ctx.fillStyle = INK
    ctx.font = medicineFont
    lines.forEach((line, j) => ctx.fillText(line, PAD + 64, y + j * 46))
    y += (lines.length - 1) * 46 + 22
  })

  if (adviceLines.length) {
    y += 70
    ctx.fillStyle = NAVY
    ctx.font = `700 30px ${FONT}`
    ctx.fillText('Advice', PAD, y)
    ctx.fillStyle = GREY
    ctx.font = adviceFont
    adviceLines.forEach((line) => {
      y += 42
      ctx.fillText(line, PAD, y)
    })
  }

  // Signature
  const sigY = H - 200
  ctx.fillStyle = '#9ca3af'
  ctx.fillRect(W - PAD - 360, sigY, 360, 2)
  ctx.fillStyle = INK
  ctx.textAlign = 'right'
  ctx.font = `600 30px ${FONT}`
  ctx.fillText(siteConfig.dentist.name, W - PAD, sigY + 44)
  ctx.fillStyle = GREY
  ctx.font = `400 26px ${FONT}`
  ctx.fillText(degree, W - PAD, sigY + 80)
  ctx.textAlign = 'left'

  // Footer: address
  ctx.fillStyle = NAVY
  ctx.fillRect(0, H - 80, W, 80)
  ctx.fillStyle = '#ffffff'
  ctx.font = `400 22px ${FONT}`
  const address = wrap(ctx, siteConfig.address, textWidth)
  ctx.textAlign = 'center'
  address.slice(0, 2).forEach((line, i) => ctx.fillText(line, W / 2, H - (address.length > 1 ? 48 : 32) + i * 28))
  ctx.textAlign = 'left'

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no image'))), 'image/jpeg', 0.92)
  })
}
