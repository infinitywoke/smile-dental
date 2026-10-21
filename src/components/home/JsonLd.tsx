// Structured data for search engines and AI assistants. "<" is escaped so the text can never close the
// script tag early.
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
