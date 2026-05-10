'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const BADGE_COLORS: Record<string, string> = {
  'Wire ⚡': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  'Map': 'bg-blue-500/20 text-blue-400 border-blue-500/40',
  'Scraping': 'bg-purple-500/20 text-purple-400 border-purple-500/40',
  'Headless': 'bg-orange-500/20 text-orange-400 border-orange-500/40',
  'AI Merge': 'bg-green-500/20 text-green-400 border-green-500/40',
  'Agentic': 'bg-pink-500/20 text-pink-400 border-pink-500/40',
}

const EXAMPLES = [
  'news.ycombinator.com/jobs',
  'producthunt.com',
  'inc42.com',
  'news.ycombinator.com',
]

type JobState = {
  status: string
  step: string | null
  badges: string[]
  server: {
    slug: string
    name: string
    description: string
    server_type: string
    mcp_config: string
  } | null
  error: string | null
}

export default function Home() {
  const [input, setInput] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<JobState | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const router = useRouter()
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    setLoading(true)
    setJob(null)
    setCopied(false)

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input.trim() }),
    })
    const { jobId: id } = await res.json() as { jobId: string }
    setJobId(id)
    setJob({ status: 'pending', step: 'Starting...', badges: [], server: null, error: null })
  }

  useEffect(() => {
    if (!jobId) return

    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/status/${jobId}`)
      const data = await res.json() as JobState
      setJob(data)

      if (data.status === 'done' || data.status === 'failed') {
        clearInterval(pollRef.current!)
        setLoading(false)
      }
    }, 1500)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [jobId])

  function copyConfig() {
    if (!job?.server?.mcp_config) return
    navigator.clipboard.writeText(
      JSON.stringify(JSON.parse(job.server.mcp_config), null, 2)
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isDone = job?.status === 'done'
  const isFailed = job?.status === 'failed'

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-16">
      {/* Hero */}
      <div className="text-center mb-12 max-w-2xl">
        <div className="inline-flex items-center gap-2 text-xs bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1 mb-6 text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
          Powered by Anakin
        </div>
        <h1 className="text-5xl font-bold tracking-tight text-white mb-4">
          npm for MCP servers
        </h1>
        <p className="text-lg text-zinc-400">
          Paste any URL. We generate the MCP server, publish it to the registry,
          and you install it in one line.
        </p>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="w-full max-w-xl mb-8">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="https://news.ycombinator.com/jobs"
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 text-sm font-mono"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-white text-zinc-950 font-semibold px-5 py-3 rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              type="button"
              onClick={() => setInput(ex)}
              className="text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 transition-colors font-mono"
            >
              {ex}
            </button>
          ))}
        </div>
      </form>

      {/* Pipeline status */}
      {job && (
        <div className="w-full max-w-xl">
          {/* Badge strip */}
          {job.badges.length > 0 && (
            <div className="flex gap-2 mb-4 flex-wrap">
              {job.badges.map(badge => (
                <span
                  key={badge}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border animate-in fade-in ${BADGE_COLORS[badge] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 inline-block" />
                  {badge}
                </span>
              ))}
            </div>
          )}

          {/* Step label */}
          <div className="flex items-center gap-2 mb-4">
            {loading && (
              <svg className="animate-spin h-4 w-4 text-zinc-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {isDone && <span className="text-green-400 text-lg">✓</span>}
            {isFailed && <span className="text-red-400 text-lg">✗</span>}
            <span className="text-sm text-zinc-400">{job.step}</span>
          </div>

          {/* Result card */}
          {isDone && job.server && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-white text-lg">{job.server.name}</h2>
                    {job.server.server_type === 'wire' && (
                      <span className="text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 px-1.5 py-0.5 rounded">
                        Wire ⚡
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400">{job.server.description}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Install snippet</span>
                  <button
                    onClick={copyConfig}
                    className="text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition-colors"
                  >
                    {copied ? '✓ Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre">
                  {JSON.stringify(JSON.parse(job.server.mcp_config), null, 2)}
                </pre>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => router.push(`/server/${job.server!.slug}`)}
                  className="text-sm bg-white text-zinc-950 font-medium px-4 py-2 rounded-lg hover:bg-zinc-200 transition-colors"
                >
                  View details →
                </button>
                <button
                  onClick={() => router.push('/registry')}
                  className="text-sm text-zinc-400 hover:text-white px-4 py-2 rounded-lg transition-colors border border-zinc-800 hover:border-zinc-700"
                >
                  View registry
                </button>
              </div>
            </div>
          )}

          {isFailed && (
            <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4">
              <p className="text-sm text-red-400">{job.error || 'Generation failed. Please try again.'}</p>
            </div>
          )}
        </div>
      )}

      {!job && (
        <p className="mt-12 text-sm text-zinc-600 text-center">
          Every website is now one line from being a tool your agent can use.
        </p>
      )}
    </div>
  )
}
