'use client'

import { Mars, Transgender, Venus } from 'lucide-react'
import { GENDERS, GENDER_LABEL, type Gender } from '@/lib/gender'

const ICON = { female: Venus, male: Mars, other: Transgender } as const

// One tap. Three large tiles with a symbol, so it can be hit without looking and read at a glance.
// `id` is the first tile's id, so a form can jump to the field.
export function GenderChoice({
  value,
  onChange,
  id = 'gender',
  name,
}: {
  value: Gender | ''
  onChange: (value: Gender) => void
  id?: string
  // When given, the choice is also posted with a plain <form>
  name?: string
}) {
  return (
    <div role="radiogroup" aria-label="Gender" className="grid grid-cols-3 gap-2">
      {GENDERS.map((option, index) => {
        const Icon = ICON[option]
        const selected = value === option
        return (
          <button key={option} type="button" role="radio" aria-checked={selected}
            id={index === 0 ? id : undefined}
            onClick={() => onChange(option)}
            className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3.5 text-base font-semibold ring-2 ring-inset transition active:scale-95 ${
              selected ? 'bg-blue-600 text-white ring-blue-600 shadow-md shadow-blue-600/20' : 'bg-white text-gray-700 ring-gray-200 hover:ring-blue-300'
            }`}>
            <Icon className="h-6 w-6" aria-hidden="true" />
            {GENDER_LABEL[option]}
          </button>
        )
      })}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  )
}
