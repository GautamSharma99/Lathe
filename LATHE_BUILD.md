# Lathe — Build Spec (3-Hour Edition)
> npm for MCP servers. Paste a URL, publish to the registry, install in one line.

---

## What you are building

A web app with three surfaces:

1. **Generator** — user pastes a URL → Lathe checks Wire catalog first, then crawls via Anakin → generates MCP server → publishes to registry
2. **Registry** — public gallery at `/registry` showing all generated MCP servers + all Wire catalog servers pre-loaded, searchable, each with an install snippet
3. **Live MCP proxy** — every published server is a real hosted MCP endpoint at `/mcp/:slug` that Claude Desktop can connect to directly

---

## Critical changes from v1 (read this first)

| Old plan | New plan | Why |
|---|---|---|
| Map + URL Scraper x3 (3 API calls) | `/v1/crawl` (1 API call) | Simpler, same result |
| Always call Claude for schema | Use Anakin `data_schema` first, Claude only if schemas conflict | Faster, cheaper |
| Check Wire as a badge only | **Wire-first**: instant server from Wire action, skip scraping entirely | Biggest wow moment for judges |
| SQLite via better-sqlite3 | Turso (`@libsql/client`) from day 1 | Vercel filesystem is read-only |
| Generate SKILL.md | Drop it — template string only | Save 30 min |
| Generate OpenAPI spec | Cut entirely | Save 20 min |
| Registry starts empty | Pre-seed with Wire catalog (100+ servers) | Registry looks full on day 1 |

---

## Tech stack

| Layer | Tool |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui |
| Backend API | Next.js API routes (one repo) |
| Schema inference | Anthropic Claude Sonnet (`claude-sonnet-4-20250514`) — fallback only |
| Database | Turso (`@libsql/client`) — hosted SQLite, same API, works on Vercel |
| Scraping | Anakin API (raw HTTP) — Crawl endpoint + Wire catalog |
| Deploy | Vercel |

---

## Project structure

```
lathe/
├── app/
│   ├── page.tsx                  # Homepage — URL input + hero + live status
│   ├── registry/
│   │   └── page.tsx              # Public gallery
│   ├── server/
│   │   └── [slug]/
│   │       └── page.tsx          # Server detail + install
│   └── api/
│       ├── generate/
│       │   └── route.ts          # POST — main generation pipeline
│       ├── status/
│       │   └── [jobId]/
│       │       └── route.ts      # GET — poll job status
│       └── mcp/
│           └── [slug]/
│               └── route.ts      # MCP JSON-RPC proxy endpoint
├── lib/
│   ├── anakin.ts                 # All Anakin API calls
│   ├── wire.ts                   # Wire catalog check + execution
│   ├── schema.ts                 # Schema inference via Claude (fallback)
│   ├── generators/
│   │   └── mcp.ts                # Generate MCP config JSON
│   ├── db.ts                     # Turso setup + queries
│   └── types.ts                  # Shared types
├── components/
│   ├── URLInput.tsx
│   ├── JobStatus.tsx             # Live polling component
│   ├── ServerCard.tsx            # Registry card
│   └── InstallSnippet.tsx        # Copy-paste install block
├── scripts/
│   └── seed-wire.ts              # One-time: pull Wire catalog → seed DB
└── .env.local
```

---

## Environment variables

```bash
ANAKIN_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
NEXT_PUBLIC_BASE_URL=https://lathe.dev
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_turso_token
```

---

## Database schema (Turso)

```sql
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_url TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  mcp_config TEXT NOT NULL,
  server_type TEXT DEFAULT 'crawled',  -- 'crawled' | 'wire' | 'agentic'
  wire_action_id TEXT,                 -- populated for Wire-sourced servers
  install_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'pending',       -- pending | wire_check | crawling | inferring | generating | done | failed
  step TEXT,
  badges TEXT DEFAULT '[]',            -- JSON array of lit-up Anakin feature badges
  server_id TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## Core pipeline — `/api/generate` POST

```
Request body: { url: string }

Steps:
1. Create job, return job_id immediately (202)
2. Run pipeline async:
   a. WIRE CHECK  — search Wire catalog for this domain
      → HIT:  create server from Wire action schema, DONE (skip b/c/d)
      → MISS: continue to b
   b. CRAWL       — POST /v1/crawl (replaces Map + 3x Scraper)
   c. INFER       — use Anakin data_schema; call Claude only if needed
   d. GENERATE    — produce MCP config JSON
   e. PERSIST     — write to DB, mark job done
