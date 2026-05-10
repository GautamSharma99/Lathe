import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { initDb, createJob, updateJob, createServer, getServerBySlug } from '@/lib/db'
import { crawlSite, agenticSearch } from '@/lib/anakin'
import { checkWireCatalog } from '@/lib/wire'
import { inferSchema } from '@/lib/schema'
import { generateMCPConfig, slugFromUrl, nameFromUrl, slugify } from '@/lib/generators/mcp'
type NewServer = Omit<Server, 'install_count' | 'created_at' | 'last_crawled_at' | 'cached_data'>
import type { Server } from '@/lib/types'

function isUrl(input: string): boolean {
  return input.startsWith('http') || /\.\w{2,}/.test(input)
}

export async function POST(req: NextRequest) {
  await initDb()

  const { url } = await req.json() as { url: string }
  if (!url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  const jobId = uuidv4()
  await createJob(jobId)

  // Run pipeline in background — don't await
  runPipeline(jobId, url).catch(async (err) => {
    await updateJob(jobId, { status: 'failed', error: String(err), step: 'Pipeline error' })
  })

  return NextResponse.json({ jobId }, { status: 202 })
}

async function runPipeline(jobId: string, input: string) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const badges: string[] = []

  // --- Agentic Search path (topic input, no URL) ---
  if (!isUrl(input)) {
    await updateJob(jobId, { status: 'crawling', step: 'Running Agentic Search...', badges: [...badges, 'Agentic'] })
    badges.push('Agentic')

    const agResult = await agenticSearch(input)
    const schemaData = (agResult.generatedJson as Record<string, unknown> | undefined)?.data_schema
      || agResult.data_schema
      || {}

    const slug = slugify(input.slice(0, 40))
    const name = input.charAt(0).toUpperCase() + input.slice(1)
    const serverId = uuidv4()
    const mcpConfig = generateMCPConfig(slug, baseUrl)

    const server: NewServer = {
      id: serverId,
      slug,
      name,
      description: `Agentic search server for: ${input}`,
      source_url: `agentic:${input}`,
      schema_json: JSON.stringify(schemaData),
      mcp_config: JSON.stringify(mcpConfig),
      server_type: 'agentic',
      wire_action_id: null,
    }

    await createServer(server)
    await updateJob(jobId, { status: 'done', step: 'Published!', badges, server_id: serverId })
    return
  }

  // Normalise URL
  const url = input.startsWith('http') ? input : `https://${input}`

  // --- Step 1: Wire catalog check ---
  await updateJob(jobId, { status: 'wire_check', step: 'Checking Wire catalog...', badges })

  const wireAction = await checkWireCatalog(url)

  if (wireAction) {
    badges.push('Wire ⚡')
    await updateJob(jobId, { step: 'Wire action found! Creating server...', badges })

    const slug = slugify(wireAction.id || wireAction.name || slugFromUrl(url))
    const name = wireAction.name || nameFromUrl(url)
    const serverId = uuidv4()
    const schema = wireAction.input_schema || wireAction.schema || {}
    const mcpConfig = generateMCPConfig(slug, baseUrl)

    // Check if already exists
    const existing = await getServerBySlug(slug)
    const finalId = existing ? existing.id : serverId

    if (!existing) {
      const server: NewServer = {
        id: serverId,
        slug,
        name,
        description: wireAction.description || `Wire-powered MCP server for ${name}`,
        source_url: url,
        schema_json: JSON.stringify(schema),
        mcp_config: JSON.stringify(mcpConfig),
        server_type: 'wire',
        wire_action_id: wireAction.id,
      }
      await createServer(server)
    }

    await updateJob(jobId, { status: 'done', step: 'Published via Wire!', badges, server_id: finalId })
    return
  }

  // --- Step 2: Crawl ---
  await updateJob(jobId, { status: 'crawling', step: 'Crawling site with Anakin...', badges: [...badges, 'Map'] })
  badges.push('Map')

  let crawlResult
  try {
    crawlResult = await crawlSite(url)
    // Check if headless was triggered (thin content on first try)
    const pages = crawlResult.pages || crawlResult.data || []
    const avgLen = pages.reduce((s, p) => s + (p.markdown?.length || 0), 0) / Math.max(pages.length, 1)
    if (avgLen < 150) {
      badges.push('Headless')
    }
    badges.push('Scraping')
    await updateJob(jobId, { step: `Scraped ${pages.length} pages`, badges })
  } catch (err) {
    throw new Error(`Crawl failed: ${err}`)
  }

  // --- Step 3: Infer schema ---
  await updateJob(jobId, { status: 'inferring', step: 'Inferring schema...', badges })

  let schema: Record<string, unknown>
  try {
    schema = await inferSchema(crawlResult)
    // If Claude was called (multiple conflicting schemas), add AI badge
    const pages = crawlResult.pages || crawlResult.data || []
    const schemas = pages.map(p => p.data_schema).filter(Boolean)
    if (schemas.length > 1) {
      badges.push('AI Merge')
    }
    await updateJob(jobId, { step: 'Schema inferred', badges })
  } catch {
    schema = { type: 'object', properties: { content: { type: 'string' } } }
  }

  // --- Step 4: Generate + persist ---
  await updateJob(jobId, { status: 'generating', step: 'Generating MCP server...', badges })

  const slug = slugFromUrl(url)
  const name = nameFromUrl(url)
  const serverId = uuidv4()
  const mcpConfig = generateMCPConfig(slug, baseUrl)

  const existing = await getServerBySlug(slug)
  const finalId = existing ? existing.id : serverId

  if (!existing) {
    const server: NewServer = {
      id: serverId,
      slug,
      name,
      description: `MCP server for ${name} — live data from ${url}`,
      source_url: url,
      schema_json: JSON.stringify(schema),
      mcp_config: JSON.stringify(mcpConfig),
      server_type: 'crawled',
      wire_action_id: null,
    }
    await createServer(server)
  }

  await updateJob(jobId, { status: 'done', step: 'Published!', badges, server_id: finalId })
}
