# Lathe — System Architecture

---

## Overview

Lathe is a single Next.js 16 application that:
1. Accepts a URL (or topic) as input
2. Runs it through a multi-step Anakin-powered pipeline
3. Produces a live hosted MCP endpoint
4. Stores it in a public registry

Everything runs in one repo — no separate frontend/backend services.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│   Homepage (/)  ──►  Registry (/registry)               │
│        │                   │                            │
│   POST /api/generate   GET /registry                    │
│   GET  /api/status/:id  GET /server/:slug               │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│                    Next.js 16 App                       │
│                   (Vercel Edge)                         │
│                                                         │
│  API Routes          Pages (RSC)      Components        │
│  ├─ /api/generate    ├─ /             ├─ ServerCard     │
│  ├─ /api/status/:id  ├─ /registry     ├─ CopyButton     │
│  └─ /api/mcp/:slug   └─ /server/:slug └─ (inline)       │
└───────┬──────────────────────┬─────────────────────────┘
        │                      │
┌───────▼──────┐    ┌──────────▼──────────────────────────┐
│   Turso DB   │    │           Anakin API                │
│  (libSQL)    │    │                                     │
│              │    │  ┌─────────────────────────────┐   │
│  servers     │    │  │ Wire Catalog                │   │
│  jobs        │    │  │ /v1/holocron/catalog         │   │
│              │    │  │ /v1/holocron/search          │   │
└──────────────┘    │  └─────────────────────────────┘   │
                    │  ┌─────────────────────────────┐   │
                    │  │ Crawl                       │   │
                    │  │ /v1/crawl  (replaces        │   │
                    │  │  Map + URL Scraper x3)      │   │
                    │  └─────────────────────────────┘   │
                    │  ┌─────────────────────────────┐   │
                    │  │ Agentic Search              │   │
                    │  │ /v1/agentic-search           │   │
                    │  └─────────────────────────────┘   │
                    └─────────────────────────────────────┘
                                    │
                    ┌───────────────▼─────────────────────┐
                    │           OpenAI API                │
                    │  gpt-4o-mini (fallback only)        │
                    │  called only when Anakin schemas    │
                    │  conflict across pages              │
                    └─────────────────────────────────────┘
```

---

## Generation Pipeline

Every URL goes through this pipeline. Steps run sequentially inside an async background task so the HTTP response (202 + jobId) returns immediately.

```
POST /api/generate
       │
       ├─ Create job record (status: pending)
       ├─ Return { jobId } — 202 immediately
       │
       └─ Background async task:
              │
              ▼
        ┌─────────────┐
        │  Wire Check │  GET /v1/holocron/search?q=<domain>
        │             │  GET /v1/holocron/catalog
        └──────┬──────┘
               │
        Wire hit?
         YES ──► Create server record (server_type: 'wire')
                 Mark job done ──► STOP (fastest path, ~2s)
         │
         NO
         │
         ▼
        ┌─────────────┐
        │    Crawl    │  POST /v1/crawl
        │             │  limit: 10 pages, generateJson: true
        └──────┬──────┘
               │
         Content thin? (<150 chars avg)
         YES ──► Retry with useBrowser: true (Headless badge)
               │
               ▼
        ┌─────────────────┐
        │  Schema Infer   │  Check Anakin's data_schema first
        │                 │  All pages match? → use directly
        │                 │  Conflict? → call OpenAI gpt-4o-mini
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │    Generate     │  generateMCPConfig(slug, baseUrl)
        │    + Persist    │  INSERT INTO servers
        └────────┬────────┘
                 │
                 ▼
        Mark job done (status: 'done', server_id: <id>)
```

---

## Job Polling

The frontend polls `/api/status/:jobId` every 1.5 seconds to get live updates.

```
Job record fields:
  id         — uuid
  status     — pending | wire_check | crawling | inferring | generating | done | failed
  step       — human-readable label shown in UI ("Crawling site with Anakin...")
  badges     — JSON array of lit-up Anakin feature badges
  server_id  — populated when done
  error      — populated when failed
