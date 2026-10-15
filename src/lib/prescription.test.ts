import { describe, expect, it } from 'vitest'
import { addPrescriptionLine, adviceText, prescriptionLines, quickMedicines, removePrescriptionLine, STARTER_MEDICINES } from './prescription'

const notes = [
  'Complaint: Pain lower right',
  'Prescription:',
  '- Amoxicillin 500 - TDS - 5 days',
  '- Ibuprofen 400 - SOS',
  'Advice: Soft food for a day',
].join('\n')

describe('prescription in the notes', () => {
  it('reads the medicines and the advice', () => {
    expect(prescriptionLines(notes)).toEqual(['Amoxicillin 500 - TDS - 5 days', 'Ibuprofen 400 - SOS'])
    expect(adviceText(notes)).toBe('Soft food for a day')
    expect(prescriptionLines('Rx: Chlorhexidine mouthwash\n1. Paracetamol 650')).toEqual(['Chlorhexidine mouthwash', 'Paracetamol 650'])
    expect(prescriptionLines('Complaint: none')).toEqual([])
  })

  it('adds a medicine at the end of the list, or starts the list', () => {
    expect(addPrescriptionLine(notes, 'Pantoprazole 40')).toBe(notes.replace('- Ibuprofen 400 - SOS', '- Ibuprofen 400 - SOS\n- Pantoprazole 40'))
    expect(addPrescriptionLine(notes, ' ibuprofen 400  - sos ')).toBe(notes)
    expect(addPrescriptionLine('Complaint: Pain\n', 'Paracetamol 650')).toBe('Complaint: Pain\nPrescription:\n- Paracetamol 650')
    expect(addPrescriptionLine('', 'Paracetamol 650')).toBe('Prescription:\n- Paracetamol 650')
  })

  it('removes a medicine, and the heading with the last one', () => {
    expect(prescriptionLines(removePrescriptionLine(notes, 0))).toEqual(['Ibuprofen 400 - SOS'])
    const none = removePrescriptionLine(removePrescriptionLine(notes, 0), 0)
    expect(none).toBe('Complaint: Pain lower right\nAdvice: Soft food for a day')
    expect(prescriptionLines(removePrescriptionLine('Rx: Chlorhexidine\n- Paracetamol', 0))).toEqual(['Paracetamol'])
  })

  it('offers his most used medicines first, then the starter list', () => {
    const quick = quickMedicines([notes, 'Prescription:\n- Ibuprofen 400 - SOS'], 4)
    expect(quick.slice(0, 2)).toEqual(['Ibuprofen 400 - SOS', 'Amoxicillin 500 - TDS - 5 days'])
    expect(quick.slice(2)).toEqual(STARTER_MEDICINES.slice(0, 2))
  })
})
