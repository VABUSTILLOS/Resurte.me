// Unique ID generator with a monotonic counter so two IDs created in the same
// millisecond can never collide.
let idCounter = 0

export function uid(prefix = "id"): string {
  idCounter = (idCounter + 1) % 1_000_000
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}