```

Pipeline updates the job record at each step transition so the UI badge strip animates in real time.

---

## MCP Proxy Endpoint

Every generated server is a real live MCP endpoint. Claude Desktop connects here directly.

```
POST /api/mcp/:slug
       │
       ├─ Parse JSON-RPC 2.0 body
       ├─ Look up server by slug in DB
       │
       ├─ method: initialize
       │    └─ Return protocolVersion: '2024-11-05', capabilities: { tools: {} }
       │
       ├─ method: tools/list
       │    └─ Return one tool per server:
       │         name: search_<slug>
       │         inputSchema: { query: string, url?: string }
       │
       └─ method: tools/call
              │
              ├─ server_type === 'wire'?
              │    YES ──► executeWireAction(wire_action_id, params)
              │             calls Anakin Wire action live
              │
              └─ NO ──► crawlSite(source_url)
                         returns pages[].generatedJson + markdown

GET /api/mcp/:slug
       └─ Returns server metadata JSON (health check / discovery)

OPTIONS /api/mcp/:slug
       └─ Returns CORS headers (for browser-based MCP clients)
```

---

## Database Schema

Hosted on Turso (libSQL — SQLite-compatible, works on Vercel).

```sql
-- Every generated or Wire-seeded MCP server
CREATE TABLE servers (
  id             TEXT PRIMARY KEY,       -- uuid
  slug           TEXT UNIQUE NOT NULL,   -- url-safe identifier, e.g. "hn-jobs"
  name           TEXT NOT NULL,          -- display name, e.g. "Hacker News Jobs"
  description    TEXT,
  source_url     TEXT NOT NULL,          -- original URL
  schema_json    TEXT NOT NULL,          -- inferred data schema (JSON)
  mcp_config     TEXT NOT NULL,          -- { mcpServers: { slug: { url: ... } } }
  server_type    TEXT DEFAULT 'crawled', -- 'crawled' | 'wire' | 'agentic'
  wire_action_id TEXT,                   -- Anakin Wire action ID (wire servers only)
  install_count  INTEGER DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now'))
);

