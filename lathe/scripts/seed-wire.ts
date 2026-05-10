import { createClient } from '@libsql/client'
import { randomUUID } from 'crypto'

async function main() {
  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })

  // Init tables
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      source_url TEXT NOT NULL,
      schema_json TEXT NOT NULL,
      mcp_config TEXT NOT NULL,
      server_type TEXT DEFAULT 'crawled',
      wire_action_id TEXT,
      install_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT DEFAULT 'pending',
      step TEXT,
      badges TEXT DEFAULT '[]',
      server_id TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const apiKey = process.env.ANAKIN_API_KEY!

  console.log('Fetching Wire catalog...')
  const catalogRes = await fetch('https://api.anakin.io/v1/holocron/catalog', {
    headers: { 'X-API-Key': apiKey },
  })

  if (!catalogRes.ok) {
    console.error('Failed to fetch Wire catalog:', catalogRes.status)
    process.exit(1)
  }

  const catalog = await catalogRes.json() as { actions?: Array<{
    id: string
    name: string
    description?: string
    url?: string
    input_schema?: Record<string, unknown>
    schema?: Record<string, unknown>
  }> }

  const actions = catalog.actions || []
  console.log(`Found ${actions.length} Wire actions`)

  let seeded = 0
  for (const action of actions.slice(0, 60)) {
    if (!action.id || !action.name) continue

    const slug = action.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
    if (!slug) continue

    const sourceUrl = action.url || `https://${slug}.com`
    const schema = action.input_schema || action.schema || {}
    const mcpConfig = {
      mcpServers: {
        [slug]: { url: `${baseUrl}/api/mcp/${slug}` },
      },
    }

    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO servers (id, slug, name, description, source_url, schema_json, mcp_config, server_type, wire_action_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'wire', ?)`,
        args: [
          randomUUID(),
          slug,
          action.name,
          action.description || `Pre-built Wire action for ${action.name}`,
          sourceUrl,
          JSON.stringify(schema),
          JSON.stringify(mcpConfig),
          action.id,
        ],
      })
      seeded++
    } catch (e) {
      console.warn(`Skipped ${slug}:`, e)
    }
  }

  // Also seed 4 hand-picked demo servers if not present
  const demos = [
    {
      slug: 'hn-jobs',
      name: 'Hacker News Jobs',
      description: 'Live job listings from Hacker News — filterable by stack, role, and location.',
      source_url: 'https://news.ycombinator.com/jobs',
    },
    {
      slug: 'product-hunt-today',
      name: 'Product Hunt Today',
      description: "Today's top Product Hunt launches with votes, comments, and maker info.",
      source_url: 'https://www.producthunt.com',
    },
    {
      slug: 'inc42-startups',
      name: 'Inc42 Startups',
      description: 'Indian startup funding news, rounds, and market intelligence.',
      source_url: 'https://inc42.com',
    },
    {
      slug: 'hacker-news-top',
      name: 'Hacker News Top',
      description: 'Top stories from Hacker News with scores, comments, and links.',
      source_url: 'https://news.ycombinator.com',
    },
  ]

  for (const demo of demos) {
    const mcpConfig = { mcpServers: { [demo.slug]: { url: `${baseUrl}/api/mcp/${demo.slug}` } } }
    try {
      await db.execute({
        sql: `INSERT OR IGNORE INTO servers (id, slug, name, description, source_url, schema_json, mcp_config, server_type, install_count)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'crawled', ?)`,
        args: [
          randomUUID(),
          demo.slug,
          demo.name,
          demo.description,
          demo.source_url,
          JSON.stringify({ type: 'object', properties: { title: { type: 'string' }, url: { type: 'string' } } }),
          JSON.stringify(mcpConfig),
          Math.floor(Math.random() * 200) + 10,
        ],
      })
      seeded++
    } catch {
      // already exists
    }
  }

  console.log(`✓ Seeded ${seeded} servers into registry`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
