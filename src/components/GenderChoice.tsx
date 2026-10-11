'use client'

import { GENDERS, GENDER_LABEL, type Gender } from '@/lib/gender'

// Three big buttons, one tap. `id` is the first button's id, so a form can jump to the field.
export function GenderChoice({
  value,
  onChange,
  id = 'gender',
  name,
}: {
  value: Gender | ''
  onChange: (value: Gender | '') => void
  id?: string
  // When given, the choice is also posted with a plain <form>
  name?: string
}) {
  return (
    <div role="radiogroup" aria-label="Gender" className="flex gap-2">
      {GENDERS.map((option, index) => (
        <button key={option} type="button" role="radio" aria-checked={value === option}
          id={index === 0 ? id : undefined}
          onClick={() => onChange(value === option ? '' : option)}
          className={`flex-1 rounded-xl px-3 py-3 text-base font-medium ring-1 ring-inset transition-colors ${
            value === option ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-gray-700 ring-gray-300'
          }`}>
          {GENDER_LABEL[option]}
        </button>
      ))}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  )
}
