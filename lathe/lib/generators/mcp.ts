export function generateMCPConfig(slug: string, baseUrl: string) {
  return {
    mcpServers: {
      [slug]: {
        url: `${baseUrl}/api/mcp/${slug}`,
      },
    },
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export function nameFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    const parts = hostname.split('.')
    const name = parts[0]
    return name.charAt(0).toUpperCase() + name.slice(1)
  } catch {
    return 'Generated Server'
  }
}

export function slugFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '')
    const path = new URL(url).pathname.replace(/\//g, '-').replace(/^-+|-+$/g, '')
    const base = slugify(hostname.replace(/\./g, '-'))
    return path ? `${base}-${slugify(path)}`.slice(0, 50) : base
  } catch {
    return slugify(url)
  }
}