-- Background generation jobs
CREATE TABLE jobs (
  id         TEXT PRIMARY KEY,
  status     TEXT DEFAULT 'pending',
  step       TEXT,
  badges     TEXT DEFAULT '[]',   -- JSON array, e.g. ["Wire ⚡", "Map"]
  server_id  TEXT,                -- foreign key to servers.id (set when done)
  error      TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

Tables are created automatically on first request via `initDb()` — no manual migration needed.

---

## File Structure

```
lathe/
│
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout — nav bar
│   ├── page.tsx                  # Homepage (client) — URL input + badge strip + result
│   ├── globals.css
│   │
│   ├── registry/
│   │   ├── page.tsx              # Server Component — fetches all servers from DB
│   │   └── ServerCard.tsx        # Client Component — card with onError favicon handler
│   │
│   ├── server/[slug]/
│   │   ├── page.tsx              # Server Component — server detail + install instructions
│   │   └── CopyButton.tsx        # Client Component — clipboard copy button
│   │
│   └── api/
│       ├── generate/
│       │   └── route.ts          # POST — starts pipeline, returns jobId (202)
│       ├── status/[jobId]/
│       │   └── route.ts          # GET — returns job status + badges + server info
│       └── mcp/[slug]/
│           └── route.ts          # GET/POST/OPTIONS — live MCP JSON-RPC proxy
│
├── lib/
│   ├── types.ts                  # Shared TypeScript types
│   ├── db.ts                     # Turso client + all DB query functions
│   ├── anakin.ts                 # Anakin API: crawlSite, pollUntilDone, executeWireAction, agenticSearch
│   ├── wire.ts                   # Wire catalog: checkWireCatalog, getWireCatalog
│   ├── schema.ts                 # Schema inference: Anakin-first, OpenAI fallback
│   └── generators/
│       └── mcp.ts                # generateMCPConfig, slugify, nameFromUrl, slugFromUrl
│
├── scripts/
│   └── seed-wire.ts              # One-time: pull Wire catalog → pre-populate registry
│
├── .env.local                    # API keys (never committed)
├── vercel.json                   # Env var references for Vercel deploy
├── package.json
└── tsconfig.json
```

---

## Data Flow: Frontend → Backend → Anakin

```
User types URL → hits Generate
        │
        ▼
POST /api/generate
  → createJob(uuid)
  → return { jobId } ── 202

Background (non-blocking):
  → checkWireCatalog(url)      ← Anakin Wire API
  → crawlSite(url)             ← Anakin Crawl API
  → inferSchema(crawlResult)   ← Anakin data_schema OR OpenAI
  → createServer(...)          ← Turso DB
  → updateJob(done)            ← Turso DB

Frontend polls every 1.5s:
GET /api/status/:jobId
  ← { status, step, badges[], server }

When status === 'done':
  → Show install snippet
  → Link to /server/:slug

Claude Desktop connects:
POST /api/mcp/:slug  (initialize)
POST /api/mcp/:slug  (tools/list)
POST /api/mcp/:slug  (tools/call)
  → Live Anakin crawl or Wire action
  → Returns structured JSON
```

---

## Technology Choices & Why

| Decision | Why |
|---|---|
| **Single Next.js repo** | No time to manage two services in a hackathon |
| **Turso (libSQL)** | SQLite API, works on Vercel (read-only filesystem), free tier |
| **Anakin Crawl over Map + Scraper x3** | One API call instead of four, simpler polling |
| **Wire-first pipeline** | Instant servers for known sites, better demo, uses Anakin's best feature |
| **Anakin schema first, OpenAI fallback** | Saves tokens/latency — Anakin's `data_schema` is good enough in most cases |
| **`gpt-4o-mini` for schema merge** | Fast + cheap — only called when Anakin schemas conflict |
| **Job polling (not WebSockets)** | Simpler, works serverlessly on Vercel, 1.5s interval is fine for UX |
| **No SKILL.md generation** | Low judge value, saves implementation time |
| **No OpenAPI spec** | Same reason |

---

## Anakin API Usage Map

| Anakin Feature | Where Used | Endpoint |
|---|---|---|
| Wire catalog search | `lib/wire.ts` → `checkWireCatalog()` | `GET /v1/holocron/search` |
| Wire catalog listing | `scripts/seed-wire.ts` | `GET /v1/holocron/catalog` |
| Wire action execution | `app/api/mcp/[slug]/route.ts` → `fetchData()` | `POST /v1/holocron/:id` |
| Crawl (multi-page) | `lib/anakin.ts` → `crawlSite()` | `POST /v1/crawl` |
| Headless browser | `lib/anakin.ts` → `crawlSite(url, true)` | `POST /v1/crawl` + `useBrowser: true` |
| Agentic Search | `app/api/generate/route.ts` (topic path) | `POST /v1/agentic-search` |

---

## Deployment

```
Local dev:
  npm run dev → http://localhost:3000
  NEXT_PUBLIC_BASE_URL=http://localhost:3000

Vercel production:
  vercel --prod
  Set env vars in Vercel dashboard:
    ANAKIN_API_KEY
    OPENAI_API_KEY
    TURSO_DATABASE_URL
    TURSO_AUTH_TOKEN
    NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app

Seed the registry (run once after deploy):
  npm run seed
```

---

## Security Notes

- `.env.local` is gitignored — keys never committed
- Turso auth token scoped to read/write on one DB
- MCP endpoint has CORS headers — open by design (public MCP servers)
- No user authentication — this is a public hackathon demo
