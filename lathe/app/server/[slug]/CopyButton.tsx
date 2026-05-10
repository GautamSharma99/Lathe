'use client'

import { useState } from 'react'

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className="text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg transition-colors border border-zinc-700"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}
