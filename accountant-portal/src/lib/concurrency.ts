// Runs `fn` over `items` with at most `concurrency` in flight at once.
// Used for batch DB work (e.g. rematching hundreds of records) where doing
// it one-at-a-time is dominated by per-call round-trip latency rather than
// actual DB load, so a bounded amount of parallelism is a large speedup
// without risking connection-pool exhaustion from running everything at once.
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}
