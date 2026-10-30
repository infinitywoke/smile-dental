import { llmsFullTxt, textResponse } from '@/lib/agent-pages'
import { getWebsiteTreatments } from '@/lib/data/price-list'

// For AI assistants and agents: the whole website in one Markdown file
export async function GET() {
  return textResponse(llmsFullTxt(await getWebsiteTreatments()))
}
