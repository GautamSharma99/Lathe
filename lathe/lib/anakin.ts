import type { CrawlResult } from './types'

const BASE = 'https://api.anakin.io/v1'

function headers() {
  return {
    'X-API-Key': process.env.ANAKIN_API_KEY!,
    'Content-Type': 'application/json',
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function pollUntilDone(
  jobId: string,
  endpoint: string,
  intervalMs = 2000,
  maxAttempts = 90
): Promise<Record<string, unknown>> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs)
    const res = await fetch(`${BASE}/${endpoint}/${jobId}`, { headers: headers() })
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
    const data = await res.json() as Record<string, unknown>
    if (data.status === 'completed') return data
    if (data.status === 'failed') throw new Error((data.error as string) || `Anakin job failed`)
  }
  throw new Error('Polling timed out')
}

export async function crawlSite(url: string, useBrowser = false): Promise<CrawlResult> {
  const res = await fetch(`${BASE}/crawl`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      url,
      limit: 10,
      generateJson: true,
      useBrowser,
      excludePatterns: ['*/login*', '*/auth*', '*/admin*', '*/signup*'],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Crawl submit failed: ${res.status} ${text}`)
  }

  const { jobId } = await res.json() as { jobId: string }
  const result = await pollUntilDone(jobId, 'crawl', 3000) as unknown as CrawlResult

  // Check if content is thin — retry with headless browser
  if (!useBrowser) {
    const pages = result.pages || result.data || []
    const avgLen = pages.reduce((s, p) => s + (p.markdown?.length || 0), 0) / Math.max(pages.length, 1)
    if (avgLen < 150) {
      return await crawlSite(url, true)
    }
  }

  return result
}

export async function agenticSearch(prompt: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/agentic-search`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ prompt }),
  })
  if (!res.ok) throw new Error(`Agentic search failed: ${res.status}`)
  const { jobId } = await res.json() as { jobId: string }
  return await pollUntilDone(jobId, 'agentic-search', 10000)
}

export async function executeWireAction(
  actionId: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/holocron/${actionId}`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    // Wire exec might be async
    const data = await res.json() as { jobId?: string }
    if (data.jobId) {
      return await pollUntilDone(data.jobId, 'holocron/jobs', 3000)
    }
    throw new Error(`Wire action failed: ${res.status}`)
  }
  const data = await res.json() as Record<string, unknown>
  if (data.jobId) {
    return await pollUntilDone(data.jobId as string, 'holocron/jobs', 3000)
  }
  return data
}
