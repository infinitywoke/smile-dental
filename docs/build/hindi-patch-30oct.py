import io, re

def rd(p):
    return io.open(p, encoding='utf-8', newline='').read()

def wr(p, s):
    io.open(p, 'w', encoding='utf-8', newline='').write(s)

def sub(p, pairs):
    s = rd(p)
    crlf = '\r\n' in s
    for a, b in pairs:
        if crlf:
            a = a.replace('\n', '\r\n')
            b = b.replace('\n', '\r\n')
        assert a in s, (p, a)
        s = s.replace(a, b)
    wr(p, s)

# Each Kannada line's ternary gets the Hindi in front of it: language === 'hi' ? <hindi> : kn ? <kannada> : <english>
COND = re.compile(r"(language === 'kn'|\bkn)\s*\?")

def hindi_before(s, snippet, hindi):
    assert s.count(snippet) == 1, (snippet, s.count(snippet))
    at = s.index(snippet)
    conds = list(COND.finditer(s, 0, at))
    assert conds, snippet
    start = conds[-1].start()
    return s[:start] + "language === 'hi' ? " + hindi + ' : ' + s[start:]

WHATSAPP = [
    ("`ನಮಸ್ಕಾರ ${firstName(name)} ಅವರೇ,`", "`नमस्ते ${firstName(name)} जी,`"),
    ("['', 'ಶುಭಾಶಯಗಳೊಂದಿಗೆ,'", "['', 'शुभकामनाओं सहित,', `*${dentist.name}*`, `${clinic.name}, ${clinic.place}`]"),
    ("[`ದಿನಾಂಕ: *", "[`तारीख: *${hindiDate(date)}*`, `समय: *${hindiTime(time)}*`]"),
    ("'ವಿಳಾಸ'", "'पता'"),
    ("`ಏನಾದರೂ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ", "`कोई सवाल हो तो ${callUsHi(ctx)}।`"),
    ("'_ದಯವಿಟ್ಟು 5", "'_कृपया 5 मिनट पहले आ जाएँ।_'"),
    ("'ದಾರಿ'", "'रास्ता'"),
    ("`ಸಮಯ ಬದಲಿಸಲು", "`समय बदलने या रद्द करने के लिए ${callUsHi(ctx)}।`"),
    ("`${clinic.name} ನಲ್ಲಿ ನಿಮ್ಮ ${APPOINTMENT_KN} *ಖಚಿತವಾಗಿದೆ*.`", "`${clinic.name} में आपकी अपॉइंटमेंट *पक्की हो गई है*।`"),
    ("`${clinic.name} ನಲ್ಲಿ ನಿಮ್ಮ ${APPOINTMENT_KN} ಅನ್ನು ಈ ಸಮಯಕ್ಕೆ", "`${clinic.name} में आपकी अपॉइंटमेंट का समय बदल गया है। नया समय यह है:`"),
    ("`${clinic.name} ನಲ್ಲಿ ನಿಮ್ಮ ಈ ${APPOINTMENT_KN} *ರದ್ದಾಗಿದೆ*:`", "`${clinic.name} में आपकी यह अपॉइंटमेंट *रद्द हो गई है*:`"),
    ("`ಹೊಸ ಸಮಯ ಬುಕ್", "`जब भी नया समय चाहें, ${callUsHi(ctx)}।`"),
    ("`${clinic.name} ಅನ್ನು ಸಂಪರ್ಕಿಸಿದ್ದಕ್ಕಾಗಿ", "`${clinic.name} से संपर्क करने के लिए धन्यवाद।`"),
    ("`ಕ್ಷಮಿಸಿ, ನೀವು ಕೇಳಿದ", "`माफ़ कीजिए, आपका बताया हुआ समय हम नहीं दे पाए। कृपया ${callUsHi(ctx)}, हम आपके लिए सही समय ढूँढ लेंगे।`"),
    ("(args.tomorrow ? `ನಾಳೆ", "(args.tomorrow ? 'याद दिलाना था कि कल आपकी अपॉइंटमेंट है:' : 'याद दिलाना था कि आपकी अपॉइंटमेंट आने वाली है:')"),
    ("`ಬರಲು ಆಗದಿದ್ದರೆ", "`अगर आप नहीं आ पाएँ तो कृपया ${callUsHi(ctx)}, ताकि वह समय किसी और को दे सकें।`"),
    ("`${kannadaDate(date)} ರಂದು", "`${hindiDate(date)} को आपकी अपॉइंटमेंट पर आपसे मिलना नहीं हो पाया। उम्मीद है सब ठीक है।`"),
    ("'ಈ ಸಂದೇಶಕ್ಕೆ ಉತ್ತರಿಸಿ, ನಿಮಗೆ ಅನುಕೂಲವಾದ ಹೊಸ", "'इस संदेश का जवाब दें, हम आपके लिए सही नया समय तय कर देंगे।'"),
    ("`${dentist.shortNameKn ?? dentist.shortName ?? dentist.name} ಅವರು", "`${dentist.shortName ?? dentist.name} आज लगभग ${args.minutes} मिनट देर से चल रहे हैं। इंतज़ार के लिए माफ़ कीजिए।`"),
    ("`ನಿಮ್ಮ ${APPOINTMENT_KN}:`", "'आपकी अपॉइंटमेंट:'"),
    ("`ನಿಮ್ಮ ಸಮಯಕ್ಕಿಂತ", "`आप अपने समय से लगभग ${args.minutes} मिनट बाद आ सकते हैं। अगर यह ठीक न लगे तो ${callUsHi(ctx)}।`"),
    ("`ನಿಮ್ಮ ಕೊನೆಯ ಭೇಟಿಯಿಂದ", "`आपकी पिछली विज़िट (${hindiDate(args.lastVisit, true)}) को लगभग छह महीने हो गए हैं, अब जाँच का समय है।`"),
    ("'ಪ್ರತಿ ಆರು", "'हर छह महीने में जाँच और सफ़ाई से दाँत और मसूड़े स्वस्थ रहते हैं और छोटी समस्याएँ जल्दी पकड़ में आ जाती हैं।'"),
    ("'ಈ ಸಂದೇಶಕ್ಕೆ ಉತ್ತರಿಸಿ, ನಿಮಗೆ ಅನುಕೂಲವಾದ ಸಮಯವನ್ನು ಬುಕ್", "'इस संदेश का जवाब दें, हम आपके लिए सही समय बुक कर देंगे।'"),
    ("`${clinic.name} ಗೆ ಭೇಟಿ", "`${clinic.name} आने के लिए धन्यवाद।`"),
    ("'ಒಂದು ನಿಮಿಷ ಸಮಯವಿದ್ದರೆ", "'अगर आपके पास एक मिनट हो, तो Google पर एक छोटा सा रिव्यू लिख दें। इससे आस-पास के लोगों को क्लिनिक ढूँढने में मदद मिलती है:'"),
]

