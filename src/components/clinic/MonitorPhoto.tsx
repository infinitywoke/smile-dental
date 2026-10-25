'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Loader2, Monitor, QrCode } from 'lucide-react'
import { siteConfig } from '@/config/site'
import { monitorPhotoUrl, pullMonitorPhoto, waitForMonitorPhoto } from '@/lib/offline/monitor-photo'
import { FullScreen, useBackToClose } from './FullScreen'

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
type DetectorClass = new (options: { formats: string[] }) => Detector

// The phone's camera, reading QR codes (Chrome on Android has a QR reader built in). Stops the camera
// as soon as one is read, or when closed.
function QrScanner({ onRead, onFail }: { onRead: (text: string) => void; onFail: (why: 'unsupported' | 'camera') => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const read = useRef(onRead)
  const fail = useRef(onFail)
  useEffect(() => {
    read.current = onRead
    fail.current = onFail
  })
  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const BarcodeDetector = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector
    void (async () => {
      if (!BarcodeDetector || !navigator.mediaDevices?.getUserMedia) return fail.current('unsupported')
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (stopped || !video.current) return
        video.current.srcObject = stream
        // Not waited for: the reader simply tries again until the picture is there
        void video.current.play().catch(() => {})
        const look = async () => {
          if (stopped || !video.current) return
          const codes = await detector.detect(video.current).catch(() => [])
          if (codes[0]?.rawValue) return read.current(codes[0].rawValue)
          timer = setTimeout(() => void look(), 250)
        }
        void look()
      } catch {
        if (!stopped) fail.current('camera')
      }
    })()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [])
  return <video ref={video} muted playsInline aria-label="Camera, pointed at the QR code" className="aspect-square w-full rounded-2xl bg-black object-cover" />
}

type Stage =
  | { at: 'scanning' }
  | { at: 'pulling' }
  // The photo couldn't be pulled straight in: Chrome opens it and shares it back (public/sw.js)
  | { at: 'share'; url: string }
  | { at: 'problem'; message: string }

const button = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold'

// A photo from the chair monitor: scan the QR code it shows, and the photo is pulled into this visit
// (src/lib/offline/monitor-photo.ts). Where Chrome or the monitor won't allow that, the share sheet brings it.
export function MonitorPhoto({ visitId, onPhoto }: { visitId: string; onPhoto: (file: File) => void }) {
  const sheet = useBackToClose()
  const [stage, setStage] = useState<Stage>({ at: 'scanning' })
  const [copied, setCopied] = useState(false)
  const monitor = siteConfig.chairMonitor

  const open = () => {
    // If the photo has to come through the share sheet, it comes to this visit
    void waitForMonitorPhoto(visitId)
    setStage({ at: 'scanning' })
    sheet.show()
  }

  const onRead = async (text: string) => {
    const url = monitorPhotoUrl(text)
    if (!url) return setStage({ at: 'problem', message: "That QR code isn't a photo on the monitor. Scan the code the monitor shows for the photo." })
    setStage({ at: 'pulling' })
    const file = await pullMonitorPhoto(url)
    if (!file) return setStage({ at: 'share', url })
    onPhoto(file)
    sheet.close()
  }

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(monitor.password)
      setCopied(true)
    } catch {
      // Copying not allowed: the password is on screen to type
    }
  }

  return (
    <>
      <button type="button" onClick={open}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50">
        <Monitor className="h-4 w-4" aria-hidden="true" /> Monitor
      </button>
      {sheet.open && (
        <FullScreen title="Photo from the monitor" onClose={sheet.close}>
          <div className="space-y-4 text-base text-gray-900">
            <p className="rounded-xl bg-gray-50 px-3 py-2 text-sm ring-1 ring-gray-200">
              This phone on the {monitor.name} monitor&apos;s Wi-Fi: <span className="hud-mono font-semibold">{monitor.wifi}</span>, password{' '}
              <span className="hud-mono font-semibold">{monitor.password}</span>
              <button type="button" onClick={() => void copyPassword()} className="ml-1 inline-flex min-h-12 items-center gap-1 px-1 font-semibold text-blue-700">
                {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />} {copied ? 'Copied' : 'Copy'}
              </button>
            </p>

            {stage.at === 'scanning' && (
              <>
                <p>Point the camera at the QR code on the monitor.</p>
                <QrScanner onRead={(text) => void onRead(text)} onFail={(why) => setStage({
                  at: 'problem',
                  message: why === 'unsupported'
                    ? "This phone can't read QR codes in Clinic OS. Scan it with the phone's camera app: the photo opens in Chrome; press and hold it, tap Share image, then Clinic OS."
                    : "The camera didn't open. Allow the camera for Clinic OS, then try again.",
                })} />
              </>
            )}

            {stage.at === 'pulling' && (
              <p role="status" className="flex items-center gap-2 py-6 text-gray-700"><Loader2 className="h-5 w-5 animate-spin" /> Getting the photo from the monitor…</p>
            )}

            {stage.at === 'share' && (
              <div className="space-y-3">
                <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                  This phone didn&apos;t let Clinic OS fetch the photo itself (if Chrome asked about devices on the local network, tap Allow and scan again). It can come another way:
                </p>
                <ol className="list-decimal space-y-1 pl-6">
                  <li>Open the photo.</li>
                  <li>Press and hold it, tap <strong>Share image</strong>, then <strong>Clinic OS</strong>.</li>
                </ol>
                <p className="text-sm text-gray-600">It comes back to this visit, under Photos, and uploads once the phone is back on the internet.</p>
                <a href={stage.url} target="_blank" rel="noopener noreferrer" className={`${button} bg-blue-600 text-white`}>
                  <ExternalLink className="h-5 w-5" aria-hidden="true" /> Open the photo
                </a>
              </div>
            )}

            {stage.at === 'problem' && (
              <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">{stage.message}</p>
            )}

            {(stage.at === 'share' || stage.at === 'problem') && (
              <button type="button" onClick={() => setStage({ at: 'scanning' })} className={`${button} bg-white text-gray-900 ring-1 ring-gray-300`}>
                <QrCode className="h-5 w-5" aria-hidden="true" /> Scan again
              </button>
            )}
          </div>
        </FullScreen>
      )}
    </>
  )
}
