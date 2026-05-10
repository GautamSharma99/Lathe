import { NextRequest, NextResponse } from 'next/server'
import { initDb, getServerBySlug, incrementInstallCount, getCachedData, updateCachedData } from '@/lib/db'
import { crawlSite, executeWireAction } from '@/lib/anakin'
import type { Server } from '@/lib/types'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await initDb()
  const { slug } = await params
  const server = await getServerBySlug(slug)

  if (!server) {
    return NextResponse.json({ error: 'Server not found' }, { status: 404, headers: CORS })
  }

  return NextResponse.json({
    name: server.name,
    slug: server.slug,
    description: server.description,
    source_url: server.source_url,
    type: server.server_type,
    mcp_endpoint: `${process.env.NEXT_PUBLIC_BASE_URL}/api/mcp/${slug}`,
    protocol: 'MCP JSON-RPC 2.0',
    protocol_version: '2024-11-05',
  }, { headers: CORS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  await initDb()
  const { slug } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS })
  }

  const server = await getServerBySlug(slug)

  if (!server) {
    return rpcError(body.id, -32600, `Server '${slug}' not found`)
  }

  const method = body.method as string

  // notifications/initialized — no response needed
  if (method === 'notifications/initialized') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (method === 'initialize') {
    return rpcResult(body.id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: server.slug, version: '1.0.0' },
    })
  }

  if (method === 'tools/list') {
    return rpcResult(body.id, { tools: buildTools(server) })
  }

  if (method === 'tools/call') {
    const toolParams = (body.params as Record<string, unknown>)?.arguments as Record<string, unknown> || {}

    try {
      // Check cache first
      const cached = await getCachedData(slug)
      if (cached) {
        console.log(`[MCP cache HIT] ${slug} — last crawled ${cached.lastCrawledAt}`)
        // Increment install count fire-and-forget after response
        incrementInstallCount(slug).catch(() => {})
        return rpcResult(body.id, {
          content: [{ type: 'text', text: JSON.stringify(cached.data, null, 2) }],
        })
      }

      console.log(`[MCP cache MISS] ${slug} — crawling Anakin now`)
      const data = await fetchData(server, toolParams)

      // Persist to cache and increment count — both fire-and-forget
      updateCachedData(slug, data).catch(() => {})
      incrementInstallCount(slug).catch(() => {})

      return rpcResult(body.id, {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      })
    } catch (err) {
      return rpcError(body.id, -32000, String(err))
    }
  }

  return rpcError(body.id, -32601, `Method not found: ${method}`)
}

function buildTools(server: Server) {
  const toolName = `search_${server.slug.replace(/-/g, '_')}`
  return [{
    name: toolName,
    description: server.description || `Retrieve live data from ${server.source_url}`,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for or ask about' },
        url: { type: 'string', description: 'Specific URL to fetch (optional, defaults to source)' },
      },
      required: ['query'],
    },
  }]
}

async function fetchData(server: Server, params: Record<string, unknown>) {
  if (server.server_type === 'wire' && server.wire_action_id) {
    try {
      return await executeWireAction(server.wire_action_id, params)
    } catch {
      // Fall through to crawl
    }
  }

  const targetUrl = (params.url as string) || server.source_url
  if (!targetUrl || targetUrl.startsWith('agentic:')) {
    return { message: 'No URL available for this server', params }
  }

  const crawlResult = await crawlSite(targetUrl)
  const pages = crawlResult.pages || crawlResult.data || []

  return pages.map(p => ({
    url: p.url,
    data: p.generatedJson || null,
    content: p.markdown?.slice(0, 3000) || '',
  }))
}

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { headers: CORS })
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code, message } },
    { headers: CORS }
  )
}