p = 'src/lib/whatsapp.ts'
s = rd(p)
for snippet, hindi in WHATSAPP:
    s = hindi_before(s, snippet, hindi)
wr(p, s)

sub(p, [
    ("// The language of a patient's messages: Kannada once it is set on their record (patients.language),\n"
     "// else English. Website requests are answered in English: who sent one isn't known yet.\n"
     "export type MessageLanguage = 'en' | 'kn'\n"
     "export const messageLanguage = (value: string | null | undefined): MessageLanguage => (value === 'kn' ? 'kn' : 'en')\n",
     "// The language of a patient's messages: Kannada or Hindi once it is set on their record (patients.language),\n"
     "// else English. Website requests are answered in English: who sent one isn't known yet.\n"
     "export type MessageLanguage = 'en' | 'kn' | 'hi'\n"
     "export const messageLanguage = (value: string | null | undefined): MessageLanguage => (value === 'kn' || value === 'hi' ? value : 'en')\n"),
    ("// \"call or WhatsApp us on +91 …\"\n",
     "const HI_WEEKDAYS = ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार']\n"
     "const HI_MONTHS = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']\n"
     "\n"
     "// \"गुरुवार, 15 अक्टूबर\"; with the year in place of the day, \"15 अक्टूबर 2026\"\n"
     "export function hindiDate(date: string, withYear = false): string {\n"
     "  const [y, m, d] = date.split('-').map(Number)\n"
     "  return withYear ? `${d} ${HI_MONTHS[m - 1]} ${y}` : `${HI_WEEKDAYS[weekday(date)]}, ${d} ${HI_MONTHS[m - 1]}`\n"
     "}\n"
     "\n"
     "// \"14:30\" -> \"दोपहर 2:30\"\n"
     "export function hindiTime(hhmm: string): string {\n"
     "  const [h, m] = hhmm.split(':').map(Number)\n"
     "  const part = h < 12 ? 'सुबह' : h < 16 ? 'दोपहर' : h < 20 ? 'शाम' : 'रात'\n"
     "  return `${part} ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`\n"
     "}\n"
     "\n"
     "// A date in the language of a patient's messages, on a page the link opens\n"
     "export const dateIn = (language: MessageLanguage, date: string): string =>\n"
     "  language === 'kn' ? kannadaDate(date, true) : language === 'hi' ? hindiDate(date, true) : formatDate(date)\n"
     "\n"
     "// \"call or WhatsApp us on +91 …\"\n"),
    ("const APPOINTMENT_KN = 'ಅಪಾಯಿಂಟ್ಮೆಂಟ್'\n",
     "const callUsHi = ({ clinic }: HasPhone) => `${clinic.phone} पर कॉल या WhatsApp करें`\n"
     "const APPOINTMENT_KN = 'ಅಪಾಯಿಂಟ್ಮೆಂಟ್'\n"),
])

