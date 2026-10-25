import { describe, expect, it } from 'vitest'
import { noteBlocks } from './note-format'

describe('visit notes, shown like a document', () => {
  it('reads the recorded notes: headings bold, labels bold, points as a list, a gap between sections', () => {
    const notes = 'Complaint: Pain lower right back tooth\n\nFindings:\n- 46: deep caries (?)\n- Tender on percussion\n\nPrescription:\n- Amoxicillin 500 mg - three times a day - 5 days'
    expect(noteBlocks(notes)).toEqual([
      { kind: 'line', label: 'Complaint', text: 'Pain lower right back tooth' },
      { kind: 'gap' },
      { kind: 'heading', text: 'Findings' },
      { kind: 'list', items: ['46: deep caries (?)', 'Tender on percussion'] },
      { kind: 'gap' },
      { kind: 'heading', text: 'Prescription' },
      { kind: 'list', items: ['Amoxicillin 500 mg - three times a day - 5 days'] },
    ])
  })

  it('keeps typed notes as they are: a tooth number is not a label, extra blank lines are one gap', () => {
    expect(noteBlocks('46: RCT started\n\n\n\nreview in a week\n\n')).toEqual([
      { kind: 'line', label: null, text: '46: RCT started' },
      { kind: 'gap' },
      { kind: 'line', label: null, text: 'review in a week' },
    ])
    expect(noteBlocks('* scaling done\n• polish')).toEqual([{ kind: 'list', items: ['scaling done', 'polish'] }])
    expect(noteBlocks('   ')).toEqual([])
  })
})
