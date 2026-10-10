'use client'

import { useState, useEffect } from 'react'
import { Calendar, User, Phone, CheckCircle2, ArrowLeft, ArrowRight, ClipboardList, MapPin, AlertCircle, X } from 'lucide-react'
import { siteConfig } from '@/config/site'

type BookingData = {
  name: string
  phone: string
  dob: string
  medical_alerts: string
  heard_from: string
  location: string
  city: string
  reason: string
  notes: string
  preferred_date: string
  preferred_time: string
  preferred_time_ampm: 'AM' | 'PM'
}

// Same options the clinic app offers when a new patient walks in
const HEARD_FROM = ['Friend / family', 'Google', 'Website', 'Walked past', 'Instagram', 'Doctor referral']

const MORNING_SLOTS = ["08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"]
const AFTERNOON_SLOTS = ["14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"]

function formatTimeDisplay(time24: string) {
  const [h, m] = time24.split(':')
  let hours = parseInt(h, 10)
  const ampm = hours >= 12 ? 'PM' : 'AM'
  if (hours > 12) hours -= 12
  if (hours === 0) hours = 12
  return `${hours}:${m} ${ampm}`
}

function parseTimeForData(time24: string): { time: string, ampm: 'AM' | 'PM' } {
  const [h, m] = time24.split(':')
  let hours = parseInt(h, 10)
  const ampm = hours >= 12 ? 'PM' : 'AM'
  if (hours > 12) hours -= 12
  if (hours === 0) hours = 12
  const time = `${hours.toString().padStart(2, '0')}:${m}`
  return { time, ampm }
}

