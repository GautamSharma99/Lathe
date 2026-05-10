import type { CrawlResult } from './types'

export async function inferSchema(crawlResult: CrawlResult): Promise<Record<string, unknown>> {
  const pages = crawlResult.pages || crawlResult.data || []

  // Collect schemas Anakin already inferred
  const anakinSchemas = pages
    .map(p => p.data_schema || (p.generatedJson as Record<string, unknown> | undefined)?.data_schema)
    .filter(Boolean) as Record<string, unknown>[]

  if (anakinSchemas.length > 0) {
    const first = JSON.stringify(anakinSchemas[0])
    const allMatch = anakinSchemas.every(s => JSON.stringify(s) === first)
    if (allMatch || anakinSchemas.length === 1) {
      return anakinSchemas[0]
    }
  }

  // Collect JSON samples for Claude to merge
  const samples = pages
    .map(p => p.generatedJson)
    .filter(Boolean)
    .slice(0, 3) as Record<string, unknown>[]

  if (samples.length === 0) {
    // Build a basic schema from page content
    return {
      type: 'object',
      properties: {
        url: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
      },
    }
  }

  if (samples.length === 1) return samples[0]

  return await mergeWithOpenAI(samples)
}

async function mergeWithOpenAI(samples: Record<string, unknown>[]): Promise<Record<string, unknown>> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `Produce a single unified JSON schema from these ${samples.length} samples scraped from the same website. Use optional fields where data is inconsistent. Return ONLY valid JSON, no markdown fences, no explanation.\n\nSamples:\n${JSON.stringify(samples, null, 2)}`,
        }],
      }),
    })

    const data = await res.json() as { choices: Array<{ message: { content: string } }> }
    const text = data.choices[0].message.content
      .trim()
      .replace(/^```json\n?/, '')
      .replace(/\n?```$/, '')

    return JSON.parse(text)
  } catch {
    return samples[0]
  }
}
