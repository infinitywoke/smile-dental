import { llmsTxt, textResponse } from '@/lib/agent-pages'
import { getWebsiteTreatments } from '@/lib/data/price-list'

// For AI assistants and agents: what the website is and where everything is (llmstxt.org)
export async function GET() {
  return textResponse(llmsTxt(await getWebsiteTreatments()))
}
