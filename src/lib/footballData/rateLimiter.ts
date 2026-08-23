// In-memory sliding-window counter for the free plan's 10 req/min cap.
// Module-level state: resets on server restart, and naturally decays as
// calls age out of the 60s window — no persistence needed for a single-user
// local dev tool.

export const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

let callTimestamps: number[] = [];

function prune(now: number): void {
  callTimestamps = callTimestamps.filter((t) => now - t < WINDOW_MS);
}

/** Call once right before each real request to football-data.org. */
export function recordApiCall(): void {
  const now = Date.now();
  callTimestamps.push(now);
  prune(now);
}

export interface RateLimitStatus {
  count: number;
  limit: number;
  windowMs: number;
  /** ms until the oldest call in the window ages out (count will drop by 1) — null if count is 0. */
  msUntilNextSlot: number | null;
}

export function getRateLimitStatus(): RateLimitStatus {
  const now = Date.now();
  prune(now);
  const oldest = callTimestamps[0];
  return {
    count: callTimestamps.length,
    limit: RATE_LIMIT,
    windowMs: WINDOW_MS,
    msUntilNextSlot: oldest !== undefined ? WINDOW_MS - (now - oldest) : null,
  };
}
