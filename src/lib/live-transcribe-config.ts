// Shared by the server (which locks the token to this) and the browser (which must connect with
// exactly this). Model ID is from ai.google.dev/gemini-api/docs/models/gemini-3.5-transcribe.

export const LIVE_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe-live'

// Words the doctor says that speech recognition often gets wrong
const VOCABULARY = [
  'RCT', 'IOPA', 'OPG', 'pulpitis', 'caries', 'periapical', 'abscess', 'gingivitis', 'periodontitis', 'scaling',
  'extraction', 'composite', 'zirconia', 'crown', 'bridge', 'denture', 'post and core', 'build-up', 'pulpectomy',
  'pulpotomy', 'apicoectomy', 'cavity', 'percussion', 'mobility', 'molar', 'premolar', 'incisor', 'canine',
  'wisdom tooth', 'impacted', 'amoxicillin', 'amoxyclav', 'augmentin', 'metronidazole', 'paracetamol',
  'ibuprofen', 'aceclofenac', 'diclofenac', 'pantoprazole', 'chlorhexidine', 'lignocaine', 'articaine',
  'UPI', 'Ivoclar', 'e.max', 'FDI',
]

export const LIVE_TRANSCRIBE_CONFIG = {
  responseModalities: ['TEXT'],
  inputAudioTranscription: {
    // The doctor dictates in English
    languageCodes: ['en-IN'],
    customVocabulary: VOCABULARY,
    // Removes filler words and self-corrections, and writes numbers and lists neatly
    mode: 'SMART',
  },
}
