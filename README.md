# Lathe

**npm for MCP servers.** Paste any URL, get a live MCP server, install it in one line.

Lathe turns any website into a tool your AI agent can use — in under 60 seconds. Powered by the [Anakin](https://anakin.io) scraping API.

---

## What it does

1. You paste a URL (or describe a topic)
2. Lathe checks Anakin's Wire catalog — if the site is already supported, a server is created instantly
3. If not, Anakin crawls the site, infers the data schema, and generates a live MCP endpoint
4. You get a one-line JSON snippet to paste into Claude Desktop
5. Claude can now read that website as structured data

No code. No hosting. No maintenance.

---

## Demo

```
Input:  https://news.ycombinator.com/jobs

Output: {
  "mcpServers": {
    "news-ycombinator-com-jobs": {
      "url": "https://lathe.dev/api/mcp/news-ycombinator-com-jobs"
    }
  }
}
```

Paste that into your `claude_desktop_config.json`, restart Claude, and ask:

> *"Any Rust jobs on HN this week?"*

Claude calls the MCP server, Anakin crawls HN live, returns structured results.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS |
| Database | Turso (libSQL — SQLite-compatible, hosted) |
| Scraping | Anakin API (Wire, Crawl, Agentic Search) |
| Schema inference | OpenAI `gpt-4o-mini` (fallback only) |
| Deploy | Vercel |

---

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/your-username/lathe.git
cd lathe
npm install
```

### 2. Set up Turso

Create a free database at [turso.tech](https://turso.tech):

```bash
npm install -g @turso/cli
turso auth login
turso db create lathe
turso db show lathe          # copy the libsql:// URL
turso db tokens create lathe # copy the token
```

### 3. Configure environment variables

Create `.env.local` in the project root:

```bash
ANAKIN_API_KEY=your_anakin_api_key
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_BASE_URL=http://localhost:3000

TURSO_DATABASE_URL=libsql://lathe-yourname.turso.io
TURSO_AUTH_TOKEN=your_turso_auth_token
```

Get your Anakin API key at [anakin.io](https://anakin.io).

### 4. Seed the registry

Pre-populates the registry with Anakin's Wire catalog (50+ pre-built servers):

```bash
npm run seed
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How the Pipeline Works

Every URL goes through this pipeline:

```
Input URL
   │
   ├─ Wire catalog check (Anakin)
   │    HIT  → instant server, ~2 seconds ✓
   │    MISS ↓
   │
   ├─ Crawl site (Anakin /v1/crawl)
   │    ├─ Thin content? → retry with headless browser
   │    └─ Returns pages[] with markdown + generatedJson
   │
   ├─ Schema inference
   │    ├─ Anakin's data_schema → use directly (no AI cost)
   │    └─ Conflicting schemas → merge with gpt-4o-mini
   │
   └─ Generate MCP config + persist to Turso → Published ✓
```

Generation runs async. The UI polls `/api/status/:jobId` every 1.5s and shows live badge updates as each Anakin feature activates.

---

## MCP Proxy

Every generated server is a real hosted MCP endpoint:

```
POST /api/mcp/:slug
```

Implements the MCP JSON-RPC 2.0 protocol (`2024-11-05`). Handles:

- `initialize` — handshake with Claude Desktop
- `tools/list` — returns one search tool per server
- `tools/call` — fetches live data from Anakin (with 15-minute cache)

Wire-backed servers call the Anakin Wire action directly. Crawled servers re-crawl the source URL on demand.

### Cache

Tool calls are cached for 15 minutes in Turso. Terminal output:

```
[MCP cache HIT]  hn-jobs — last crawled 2025-...   ← served from cache
[MCP cache MISS] hn-jobs — crawling Anakin now      ← hits Anakin
```

To force a re-crawl for a specific server:

```sql
UPDATE servers SET last_crawled_at = NULL, cached_data = NULL WHERE slug = 'hn-jobs';
```

---

## Project Structure

```
app/
├── page.tsx                  # Homepage — URL input + live badge strip
├── registry/
│   ├── page.tsx              # Server gallery (Server Component)
│   └── ServerCard.tsx        # Registry card (Client Component)
├── server/[slug]/
│   ├── page.tsx              # Server detail + install instructions
│   └── CopyButton.tsx        # Copy to clipboard button
└── api/
    ├── generate/route.ts     # POST — starts generation pipeline
    ├── status/[jobId]/route.ts # GET — job polling
    └── mcp/[slug]/route.ts   # MCP JSON-RPC proxy endpoint

lib/
├── db.ts                     # Turso client + all queries
├── anakin.ts                 # Crawl, Wire action execution, Agentic Search
├── wire.ts                   # Wire catalog lookup
├── schema.ts                 # Schema inference (Anakin-first, OpenAI fallback)
├── utils.ts                  # timeAgo helper
├── types.ts                  # Shared TypeScript types
└── generators/
    └── mcp.ts                # MCP config generation, slug helpers

scripts/
└── seed-wire.ts              # Pre-seed registry from Wire catalog
```

---

## API Reference

### `POST /api/generate`

Start the generation pipeline.

```json
// Request
{ "url": "https://news.ycombinator.com/jobs" }

// Response (202)
{ "jobId": "550e8400-e29b-41d4-a716-446655440000" }
```

### `GET /api/status/:jobId`

Poll job progress.

```json
{
  "id": "550e8400...",
  "status": "done",
  "step": "Published!",
  "badges": ["Map", "Scraping"],
  "server": {
    "slug": "news-ycombinator-com-jobs",
    "name": "News",
    "mcp_config": "{...}"
  },
  "error": null
}
```

Job statuses: `pending` → `wire_check` → `crawling` → `inferring` → `generating` → `done` / `failed`

### `POST /api/mcp/:slug`

MCP JSON-RPC 2.0 endpoint. Used by Claude Desktop — not called directly.

### `GET /api/mcp/:slug`

Returns server metadata (health check / discovery).

```json
{
  "name": "Hacker News Jobs",
  "slug": "news-ycombinator-com-jobs",
  "mcp_endpoint": "https://lathe.dev/api/mcp/news-ycombinator-com-jobs",
  "protocol": "MCP JSON-RPC 2.0",
  "protocol_version": "2024-11-05"
}
```

---

## Connecting to Claude Desktop

1. Generate a server at [lathe.dev](https://lathe.dev) (or localhost:3000)
2. Copy the install snippet
3. Open `~/Library/Application Support/Claude/claude_desktop_config.json`
4. Paste into the `mcpServers` object
5. Restart Claude Desktop

```json
{
  "mcpServers": {
    "news-ycombinator-com-jobs": {
      "url": "https://lathe.dev/api/mcp/news-ycombinator-com-jobs"
    }
  }
}
```

---

## Deploying to Vercel

```bash
vercel --prod
```

Set these environment variables in the Vercel dashboard:

| Variable | Description |
|---|---|
| `ANAKIN_API_KEY` | From anakin.io |
| `OPENAI_API_KEY` | From platform.openai.com |
| `TURSO_DATABASE_URL` | From turso.tech |
| `TURSO_AUTH_TOKEN` | From turso.tech |
| `NEXT_PUBLIC_BASE_URL` | Your production URL, e.g. `https://lathe.dev` |

After deploying, update `NEXT_PUBLIC_BASE_URL` and run the seed script once:

```bash
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app npm run seed
```

---

## Anakin Features Used

| Feature | Where | Anakin Endpoint |
|---|---|---|
| Wire catalog check | Before every crawl | `GET /v1/holocron/search` |
| Wire catalog seed | `npm run seed` | `GET /v1/holocron/catalog` |
| Wire action execution | MCP proxy live calls | `POST /v1/holocron/:id` |
| Multi-page crawl | Generation pipeline | `POST /v1/crawl` |
| Headless browser fallback | JS-heavy sites | `POST /v1/crawl` + `useBrowser: true` |
| Agentic Search | Topic input (no URL) | `POST /v1/agentic-search` |

---

## License

MIT
