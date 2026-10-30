// The website for AI assistants and agents (the Markdown is built by src/lib/agent-pages.ts):
// - what its pages may be used for, in Content Signals (contentsignals.org): search, answers in AI
//   assistants and AI training, all yes;
// - each page's Markdown copy: at the page's address with .md (/index.md for the homepage), and at the
//   page's own address for a request that asks for text/markdown, as agents do. Copies come from src/app/md.
export const CONTENT_SIGNAL = 'search=yes, ai-input=yes, ai-train=yes'

export const MARKDOWN_PAGES = [
  { page: '/', markdown: '/index.md', copy: '/md/index' },
  { page: '/book', markdown: '/book.md', copy: '/md/book' },
  { page: '/treatments', markdown: '/treatments.md', copy: '/md/treatments' },
  { page: '/treatments/:slug', markdown: '/treatments/:slug.md', copy: '/md/treatments/:slug' },
]

// What the website has for agents besides its pages: llms.txt, the whole site in one file, and the copies
export const AGENT_FILES = ['/llms.txt', '/llms-full.txt', ...MARKDOWN_PAGES.map((p) => p.markdown)]

// An agent's request names text/markdown, whatever else it accepts; a browser's never does
export const asksForMarkdown = [{ type: 'header' as const, key: 'accept', value: '.*text/markdown.*' }]

// Ahead of the pages (beforeFiles), since a page answers a request for Markdown with its copy
export function markdownRewrites() {
  return MARKDOWN_PAGES.flatMap(({ page, markdown, copy }) => [
    { source: markdown, destination: copy },
    { source: page, has: asksForMarkdown, destination: copy },
  ])
}

// On each page as people get it: where its copy and llms.txt are, and what the page may be used for
export function agentHeaders() {
  return MARKDOWN_PAGES.map(({ page, markdown }) => ({
    source: page,
    missing: asksForMarkdown,
    headers: [
      { key: 'Link', value: `<${markdown}>; rel="alternate"; type="text/markdown", </llms.txt>; rel="describedby"` },
      { key: 'Content-Signal', value: CONTENT_SIGNAL },
    ],
  }))
}
