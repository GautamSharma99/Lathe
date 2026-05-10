'use client'

import Link from 'next/link'
import type { Server } from '@/lib/types'

export default function ServerCard({ server }: { server: Server }) {
  const domain = (() => {
    try {
      return new URL(server.source_url).hostname.replace('www.', '')
    } catch {
      return server.source_url
    }
  })()

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
            alt=""
            className="w-5 h-5 rounded shrink-0"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <h3 className="font-semibold text-white truncate">{server.name}</h3>
        </div>
        {server.server_type === 'wire' && (
          <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 px-1.5 py-0.5 rounded shrink-0">
            Wire ⚡
          </span>
        )}
      </div>

      <p className="text-xs text-zinc-500 font-mono truncate">{domain}</p>

      {server.description && (
        <p className="text-sm text-zinc-400 line-clamp-2">{server.description}</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-zinc-600">{server.install_count} installs</span>
        <Link
          href={`/server/${server.slug}`}
          className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          Install →
        </Link>
      </div>
    </div>
  )
}
