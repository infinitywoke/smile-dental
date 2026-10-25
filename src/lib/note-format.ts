// Visit notes are kept as plain text (the box he types in, the prescription read back from it, Tally's
// narration). Shown, they read like a document: a heading on its own line ("Findings:") in bold, a
// label before its text ("Complaint: pain in 46") in bold, "- " lines as a list, other lines as they are.

export type NoteBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'line'; label: string | null; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'gap' }

// A heading or label: starts with a letter, a few words, then a colon ("Treatment done:", "Complaint:")
const LABEL = /^([A-Za-z][A-Za-z ()/&'-]{0,30}):\s*(.*)$/
const POINT = /^\s*[-*•]\s+(.*)$/

export function noteBlocks(text: string): NoteBlock[] {
  const blocks: NoteBlock[] = []
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim()
    const last = blocks[blocks.length - 1]
    if (!line) {
      if (last && last.kind !== 'gap') blocks.push({ kind: 'gap' })
      continue
    }
    const point = POINT.exec(raw)
    if (point) {
      if (last?.kind === 'list') last.items.push(point[1].trim())
      else blocks.push({ kind: 'list', items: [point[1].trim()] })
      continue
    }
    const label = LABEL.exec(line)
    if (label && !label[2]) blocks.push({ kind: 'heading', text: label[1].trim() })
    else if (label) blocks.push({ kind: 'line', label: label[1].trim(), text: label[2] })
    else blocks.push({ kind: 'line', label: null, text: line })
  }
  if (blocks[blocks.length - 1]?.kind === 'gap') blocks.pop()
  return blocks
}