p = 'src/lib/billing.ts'
s = rd(p)
for snippet, hindi in [
    ("(kn ? 'ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್' :", "'प्रिस्क्रिप्शन'"),
    ("(kn ? (photos.length === 1 ? 'ಫೋಟೋ'", "'फ़ोटो'"),
    ("(kn ? 'ಬಿಲ್' :", "'बिल'"),
    ("const and = kn ? ' ಮತ್ತು '", "' और '"),
    ("`${onTheDay ? 'ಇಂದು'", "`${onTheDay ? 'आज' : `${hindiDate(args.visitDate, true)} को`} आने के लिए धन्यवाद। आपसे मिलकर अच्छा लगा।`"),
    ("`ನಿಮ್ಮ ${word} ಈ ಲಿಂಕ್", "`${word} इस लिंक पर देखें _(लिंक 30 दिन तक चलेगा)_:`"),
    ("'*ಮುಂದಿನ ಅಪಾಯಿಂಟ್ಮೆಂಟ್*'", "'*आपकी अगली अपॉइंटमेंट*'"),
    ("'ಒಂದು ನಿಮಿಷ ಸಮಯವಿದ್ದರೆ", "'अगर आपके पास एक मिनट हो, तो Google पर एक छोटा सा रिव्यू लिख दें। इससे आस-पास के लोगों को क्लिनिक ढूँढने में मदद मिलती है:'"),
]:
    s = hindi_before(s, snippet, hindi)
wr(p, s)
sub(p, [
    ("import { appointmentLines, kannadaDate, messageHeader,", "import { appointmentLines, hindiDate, kannadaDate, messageHeader,"),
    ("  if (language === 'kn') return one ? 'ನಿಮ್ಮ ಫೋಟೋ' : 'ನಿಮ್ಮ ಫೋಟೋಗಳು'\n",
     "  if (language === 'kn') return one ? 'ನಿಮ್ಮ ಫೋಟೋ' : 'ನಿಮ್ಮ ಫೋಟೋಗಳು'\n  if (language === 'hi') return 'फ़ोटो'\n"),
    ("const many = word.includes(kn ? ' ಮತ್ತು ' : ' and ') || /s$/.test(word)", "const many = word.includes(' and ') || /s$/.test(word)"),
])

p = 'src/app/r/[token]/page.tsx'
sub(p, [
    ("function Bill({ bill, kn }: { bill: SharedBill; kn: boolean }) {\n  const t = kn\n",
     "function Bill({ bill, language }: { bill: SharedBill; language: MessageLanguage }) {\n"
     "  const t = language === 'hi'\n"
     "    ? { title: 'बिल', charges: 'इलाज और शुल्क', charge: 'शुल्क', total: 'कुल', paid: 'भुगतान किया', cash: 'नकद', earlierDue: 'पिछली विज़िट का बकाया', earlierAdvance: 'पिछली विज़िट की अग्रिम राशि', due: 'बकाया राशि', advance: 'हमारे पास अग्रिम राशि', full: 'पूरा भुगतान हो गया' }\n"
     "    : language === 'kn'\n"),
    ("<section aria-label={t.title} lang={kn ? 'kn' : 'en'}", "<section aria-label={t.title} lang={language}"),
    ("  const date = kn ? kannadaDate(shared.visit_date, true) : formatDate(shared.visit_date)\n", "  const date = dateIn(language, shared.visit_date)\n"),
    ("  const save = kn ? 'ಉಳಿಸಿ' : 'Save'\n", "  const save = language === 'hi' ? 'सेव करें' : kn ? 'ಉಳಿಸಿ' : 'Save'\n"),
    ("<div lang={kn ? 'kn' : 'en'} className=\"space-y-1\">", "<div lang={language} className=\"space-y-1\">"),
    ("{kn ? `ನಮಸ್ಕಾರ ${firstName(shared.first_name)} ಅವರೇ,` : `Hi ${firstName(shared.first_name)},`}", "{messageHeader(shared.first_name, language)[0]}"),
    ("{kn ? `ನಿಮ್ಮ ${holds}` : `Your ${holds}`}", "{language === 'hi' ? holds : kn ? `ನಿಮ್ಮ ${holds}` : `Your ${holds}`}"),
    ("{bill && <Bill bill={bill} kn={kn} />}", "{bill && <Bill bill={bill} language={language} />}"),
    ("<p lang={kn ? 'kn' : 'en'} className=\"text-sm text-gray-600\">", "<p lang={language} className=\"text-sm text-gray-600\">"),
    ("{kn ? `ಈ ಲಿಂಕ್ ${kannadaDate(until, true)} ರವರೆಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ.` : `This link works until ${formatDate(until)}.`}",
     "{language === 'hi' ? `यह लिंक ${dateIn(language, until)} तक चलेगा।` : kn ? `ಈ ಲಿಂಕ್ ${kannadaDate(until, true)} ರವರೆಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ.` : `This link works until ${formatDate(until)}.`}"),
    ("import { firstName, kannadaDate, messageLanguage, questionsLine } from '@/lib/whatsapp'",
     "import { dateIn, firstName, kannadaDate, messageHeader, messageLanguage, questionsLine, type MessageLanguage } from '@/lib/whatsapp'"),
])

