import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import Link from 'next/link'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Lathe — npm for MCP servers',
  description: 'Paste any URL. Get an MCP server. Install in one line.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <nav className="border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg tracking-tight text-white hover:text-zinc-300 transition-colors">
            ⚙ Lathe
          </Link>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <Link href="/registry" className="hover:text-white transition-colors">Registry</Link>
            <a
              href="https://anakin.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition-colors"
            >
              Powered by Anakin
            </a>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  )
}
