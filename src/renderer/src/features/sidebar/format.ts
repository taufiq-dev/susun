// When a history entry ran: the time today, "Yesterday 14:03", or the date and time.
export function ranWhen(ms: number): string {
  const date = new Date(ms)
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return time
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`
  const sameYear = date.getFullYear() === today.getFullYear()
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(!sameYear && { year: 'numeric' })
  })
  return `${day} ${time}`
}

export function duration(ms: number): string {
  if (ms < 1) return '<1 ms'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

// The folder a file is in, shortened to its last two parts: "…/projects/queries".
export function folderOf(path: string): string {
  const parts = path.split(/[\\/]/).slice(0, -1)
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : parts.join('/') || '/'
}