```

### Step a — Wire catalog check (DO THIS FIRST — it's your showstopper moment)

```typescript
// lib/wire.ts
export async function checkWireCatalog(url: string): Promise<WireAction | null> {
  const domain = new URL(url).hostname.replace('www.', '')

  // Search the Wire catalog for this domain
  const res = await fetch(`https://api.anakin.io/v1/holocron/search?q=${encodeURIComponent(domain)}`, {
    headers: { 'X-API-Key': process.env.ANAKIN_API_KEY! }
  })
  const data = await res.json()

  if (data.actions && data.actions.length > 0) {
    return data.actions[0]  // return first match
  }

  // Also check catalog directly
  const catalogRes = await fetch('https://api.anakin.io/v1/holocron/catalog', {
    headers: { 'X-API-Key': process.env.ANAKIN_API_KEY! }
  })
  const catalog = await catalogRes.json()
  return catalog.actions?.find((a: any) =>
    a.url?.includes(domain) || a.name?.toLowerCase().includes(domain.split('.')[0])
  ) || null
}

export async function wireActionToSchema(action: WireAction): Promise<object> {
  // Wire actions have JSON Schema-based parameter definitions built in
  // Use input_schema as the data schema directly
  return action.input_schema || action.schema || {}
}
```

**When Wire hits:** update job badges to `['Wire']`, create server record with `server_type: 'wire'` and `wire_action_id`, mark done. The MCP proxy will call the Wire action live instead of crawling.

### Step b — Anakin Crawl (replaces Map + URL Scraper x3)

```typescript
// lib/anakin.ts
export async function crawlSite(url: string): Promise<CrawlResult> {
  // Submit crawl job
  const submitRes = await fetch('https://api.anakin.io/v1/crawl', {
    method: 'POST',
    headers: {
      'X-API-Key': process.env.ANAKIN_API_KEY!,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      limit: 10,                          // 10 pages is enough for schema inference
      generateJson: true,                 // Anakin infers schema automatically
      useBrowser: false,                  // try without browser first
      includePatterns: [],
      excludePatterns: ['*/login*', '*/auth*', '*/admin*']
    })
  })
  const { jobId } = await submitRes.json()

  // Poll until done
  const result = await pollUntilDone(jobId, 'crawl')

  // JS fallback: if content thin, retry with headless browser
  const avgContentLen = result.pages?.reduce((s: number, p: any) => s + (p.markdown?.length || 0), 0) / (result.pages?.length || 1)
  if (avgContentLen < 200) {
    // Add 'Headless' badge to job
    return await crawlWithBrowser(url)
  }

  return result
}

async function crawlWithBrowser(url: string): Promise<CrawlResult> {
  const submitRes = await fetch('https://api.anakin.io/v1/crawl', {
    method: 'POST',
    headers: { 'X-API-Key': process.env.ANAKIN_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, limit: 5, generateJson: true, useBrowser: true })
  })
  const { jobId } = await submitRes.json()
  return await pollUntilDone(jobId, 'crawl')
}