sub('src/lib/actions/patients.ts', [
    ("    // The language of their WhatsApp messages, when the form asks ('kn' for Kannada, else English)\n"
     "    language: formData.has('language') ? (formData.get('language') === 'kn' ? 'kn' : null) : undefined,\n",
     "    // The language of their WhatsApp messages, when the form asks ('kn' or 'hi', else English)\n"
     "    language: formData.has('language') ? (messageLanguage(formData.get('language') as string) === 'en' ? null : formData.get('language')) : undefined,\n"),
])
sub('src/lib/data/types.ts', [("'kn' for Kannada, null for English", "'kn' for Kannada, 'hi' for Hindi, null for English")])
sub('src/components/clinic/PatientForm.tsx', [
    ("// The language of their WhatsApp messages ('' is English)\nconst LANGUAGES = [['', 'English'], ['kn', 'ಕನ್ನಡ']] as const\n",
     "// The language of their WhatsApp messages ('' is English): what the clinic offers (src/lib/clinic.ts), and\n// always the one already on their record\nconst LANGUAGES = [['', 'English'], ['kn', 'ಕನ್ನಡ'], ['hi', 'हिन्दी']] as const\n"),
    ("useState<string>(patient?.language === 'kn' ? 'kn' : '')", "useState<string>(patient?.language ?? '')"),
    ("{LANGUAGES.map(([value, label]) => (", "{LANGUAGES.filter(([value]) => !value || value === patient?.language || languages.includes(value)).map(([value, label]) => ("),
])
sub('src/app/app/patients/[id]/page.tsx', [("patient.language === 'kn' && 'WhatsApp in ಕನ್ನಡ'", "patient.language === 'kn' && 'WhatsApp in ಕನ್ನಡ', patient.language === 'hi' && 'WhatsApp in हिन्दी'")])
sub('src/lib/clinic.ts', [
    ("  tally: ClinicTally\n  chairMonitor: ChairMonitor | null\n}\n",
     "  tally: ClinicTally\n  chairMonitor: ChairMonitor | null\n  // The languages it writes to patients in ('en', 'kn', 'hi'), offered on the patient form\n  languages: string[]\n}\n"),
    ("  tally: unknown\n  chair_monitor: unknown\n}\n", "  tally: unknown\n  chair_monitor: unknown\n  languages: string[] | null\n}\n"),
    ("      chairMonitor: monitorOf(row.chair_monitor),\n", "      chairMonitor: monitorOf(row.chair_monitor),\n      languages: row.languages ?? ['en'],\n"),
])
sub('src/lib/data/clinic.ts', [("logo, tally, chair_monitor'", "logo, tally, chair_monitor, languages'")])
sub('src/lib/test-clinic.ts', [
    ("chairMonitor: { name: 'Intellicam', wifi: 'Q5Y422EW500-294', password: '12345678', address: 'http://192.168.1.1' },\n",
     "chairMonitor: { name: 'Intellicam', wifi: 'Q5Y422EW500-294', password: '12345678', address: 'http://192.168.1.1' },\n    languages: ['en', 'kn'],\n"),
    ("    chairMonitor: null,\n", "    chairMonitor: null,\n    languages: ['en', 'kn', 'hi'],\n"),
])
sub('src/lib/clinic.test.ts', [
    ("upi_id: null, upi_payee: null, logo: null, tally: {}, chair_monitor: null,\n", "upi_id: null, upi_payee: null, logo: null, tally: {}, chair_monitor: null, languages: ['en', 'kn'],\n"),
    ("const ANOTHER_CLINIC =", "const ANOTHER_CLINIC_WORDS =") if False else ("for (const language of ['en', 'kn'] as const) {", "for (const language of ['en', 'kn', 'hi'] as const) {"),
    ("expect(text).toContain(`Brightside Dental, ${language === 'kn' ? 'ಮಣಿಪಾಲ' : 'Manipal'}`)\n", "expect(text).toContain(`Brightside Dental, ${language === 'kn' ? 'ಮಣಿಪಾಲ' : 'Manipal'}`)\n      if (language === 'hi') expect(text).toMatch(/^नमस्ते Prakash जी,\\n/)\n"),
])
