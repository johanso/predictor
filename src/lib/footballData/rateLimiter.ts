// Sliding-window counter for the free plan's 10 req/min cap, persisted in the
// database rather than held in a module variable.
//
// It used to be an in-memory array, justified by the window being only 60 seconds:
// losing the count on a restart cost nothing while "the server" was one long-lived
// local process. Deployed, several instances run at once, each with its own empty
// array — so the cap became 10 per minute *per instance* and /api/rate-limit
// reported a number unrelated to what upstream had actually received. Same reasoning
// that put the odds-api counter in OddsApiCall; this is its sibling table.

import { prisma } from "@/lib/db";

export const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

/**
 * A dev server started before `prisma migrate` keeps the previously generated client
 * in module scope, so a newly added model reads as `undefined`. Name the real problem
 * rather than failing with "cannot read properties of undefined" — the fix is a
 * restart, not anything in this file.
 */
function table() {
  const model = prisma.footballDataCall;
  if (!model) {
    throw new Error(
      "El cliente de Prisma no conoce la tabla FootballDataCall. Reinicia el servidor de desarrollo para que cargue el cliente regenerado."
    );
  }
  return model;
}

/** Call once right before each real request to football-data.org. */
export async function recordApiCall(): Promise<void> {
  await table().create({ data: {} });
  // Opportunistic prune: rows past the window can never affect a count again. The
  // window is 60s, so this table stays a handful of rows.
  await table().deleteMany({ where: { calledAt: { lt: new Date(Date.now() - WINDOW_MS) } } });
}

export interface RateLimitStatus {
  count: number;
  limit: number;
  windowMs: number;
  /** ms until the oldest call in the window ages out (count will drop by 1) — null if count is 0. */
  msUntilNextSlot: number | null;
}

export async function getRateLimitStatus(): Promise<RateLimitStatus> {
  const now = Date.now();
  const calls = await table().findMany({
    where: { calledAt: { gte: new Date(now - WINDOW_MS) } },
    orderBy: { calledAt: "asc" },
    select: { calledAt: true },
  });

  const oldest = calls[0]?.calledAt.getTime();
  return {
    count: calls.length,
    limit: RATE_LIMIT,
    windowMs: WINDOW_MS,
    msUntilNextSlot: oldest !== undefined ? WINDOW_MS - (now - oldest) : null,
  };
}