function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function PublicBookingForm() {
  const [step, setStep] = useState<number>(1)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [isSOS, setIsSOS] = useState(false)

  const [data, setData] = useState<BookingData>({
    name: '',
    phone: '',
    dob: '',
    medical_alerts: '',
    heard_from: '',
    location: '',
    city: '',
    reason: '',
    notes: '',
    preferred_date: '',
    preferred_time: '',
    preferred_time_ampm: 'AM'
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && !data.reason) {
      const urlParams = new URLSearchParams(window.location.search)
      const reasonParam = urlParams.get('reason')
      if (reasonParam) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setData(prev => ({ ...prev, reason: reasonParam }))
      }
    }
  }, [])

  const updateData = (updates: Partial<BookingData>) => {
    setData(prev => ({ ...prev, ...updates }))
  }

  const handleNext = () => setStep(s => Math.min(s + 1, 4))
  const handleBack = () => setStep(s => Math.max(s - 1, 1))

  const handleSOS = () => {
    setIsSOS(true)
    setError(null)

    try {
      const allSlots = [...MORNING_SLOTS, ...AFTERNOON_SLOTS]
      const now = new Date()
      const checkDate = new Date()
      let foundDateStr = ''
      let foundTime24 = ''

      // Look up to 7 days ahead for the earliest slot within clinic hours
      for (let i = 0; i < 7; i++) {
        // Skip Fridays
        if (checkDate.getDay() === 5) {
          checkDate.setDate(checkDate.getDate() + 1)
          continue
        }

        const dateStr = getLocalDateString(checkDate)
        const isToday = dateStr === getLocalDateString(now)

        for (const time24 of allSlots) {
          if (isToday) {
            const [h, m] = time24.split(':').map(Number)
            const currentHour = now.getHours()
            const currentMinute = now.getMinutes()
            if (h < currentHour || (h === currentHour && m <= currentMinute)) {
              continue // Slot has passed today
            }
          }
          
          // Found earliest available slot!
          foundDateStr = dateStr
          foundTime24 = time24
          break
        }
        
        if (foundDateStr) break;
        checkDate.setDate(checkDate.getDate() + 1)
      }
      
      if (!foundDateStr) {
        throw new Error("No available slots found in the next 7 days. Please call the clinic directly.")
      }

      const { time, ampm } = parseTimeForData(foundTime24)
      updateData({ preferred_date: foundDateStr, preferred_time: time, preferred_time_ampm: ampm, reason: 'EMERGENCY' })
      
    } catch (err) {
      setError((err instanceof Error && err.message) || "Failed to find an emergency slot. Please call the clinic directly.")
    }
  }

  const handleCloseSOS = () => {
    setIsSOS(false)
    // Only proceed to step 4 if we actually found a date (no error occurred)
    if (data.preferred_date && data.preferred_time) {
      setStep(4)
    }
  }

  const handleSlotSelect = (time24: string) => {
    const { time, ampm } = parseTimeForData(time24)
    updateData({ preferred_time: time, preferred_time_ampm: ampm })
  }

  // Booking requests are sent to the clinic's WhatsApp as a pre-filled message
  const buildWhatsAppUrl = () => {
    const lines = [
      data.reason === 'EMERGENCY' ? '*EMERGENCY appointment request (website)*' : '*Appointment request (website)*',
      `Name: ${data.name}`,
      `Phone: ${data.phone}`,
      ...(data.dob ? [`Date of birth: ${new Date(data.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`] : []),
      `Area: ${data.location}, ${data.city}`,
      `Medical alerts: ${data.medical_alerts.trim() || 'None'}`,
      ...(data.heard_from.trim() ? [`Heard about us: ${data.heard_from.trim()}`] : []),
      `Reason: ${data.reason}`,
      `Preferred: ${new Date(data.preferred_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, ${data.preferred_time ? `${data.preferred_time} ${data.preferred_time_ampm}` : 'any time'}`,
    ]
    if (data.notes.trim()) lines.push(`Notes: ${data.notes.trim()}`)
    return `https://wa.me/${siteConfig.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(lines.join('\n'))}`
  }

  const handleSubmit = () => {
    setError(null)
    const url = buildWhatsAppUrl()
    const opened = window.open(url, '_blank')
    if (opened) opened.opener = null
    else window.location.href = url
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-lg border border-gray-100 p-8 text-center">
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Almost done!</h2>
        <p className="text-gray-600 mb-6">
          Thank you, {data.name}. Your request is ready in WhatsApp — just tap <strong>Send</strong>. We&apos;ll reply on {data.phone} to confirm your appointment time.
        </p>
        <a
          href={buildWhatsAppUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          WhatsApp didn&apos;t open? Tap here
        </a>
      </div>
    )
  }

  const isFriday = data.preferred_date ? new Date(data.preferred_date).getDay() === 5 : false
  
  const isPast = (time24: string) => {
    if (!data.preferred_date) return false;
    const todayStr = getLocalDateString();
    const isToday = data.preferred_date === todayStr;
    if (!isToday) return false;
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const [h, m] = time24.split(':').map(Number);
    return h < currentHour || (h === currentHour && m <= currentMinute);
  };

  const selectedTime24 = (() => {
    if (!data.preferred_time) return null
    const [h, m] = data.preferred_time.split(':')
    let hours = parseInt(h, 10)
    if (data.preferred_time_ampm === 'PM' && hours !== 12) hours += 12
    if (data.preferred_time_ampm === 'AM' && hours === 12) hours = 0
    return `${hours.toString().padStart(2, '0')}:${m}`
  })()

  return (
    <div className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="bg-gray-100 h-1.5 w-full">
        <div 
          className="bg-blue-600 h-1.5 transition-all duration-300 ease-in-out" 
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>

      <div className="p-6 sm:p-8">
        {error && (
          <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-lg text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Your Details</h2>
              <p className="text-gray-500 mt-2">Let us know how to reach you.</p>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={data.name}
                  onChange={(e) => updateData({ name: e.target.value })}
                  className="pl-11 block w-full rounded-lg border-gray-300 py-3 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="John Doe"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Phone Number</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  value={data.phone}
                  onChange={(e) => updateData({ phone: e.target.value })}
                  className="pl-11 block w-full rounded-lg border-gray-300 py-3 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Date of Birth</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Calendar className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="date"
                  value={data.dob}
                  onChange={(e) => updateData({ dob: e.target.value })}
                  max={getLocalDateString()}
                  className="pl-11 block w-full rounded-lg border-gray-300 py-3 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Locality / Area</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <MapPin className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={data.location}
                  onChange={(e) => updateData({ location: e.target.value })}
                  className="pl-11 block w-full rounded-lg border-gray-300 py-3 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="e.g., Yenna Gudde"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">City / Town</label>
              <input
                type="text"
                value={data.city}
                onChange={(e) => updateData({ city: e.target.value })}
                className="block w-full rounded-lg border-gray-300 py-3 px-4 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="e.g., Udupi"
              />
            </div>

            <button
              onClick={handleNext}
              disabled={!data.name.trim() || !data.phone.trim() || !data.dob || !data.city.trim() || !data.location.trim()}
              className="w-full mt-8 flex items-center justify-center gap-2 py-3.5 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">Why are you visiting?</h2>
              <p className="text-gray-500 mt-2">Help us prepare for your visit.</p>
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Reason for Visit</label>
              <select
                value={data.reason}
                onChange={(e) => updateData({ reason: e.target.value })}
                className="block w-full rounded-lg border-gray-300 py-3 px-4 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm bg-white"
                autoFocus
              >
                <option value="">Select a reason...</option>
                <option value="General Checkup">General Checkup / Cleaning</option>
                <option value="Tooth Pain">Tooth Pain</option>
                <option value="Consultation">Consultation</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Medical Alerts (Optional)</label>
              <textarea
                value={data.medical_alerts}
                onChange={(e) => updateData({ medical_alerts: e.target.value })}
                rows={2}
                className="block w-full rounded-lg border-gray-300 py-3 px-4 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Allergies, diabetes, BP, blood thinners, regular medicines… Leave empty if none."
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">How did you hear about us? (Optional)</label>
              <div className="flex flex-wrap gap-2">
                {HEARD_FROM.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => updateData({ heard_from: data.heard_from === option ? '' : option })}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
                      data.heard_from === option
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-blue-500'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Additional Notes (Optional)</label>
              <textarea
                value={data.notes}
                onChange={(e) => updateData({ notes: e.target.value })}
                rows={3}
                className="block w-full rounded-lg border-gray-300 py-3 px-4 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder="Any details you'd like us to know?"
              />
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={handleBack}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-lg text-base font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
              <button
                onClick={handleNext}
                disabled={!data.reason}
                className="flex-[2] flex items-center justify-center gap-2 py-3.5 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">When works best?</h2>
              <p className="text-gray-500 mt-2">Choose your preferred date & time.</p>
            </div>

            {/* SOS Button Section */}
            {!isSOS ? (
              <button 
                onClick={handleSOS}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-red-50 text-red-600 font-semibold border border-red-200 hover:bg-red-100 transition-colors mb-6"
              >
                <AlertCircle className="w-5 h-5" />
                SOS / This is an Emergency
              </button>
            ) : (
              <div className="w-full bg-red-600 text-white rounded-lg p-4 mb-6 relative shadow-lg">
                <button 
                  onClick={handleCloseSOS}
                  className="absolute top-2 right-2 text-red-200 hover:text-white p-1 rounded-full hover:bg-red-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex flex-col items-center text-center space-y-2 mt-2">
                  <AlertCircle className="w-8 h-8 text-red-200" />
                  <h3 className="font-bold text-lg">Emergency Assistance</h3>
                  <p className="text-red-100 text-sm mb-2">Please call the clinic immediately to confirm an urgent slot:</p>
                  <a href={`tel:${siteConfig.phone.replace(/\D/g,'')}`} className="text-2xl font-black tracking-wider hover:underline">
                    {siteConfig.phone}
                  </a>
                  <p className="text-xs text-red-200 mt-2">Close this banner to proceed with the earliest available appointment request.</p>
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Preferred Date</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Calendar className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="date"
                  value={data.preferred_date}
                  onChange={(e) => updateData({ preferred_date: e.target.value })}
                  min={getLocalDateString()}
                  className="pl-11 block w-full rounded-lg border-gray-300 py-3 text-gray-900 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>
            </div>

            {data.preferred_date && isFriday && (
              <div className="bg-orange-50 border border-orange-200 text-orange-800 p-4 rounded-lg text-center font-medium">
                Our clinic is closed on Fridays. Please select another date.
              </div>
            )}

            {data.preferred_date && !isFriday && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-4 flex justify-between items-center">
                  <span>Available Time Slots</span>
                </label>
                
                <div className="space-y-6">
                  {/* Morning Slots */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Morning</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {MORNING_SLOTS.map(time24 => {
                        const isBooked = isPast(time24)
                        const isSelected = selectedTime24 === time24
                        return (
                          <button
                            key={time24}
                            disabled={isBooked}
                            onClick={() => handleSlotSelect(time24)}
                            className={`py-2 px-1 text-sm font-medium rounded-md border text-center transition-all ${
                              isBooked 
                                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60' 
                                : isSelected
                                ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                : 'bg-white border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50'
                            }`}
                          >
                            {formatTimeDisplay(time24)}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Lunch Break Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-3 text-xs font-semibold text-gray-400 uppercase">Lunch Break (1:00 PM - 2:30 PM)</span>
                    </div>
                  </div>

                  {/* Afternoon Slots */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Afternoon</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {AFTERNOON_SLOTS.map(time24 => {
                        const isBooked = isPast(time24)
                        const isSelected = selectedTime24 === time24
                        return (
                          <button
                            key={time24}
                            disabled={isBooked}
                            onClick={() => handleSlotSelect(time24)}
                            className={`py-2 px-1 text-sm font-medium rounded-md border text-center transition-all ${
                              isBooked 
                                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-60' 
                                : isSelected
                                ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                : 'bg-white border-gray-300 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50'
                            }`}
                          >
                            {formatTimeDisplay(time24)}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button
                onClick={handleBack}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-lg text-base font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" /> Back
              </button>
              <button
                onClick={handleNext}
                disabled={!data.preferred_date || isFriday || (!data.preferred_time && !isSOS)}
                className="flex-[2] flex items-center justify-center gap-2 py-3.5 px-4 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Review <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <ClipboardList className="h-12 w-12 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900">Review Request</h2>
              <p className="text-gray-500 mt-2">Almost done! Please review your details.</p>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-6 space-y-4 border border-gray-100 text-sm">
              <div className="flex justify-between border-b border-gray-200 pb-3">
                <span className="text-gray-500">Name</span>
                <span className="font-medium text-gray-900">{data.name}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-3">
                <span className="text-gray-500">Phone</span>
                <span className="font-medium text-gray-900">{data.phone}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-3">
                <span className="text-gray-500">Date of birth</span>
                <span className="font-medium text-gray-900">{data.dob ? new Date(data.dob).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-3">
                <span className="text-gray-500">Locality/Area</span>
                <span className="font-medium text-gray-900">{data.location}, {data.city}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-gray-200 pb-3">
                <span className="text-gray-500 shrink-0">Medical alerts</span>
                <span className="font-medium text-gray-900 text-right">{data.medical_alerts.trim() || 'None'}</span>
              </div>
              {data.heard_from.trim() && (
                <div className="flex justify-between border-b border-gray-200 pb-3">
                  <span className="text-gray-500">Heard about us</span>
                  <span className="font-medium text-gray-900">{data.heard_from}</span>
                </div>
              )}
              <div className="flex justify-between border-b border-gray-200 pb-3">
                <span className="text-gray-500">Reason</span>
                <span className="font-medium text-gray-900">{data.reason}</span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-3">
                <span className="text-gray-500">Date</span>
                <span className="font-medium text-gray-900">{new Date(data.preferred_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Time</span>
                <span className="font-medium text-gray-900">{data.preferred_time ? `${data.preferred_time} ${data.preferred_time_ampm}` : 'Any time'}</span>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                onClick={handleBack}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 rounded-lg text-base font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <ArrowLeft className="w-5 h-5" /> Edit
              </button>
              <button
                onClick={handleSubmit}
                className="flex-[2] flex items-center justify-center gap-2 py-3.5 px-4 border border-transparent rounded-lg shadow-lg shadow-blue-500/30 text-base font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Send Request on WhatsApp
              </button>
            </div>
            
            <p className="text-xs text-center text-gray-400 mt-4">
              This opens WhatsApp with your request. The clinic will reply to confirm the exact time.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
