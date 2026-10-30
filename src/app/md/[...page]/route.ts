import { markdownResponse, pageMarkdown } from '@/lib/agent-pages'
import { getWebsiteTreatments } from '@/lib/data/price-list'

// A website page's Markdown copy, for AI agents: /index.md, /book.md, /treatments.md and
// /treatments/<slug>.md come here, and so does a page asked for text/markdown (src/config/agents.ts)
export async function generateStaticParams() {
  const pages = [['index'], ['book'], ['treatments'], ...(await getWebsiteTreatments()).map((t) => ['treatments', t.slug])]
  return pages.map((page) => ({ page }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ page: string[] }> }) {
  const { page } = await params
  const path = page.join('/') === 'index' ? '/' : `/${page.join('/')}`
  const markdown = pageMarkdown(path, await getWebsiteTreatments())
  if (markdown === null) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  return markdownResponse(markdown, path)
}
