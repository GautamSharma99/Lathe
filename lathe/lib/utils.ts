export function timeAgo(isoString: string | null | undefined): string {
  if (!isoString) return 'Never'

  const ms = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(ms / 1000 / 60)

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min ago`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
