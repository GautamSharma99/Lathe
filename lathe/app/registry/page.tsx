import { initDb, getAllServers } from '@/lib/db'
import Link from 'next/link'
import ServerCard from './ServerCard'

export const dynamic = 'force-dynamic'

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await initDb()
  const { q } = await searchParams
  const servers = await getAllServers(q)

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">MCP Registry</h1>
        <p className="text-zinc-400">
          {servers.length} servers available. Every website, one install away.
        </p>
      </div>

      <form className="mb-8">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search servers..."
          className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 text-sm"
        />
      </form>

      {servers.length === 0 ? (
        <div className="text-center py-20 text-zinc-600">
          <p className="text-lg mb-2">No servers found</p>
          <p className="text-sm">
            {q ? `No results for "${q}". ` : ''}
            <Link href="/" className="text-zinc-400 hover:text-white underline">
              Generate a new one →
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {servers.map(server => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
      )}
    </div>
  )
}
