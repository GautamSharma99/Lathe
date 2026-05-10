import { NextRequest, NextResponse } from 'next/server'
import { initDb, getJob, getServerBySlug } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  await initDb()
  const { jobId } = await params
  const job = await getJob(jobId)

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  let server = null
  if (job.server_id) {
    // Find server by ID via slug lookup — we'll search by server_id
    const { db } = await import('@/lib/db')
    const result = await db.execute({
      sql: 'SELECT * FROM servers WHERE id = ?',
      args: [job.server_id],
    })
    if (result.rows.length > 0) {
      server = {
        slug: result.rows[0].slug,
        name: result.rows[0].name,
        description: result.rows[0].description,
        server_type: result.rows[0].server_type,
        mcp_config: result.rows[0].mcp_config,
        install_count: result.rows[0].install_count,
      }
    }
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    step: job.step,
    badges: JSON.parse(job.badges || '[]') as string[],
    server,
    error: job.error,
  })
}
