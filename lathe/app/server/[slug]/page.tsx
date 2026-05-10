import { initDb, getServerBySlug, incrementInstallCount } from '@/lib/db'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import CopyButton from './CopyButton'

export const dynamic = 'force-dynamic'

export default async function ServerPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await initDb()
  const { slug } = await params
  const server = await getServerBySlug(slug)

  if (!server) notFound()

  const mcpConfig = JSON.stringify(JSON.parse(server.mcp_config), null, 2)
  const schema = JSON.stringify(JSON.parse(server.schema_json), null, 2)

  const domain = (() => {
    try { return new URL(server.source_url).hostname.replace('www.', '') }
    catch { return server.source_url }
  })()

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/registry" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-8 inline-block">
        ← Back to registry
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4 mb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          className="w-10 h-10 rounded-lg mt-1"
        />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{server.name}</h1>
            {server.server_type === 'wire' && (
              <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 px-1.5 py-0.5 rounded">
                Wire ⚡
              </span>
            )}
          </div>
          <p className="text-zinc-400 text-sm">{server.description}</p>
          <a
            href={server.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-600 hover:text-zinc-400 font-mono mt-1 inline-block"
          >
            {server.source_url}
          </a>
        </div>
      </div>

      {/* Install */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Install in Claude Desktop</h2>
        <ol className="space-y-4 text-sm text-zinc-400 mb-4">
          <li className="flex gap-3">
            <span className="text-zinc-600 shrink-0">1.</span>
            Open your Claude Desktop config file:
            <code className="text-zinc-300 font-mono text-xs bg-zinc-800 px-1.5 py-0.5 rounded ml-1">
              ~/Library/Application Support/Claude/claude_desktop_config.json
            </code>
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600 shrink-0">2.</span>
            Paste the snippet below into the{' '}
            <code className="text-zinc-300 font-mono text-xs bg-zinc-800 px-1.5 py-0.5 rounded">mcpServers</code>{' '}
            object.
          </li>
          <li className="flex gap-3">
            <span className="text-zinc-600 shrink-0">3.</span>
            Restart Claude Desktop. Done.
          </li>
        </ol>

        <div className="relative">
          <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre">
            {mcpConfig}
          </pre>
          <div className="absolute top-3 right-3">
            <CopyButton text={mcpConfig} />
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="flex gap-6 text-sm text-zinc-500 mb-8 p-4 bg-zinc-900 border border-zinc-800 rounded-xl">
        <div>
          <span className="text-zinc-300 font-medium">{server.install_count}</span> installs
        </div>
        <div>
          Type: <span className="text-zinc-300 font-medium capitalize">{server.server_type}</span>
        </div>
        <div>
          Created: <span className="text-zinc-300 font-medium">{server.created_at?.slice(0, 10)}</span>
        </div>
      </div>

      {/* Schema */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-3">Data Schema</h2>
        <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 text-xs font-mono text-zinc-400 overflow-x-auto whitespace-pre max-h-80">
          {schema}
        </pre>
      </section>
    </div>
  )
}
