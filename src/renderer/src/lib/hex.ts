// Bytes as hex, the first `limit` of them, so a large blob doesn't become a huge string. An ellipsis
// marks the bytes left out.
export function hex(bytes: Uint8Array, limit: number): string {
  const shown = bytes.subarray(0, limit)
  const digits = Array.from(shown, (b) => b.toString(16).padStart(2, '0')).join('')
  return `0x${digits}${bytes.length > shown.length ? '…' : ''}`
}
