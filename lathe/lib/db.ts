import { createClient } from '@libsql/client'
import type { Server, Job, JobStatus } from './types'

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export async function initDb() {
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

  // Add cache columns — wrapped in try/catch because they may already exist
  for (const sql of [
    `ALTER TABLE servers ADD COLUMN last_crawled_at TEXT`,
    `ALTER TABLE servers ADD COLUMN cached_data TEXT`,
  ]) {
    try { await db.execute(sql) } catch { /* column already exists */ }
  }
}

export async function createJob(id: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO jobs (id, status, step, badges) VALUES (?, 'pending', 'Starting...', '[]')`,
    args: [id],
  })
}

export async function updateJob(
  id: string,
  fields: {
    status?: JobStatus
    step?: string
    badges?: string[]
    server_id?: string
    error?: string
  }
): Promise<void> {
  const sets: string[] = []
  const args: (string | number | null)[] = []

  if (fields.status !== undefined) { sets.push('status = ?'); args.push(fields.status) }
  if (fields.step !== undefined) { sets.push('step = ?'); args.push(fields.step) }
  if (fields.badges !== undefined) { sets.push('badges = ?'); args.push(JSON.stringify(fields.badges)) }
  if (fields.server_id !== undefined) { sets.push('server_id = ?'); args.push(fields.server_id) }
  if (fields.error !== undefined) { sets.push('error = ?'); args.push(fields.error) }

  if (sets.length === 0) return
  args.push(id)

  await db.execute({ sql: `UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`, args })
}

export async function getJob(id: string): Promise<Job | null> {
  const result = await db.execute({ sql: `SELECT * FROM jobs WHERE id = ?`, args: [id] })
  if (result.rows.length === 0) return null
  return rowToJob(result.rows[0])
}

export async function createServer(server: Omit<Server, 'install_count' | 'created_at' | 'last_crawled_at' | 'cached_data'>): Promise<void> {
  await db.execute({
    sql: `INSERT OR IGNORE INTO servers (id, slug, name, description, source_url, schema_json, mcp_config, server_type, wire_action_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      server.id, server.slug, server.name, server.description,
      server.source_url, server.schema_json, server.mcp_config,
      server.server_type, server.wire_action_id,
    ],
  })
}

export async function getServerBySlug(slug: string): Promise<Server | null> {
  const result = await db.execute({ sql: `SELECT * FROM servers WHERE slug = ?`, args: [slug] })
  if (result.rows.length === 0) return null
  return rowToServer(result.rows[0])
}

export async function getAllServers(search?: string): Promise<Server[]> {
  let result
  if (search) {
    result = await db.execute({
      sql: `SELECT * FROM servers WHERE name LIKE ? OR description LIKE ? ORDER BY install_count DESC, created_at DESC LIMIT 100`,
      args: [`%${search}%`, `%${search}%`],
    })
  } else {
    result = await db.execute({
      sql: `SELECT * FROM servers ORDER BY install_count DESC, created_at DESC LIMIT 100`,
      args: [],
    })
  }
  return result.rows.map(rowToServer)
}

export async function incrementInstallCount(slug: string): Promise<void> {
  await db.execute({ sql: `UPDATE servers SET install_count = install_count + 1 WHERE slug = ?`, args: [slug] })
}

const CACHE_TTL_MINUTES = 15

export async function getCachedData(slug: string): Promise<{ data: unknown; lastCrawledAt: string } | null> {
  const result = await db.execute({
    sql: `SELECT last_crawled_at, cached_data FROM servers WHERE slug = ?`,
    args: [slug],
  })
  if (result.rows.length === 0) return null

  const row = result.rows[0]
  const cachedData = row.cached_data as string | null
  const lastCrawledAt = row.last_crawled_at as string | null

  if (!cachedData || !lastCrawledAt) return null

  const ageMs = Date.now() - new Date(lastCrawledAt).getTime()
  const ageMinutes = ageMs / 1000 / 60
  if (ageMinutes > CACHE_TTL_MINUTES) return null

  return { data: JSON.parse(cachedData), lastCrawledAt }
}

export async function updateCachedData(slug: string, data: unknown): Promise<void> {
  await db.execute({
    sql: `UPDATE servers SET cached_data = ?, last_crawled_at = ? WHERE slug = ?`,
    args: [JSON.stringify(data), new Date().toISOString(), slug],
  })
}

function rowToServer(row: Record<string, unknown>): Server {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: row.description as string,
    source_url: row.source_url as string,
    schema_json: row.schema_json as string,
    mcp_config: row.mcp_config as string,
    server_type: (row.server_type as string) as Server['server_type'],
    wire_action_id: row.wire_action_id as string | null,
    install_count: row.install_count as number,
    created_at: row.created_at as string,
    last_crawled_at: (row.last_crawled_at as string | null) ?? null,
    cached_data: (row.cached_data as string | null) ?? null,
  }
}

function rowToJob(row: Record<string, unknown>): Job {
  return {
    id: row.id as string,
    status: row.status as JobStatus,
    step: row.step as string | null,
    badges: row.badges as string,
    server_id: row.server_id as string | null,
    error: row.error as string | null,
    created_at: row.created_at as string,
  }
}

export { db }
