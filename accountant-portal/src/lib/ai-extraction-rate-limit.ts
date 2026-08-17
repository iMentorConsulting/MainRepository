// In-memory per-user daily cap on AI extraction calls. Resets when the
// server process restarts — acceptable since the goal is to guard against
// runaway cost/misuse, not provide a durable audit trail.
const DAILY_CAP = 50

const callsByUserDay = new Map<string, number>()

function todayKey(userId: string): string {
  return `${userId}:${new Date().toISOString().slice(0, 10)}`
}

export function checkAndConsumeRateLimit(userId: string): boolean {
  const key = todayKey(userId)
  const count = callsByUserDay.get(key) ?? 0
  if (count >= DAILY_CAP) return false
  callsByUserDay.set(key, count + 1)
  return true
}
