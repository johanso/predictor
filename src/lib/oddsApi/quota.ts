import { prisma } from "@/lib/db";

/**
 * Usage tracking for odds-api.io's free plan, persisted rather than held in memory.
 *
 * The football-data.org counter next door can live in a module variable because its
 * window is 60 seconds — losing it on restart costs nothing. A 500-per-day budget is
 * different: an in-memory count resets to zero on every dev-server reload and would
 * cheerfully authorise a 501st request while reporting "0 used today". So every call
 * is written to OddsApiCall and the counts are read back from there.
 */

export const HOURLY_LIMIT = 100;
export const DAILY_LIMIT = 500;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface OddsQuotaStatus {
  lastHour: number;
  hourlyLimit: number;
  lastDay: number;
  dailyLimit: number;
  /** When the oldest call in each window ages out — null when that window is empty. */
  hourResetsAt: string | null;
  dayResetsAt: string | null;
}

function table() {
  const t = prisma.oddsApiCall;
  if (!t) {
    throw new Error(
      "El cliente de Prisma no conoce la tabla OddsApiCall. Reinicia el servidor de desarrollo para que cargue el cliente regenerado."
    );
  }
  return t;
}

export async function getOddsQuota(): Promise<OddsQuotaStatus> {
  const now = Date.now();
  const since = new Date(now - DAY_MS);
  const calls = await table().findMany({
    where: { calledAt: { gte: since } },
    select: { calledAt: true },
    orderBy: { calledAt: "asc" },
  });

  const hourStart = now - HOUR_MS;
  const inHour = calls.filter((c) => c.calledAt.getTime() >= hourStart);

  return {
    lastHour: inHour.length,
    hourlyLimit: HOURLY_LIMIT,
    lastDay: calls.length,
    dailyLimit: DAILY_LIMIT,
    hourResetsAt: inHour[0] ? new Date(inHour[0].calledAt.getTime() + HOUR_MS).toISOString() : null,
    dayResetsAt: calls[0] ? new Date(calls[0].calledAt.getTime() + DAY_MS).toISOString() : null,
  };
}

/**
 * Records one request, refusing it when either window is already full. Called before
 * the request goes out, so a refusal costs nothing upstream.
 */
export async function recordOddsCall(endpoint: string): Promise<void> {
  const quota = await getOddsQuota();
  if (quota.lastHour >= HOURLY_LIMIT) {
    throw new OddsQuotaError(`Límite por hora alcanzado (${HOURLY_LIMIT}/hora). Se repone a las ${formatTime(quota.hourResetsAt)}.`);
  }
  if (quota.lastDay >= DAILY_LIMIT) {
    throw new OddsQuotaError(`Límite diario alcanzado (${DAILY_LIMIT}/día). Se repone a las ${formatTime(quota.dayResetsAt)}.`);
  }

  await table().create({ data: { endpoint } });
  // Opportunistic prune: anything older than the daily window can never affect a count.
  await table().deleteMany({ where: { calledAt: { lt: new Date(Date.now() - DAY_MS) } } });
}

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }) : "—";
}

export class OddsQuotaError extends Error {
  status = 429;
  constructor(message: string) {
    super(message);
    this.name = "OddsQuotaError";
  }
}
