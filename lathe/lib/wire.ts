import type { WireAction } from './types'

const BASE = 'https://api.anakin.io/v1'

function headers() {
  return { 'X-API-Key': process.env.ANAKIN_API_KEY! }
}

export async function checkWireCatalog(url: string): Promise<WireAction | null> {
  try {
    const domain = new URL(url).hostname.replace('www.', '')
    const domainName = domain.split('.')[0]

    // Search Wire catalog for this domain
    const searchRes = await fetch(
      `${BASE}/holocron/search?q=${encodeURIComponent(domainName)}`,
      { headers: headers() }
    )

    if (searchRes.ok) {
      const data = await searchRes.json() as { actions?: WireAction[] }
      if (data.actions && data.actions.length > 0) {
        const match = data.actions.find(a =>
          a.url?.includes(domain) ||
          a.name?.toLowerCase().includes(domainName.toLowerCase())
        )
        if (match) return match
      }
    }

    // Fallback: check full catalog
    const catalogRes = await fetch(`${BASE}/holocron/catalog`, { headers: headers() })
    if (!catalogRes.ok) return null

    const catalog = await catalogRes.json() as { actions?: WireAction[] }
    const match = catalog.actions?.find(a =>
      a.url?.includes(domain) ||
      a.name?.toLowerCase().includes(domainName.toLowerCase())
    )

    return match || null
  } catch {
    return null
  }
}

export async function getWireCatalog(): Promise<WireAction[]> {
  try {
    const res = await fetch(`${BASE}/holocron/catalog`, { headers: headers() })
    if (!res.ok) return []
    const data = await res.json() as { actions?: WireAction[] }
    return data.actions || []
  } catch {
    return []
  }
}