// Generic polling helper — use everywhere
export async function pollUntilDone(jobId: string, endpoint: string, intervalMs = 2000): Promise<any> {
  while (true) {
    await sleep(intervalMs)
    const res = await fetch(`https://api.anakin.io/v1/${endpoint}/${jobId}`, {
      headers: { 'X-API-Key': process.env.ANAKIN_API_KEY! }
    })
    const data = await res.json()
    if (data.status === 'completed') return data
    if (data.status === 'failed') throw new Error(data.error || 'Anakin job failed')
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
```

### Step c — Schema inference (Anakin first, Claude fallback)

```typescript
// lib/schema.ts
export async function inferSchema(crawlResult: CrawlResult): Promise<object> {
  // Anakin crawl with generateJson:true already returns data_schema per page
  // Collect all schemas from crawled pages
  const schemas = crawlResult.pages
    ?.map((p: any) => p.data_schema || p.generatedJson?.data_schema)
    .filter(Boolean)

  if (schemas && schemas.length > 0) {
    // If all schemas are identical (or nearly so), use first directly
    const firstSchema = JSON.stringify(schemas[0])
    const allMatch = schemas.every((s: any) => JSON.stringify(s) === firstSchema)
    if (allMatch || schemas.length === 1) {
      return schemas[0]  // Anakin's schema is good — skip Claude entirely
    }
  }

  // Schemas conflict or missing — call Claude to merge
  const samples = crawlResult.pages
    ?.map((p: any) => p.generatedJson || p.json)
    .filter(Boolean)
    .slice(0, 3)

  if (!samples || samples.length === 0) {
    return { type: 'object', properties: {} }  // graceful fallback
  }

  return await mergeWithClaude(samples)
}

async function mergeWithClaude(samples: any[]): Promise<object> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Produce a single unified JSON schema from these ${samples.length} samples. Use optional fields where data is inconsistent. Return ONLY valid JSON, no markdown.\n\nSamples:\n${JSON.stringify(samples, null, 2)}`
      }]
    })
  })
  const data = await response.json()
  try {
    return JSON.parse(data.content[0].text.trim())
  } catch {
    return samples[0]  // fallback to first sample's structure
  }
}
```

### Step d — Generate MCP config

```typescript
// lib/generators/mcp.ts
export function generateMCPConfig(slug: string, baseUrl: string) {
  return {
    mcpServers: {
      [slug]: {
        url: `${baseUrl}/api/mcp/${slug}`
      }
    }
  }
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function nameFromUrl(url: string): string {
  const hostname = new URL(url).hostname.replace('www.', '')
  const parts = hostname.split('.')
  return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
}
```

---

## MCP proxy endpoint — `/api/mcp/[slug]`

```typescript
// app/api/mcp/[slug]/route.ts
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const body = await req.json()
  const server = await db.getServerBySlug(params.slug)

  if (!server) {
    return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32600, message: 'Server not found' } })
  }

  if (body.method === 'initialize') {
    return Response.json({
      jsonrpc: '2.0', id: body.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: server.slug, version: '1.0.0' }
      }
    })
  }

  if (body.method === 'tools/list') {
    const schema = JSON.parse(server.schema_json)
    return Response.json({
      jsonrpc: '2.0', id: body.id,
      result: {
        tools: [{
          name: `search_${server.slug.replace(/-/g, '_')}`,
          description: server.description || `Search and retrieve data from ${server.source_url}`,
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'What to search for' },
              url: { type: 'string', description: 'Specific URL to scrape (optional)' }
            },
            required: ['query']
          }
        }]
      }
    })
  }

  if (body.method === 'tools/call') {
    const toolParams = body.params?.arguments || {}

    let data: any
    if (server.server_type === 'wire' && server.wire_action_id) {
      // Execute Wire action directly — pre-built, reliable
      data = await executeWireAction(server.wire_action_id, toolParams)
    } else {
      // Crawl live with the query
      const targetUrl = toolParams.url || server.source_url
      const crawlResult = await crawlSite(targetUrl)
      data = crawlResult.pages?.map((p: any) => ({
        url: p.url,
        content: p.generatedJson || p.markdown?.slice(0, 2000)
      }))
    }

    return Response.json({
      jsonrpc: '2.0', id: body.id,
      result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
    })
  }

  // notifications/initialized and other non-response methods — return empty
  return new Response(null, { status: 204 })
}

// Add CORS headers for browser-based MCP clients
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}
```

---

## Wire catalog seed script (run once before the demo)

```typescript
// scripts/seed-wire.ts
// Run: npx ts-node scripts/seed-wire.ts
// This pre-populates your registry with 100+ Wire-based servers so it looks full

import { createClient } from '@libsql/client'
import { v4 as uuidv4 } from 'uuid'

async function seedWireCatalog() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!
  })

  const res = await fetch('https://api.anakin.io/v1/holocron/catalog', {
    headers: { 'X-API-Key': process.env.ANAKIN_API_KEY! }
  })
  const { actions } = await res.json()

  for (const action of actions.slice(0, 50)) {  // seed first 50
    const slug = action.id || action.name?.toLowerCase().replace(/\s+/g, '-')
    if (!slug) continue

    await db.execute({
      sql: `INSERT OR IGNORE INTO servers (id, slug, name, description, source_url, schema_json, mcp_config, server_type, wire_action_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'wire', ?)`,
      args: [
        uuidv4(),
        slug,
        action.name || slug,
        action.description || `Pre-built Anakin Wire action for ${action.name}`,
        action.url || `https://${slug}.com`,
        JSON.stringify(action.input_schema || {}),
        JSON.stringify({ mcpServers: { [slug]: { url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/mcp/${slug}` } } }),
        action.id
      ]
    })
  }

  console.log(`Seeded ${Math.min(actions.length, 50)} Wire servers into registry`)
}

seedWireCatalog()
```

---

## Anakin feature badge map (update badges in job record)

| Badge | When | Anakin endpoint |
|---|---|---|
| `Wire ⚡` | Domain found in Wire catalog | `/v1/holocron/catalog` |
| `Map` | Wire miss → crawl starts | `/v1/crawl` |
| `Headless` | JS fallback triggered | `useBrowser: true` |
| `AI Merge` | Claude called to merge schemas | Anthropic API |
| `Agentic` | Input is a topic not a URL | `/v1/agentic-search` |

Update badges via: `UPDATE jobs SET badges = json_insert(badges, '$[#]', 'Wire ⚡') WHERE id = ?`

---

## Topic mode (build last — 20 min)

```typescript
function isUrl(input: string): boolean {
  return input.startsWith('http') || /\.\w{2,}/.test(input)
}

// If not a URL — use Agentic Search
async function agenticSearch(topic: string) {
  const res = await fetch('https://api.anakin.io/v1/agentic-search', {
    method: 'POST',
    headers: { 'X-API-Key': process.env.ANAKIN_API_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: topic })
  })
  const { jobId } = await res.json()
  // Poll with 10s interval (agentic takes minutes)
  return await pollUntilDone(jobId, 'agentic-search', 10000)
}
```

---

## 3-hour build order

**Hour 1 — Core pipeline working (no UI)**
- [ ] `npx create-next-app@latest lathe --typescript --tailwind --app`
- [ ] Install: `@libsql/client uuid`
- [ ] Create Turso DB (free tier at turso.tech, takes 2 min)
- [ ] `lib/db.ts` — Turso client + schema setup + 4 query functions (`createJob`, `updateJob`, `createServer`, `getServerBySlug`)
- [ ] `lib/anakin.ts` — `pollUntilDone`, `crawlSite`, `crawlWithBrowser`
- [ ] `lib/wire.ts` — `checkWireCatalog`, `executeWireAction`
- [ ] `lib/schema.ts` — `inferSchema`, `mergeWithClaude`
- [ ] `lib/generators/mcp.ts` — `generateMCPConfig`, `slugify`, `nameFromUrl`
- [ ] `app/api/generate/route.ts` — full pipeline (Wire → Crawl → Infer → Generate → Persist)
- [ ] Test with `curl -X POST localhost:3000/api/generate -d '{"url":"https://news.ycombinator.com/jobs"}'`

**Hour 2 — MCP proxy + homepage**
- [ ] `app/api/mcp/[slug]/route.ts` — initialize, tools/list, tools/call (Wire path + crawl path)
- [ ] `app/api/status/[jobId]/route.ts` — GET job + badges
- [ ] Test MCP with Claude Desktop on localhost
- [ ] `app/page.tsx` — URL input + Generate button + badge strip polling (5 badges)
- [ ] `app/api/generate` — run seed script for Wire catalog

**Hour 3 — Registry + polish + deploy**
- [ ] `components/InstallSnippet.tsx` — copy button, formatted JSON block
- [ ] `components/ServerCard.tsx` — name, badge for Wire vs crawled, install count, copy button
- [ ] `app/registry/page.tsx` — search + grid of cards
- [ ] `app/server/[slug]/page.tsx` — full detail + install + schema JSON tab
- [ ] `vercel.json` — set env vars, deploy
- [ ] Test live URL with Claude Desktop
- [ ] Pre-generate 4 demo servers (HN jobs, Product Hunt, inc42, HN top)

---

## Demo script (90 seconds)

1. **(0–15s)** Paste `news.ycombinator.com/jobs` → hit Generate. **If Wire hits:** badge lights up instantly — "It already knew this site. Wire action detected. Done in 2 seconds." **If Wire misses:** watch Map → Headless (if JS) → AI Merge badges light up.

2. **(15–30s)** Show install snippet. Copy. Paste into Claude Desktop config. Restart. "That's the install."

3. **(30–50s)** Ask Claude: *"Any Rust jobs on HN this month?"* → structured result. "Claude just read a live website through an API that didn't exist 30 seconds ago."

4. **(50–70s)** Open `/registry`. Show the gallery with 50+ servers already there from Wire seed. "All of these are ready to install right now. Every website Anakin knows natively is already here."

5. **(70–90s)** Type a topic (not URL): *"OpenAI funding news"* → show Agentic badge. "No URL? No problem. Describe what you want and Lathe finds the data source."

---

## What to cut if you're behind (in order)

1. Topic/Agentic Search mode
2. Server detail page tabs (schema, raw JSON)
3. Favicon detection on registry cards
4. `executeWireAction` in MCP proxy — return a helpful static response instead
5. Seed script — manually insert 4-5 rows

**The minimum viable demo:** URL in (HN jobs) → badge strip → install snippet → Claude answers a question. That's it. Ship that first.

---

## Key pitfalls

- **Turso** — get your token at turso.tech before you start. `libsql` and `better-sqlite3` have the same query API so migration is trivial.
- **Wire catalog response shape** — `actions` array may be nested under a different key. `console.log` the raw response and adjust.
- **MCP `notifications/initialized`** — Claude Desktop sends this after `initialize`. It expects no response body (204). Add the catch-all at the bottom of your route handler or it'll log errors.
- **CORS** — add the OPTIONS handler to `/api/mcp/[slug]` from day one.
- **`JSON.parse` Claude output** — always wrap in try/catch. Claude sometimes wraps JSON in ```json fences. Strip them: `text.replace(/^```json\n?/, '').replace(/\n?```$/, '')`.

---

## Key formulas

```
Wire hit  → instant server, zero crawl cost, judge sees "100+ servers in registry"
Crawl hit → single API call, Anakin schema, Claude only as fallback
Demo flow → Wire hit is more impressive, but crawl flow shows more Anakin features
Winning   → show BOTH paths: Wire demo first (speed), then crawl demo (depth)
```
