// Appends dictated text to existing notes as a new sentence
export function appendDictation(current: string, addition: string): string {
  if (!addition) return current
  const capitalised = addition.charAt(0).toUpperCase() + addition.slice(1)
  if (!current.trim()) return capitalised
  // Notes ending on a new line: keep the line break and start the new sentence there
  if (/\n[ \t]*$/.test(current)) return current.replace(/[ \t]+$/, '') + capitalised
  const separator = /[.!?]\s*$/.test(current) ? ' ' : '. '
  return current.replace(/\s+$/, '') + separator + capitalised
}
