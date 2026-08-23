import { config } from "@/lib/config";
import type { OddsApiMarket } from "./markets";
import type { OddsEvent } from "./matchTeams";

export class OddsApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "OddsApiError";
  }
}

// Free plan: 100 requests/hour, 500/day. The batch endpoint takes 10 events at a
// time, so one league's whole matchday costs a single call — see fetchOddsForEvents.
export const MAX_EVENTS_PER_REQUEST = 10;
const HOURLY_LIMIT = 100;
const DAILY_LIMIT = 500;

let callTimestamps: number[] = [];

function prune(now: number): void {
  callTimestamps = callTimestamps.filter((t) => now - t < 24 * 60 * 60 * 1000);
}

export interface OddsQuotaStatus {
  lastHour: number;
  hourlyLimit: number;
  lastDay: number;
  dailyLimit: number;
}

export function getOddsQuota(): OddsQuotaStatus {
  const now = Date.now();
  prune(now);
  return {
    lastHour: callTimestamps.filter((t) => now - t < 60 * 60 * 1000).length,
    hourlyLimit: HOURLY_LIMIT,
    lastDay: callTimestamps.length,
    dailyLimit: DAILY_LIMIT,
  };
}

function recordCall(): void {
  const now = Date.now();
  const quota = getOddsQuota();
  if (quota.lastHour >= HOURLY_LIMIT) {
    throw new OddsApiError("Límite de la hora alcanzado en odds-api.io (100/hora). Inténtalo más tarde.", 429);
  }
  if (quota.lastDay >= DAILY_LIMIT) {
    throw new OddsApiError("Límite diario alcanzado en odds-api.io (500/día).", 429);
  }
  callTimestamps.push(now);
}

async function oddsFetch<T>(path: string, params: Record<string, string>): Promise<T> {
  recordCall();

  const url = new URL(`${config.oddsApi.baseUrl}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("apiKey", config.oddsApi.apiKey);

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 429) throw new OddsApiError("odds-api.io devolvió 429 (límite de peticiones).", 429);
  if (res.status === 401 || res.status === 403) {
    throw new OddsApiError("odds-api.io rechazó la clave — revisa ODDS_API_KEY en .env.", res.status);
  }
  if (!res.ok) throw new OddsApiError(`odds-api.io falló: ${res.status} ${res.statusText}`, res.status);

  return (await res.json()) as T;
}

export interface OddsApiEventWithOdds extends OddsEvent {
  status: string;
  bookmakers?: Record<string, OddsApiMarket[]>;
}

/** Upcoming fixtures for one league. `status` is "pending" until the match is settled. */
export async function fetchLeagueEvents(leagueSlug: string, limit = 50): Promise<OddsApiEventWithOdds[]> {
  const data = await oddsFetch<OddsApiEventWithOdds[]>("/events", {
    sport: "football",
    league: leagueSlug,
    limit: String(limit),
  });
  return Array.isArray(data) ? data : [];
}

/**
 * Odds for up to MAX_EVENTS_PER_REQUEST fixtures in one call. Batching is the whole
 * quota strategy: pricing a ten-match round costs one request instead of ten.
 */
export async function fetchOddsForEvents(eventIds: number[], bookmakers: string[]): Promise<OddsApiEventWithOdds[]> {
  if (eventIds.length === 0) return [];
  if (eventIds.length > MAX_EVENTS_PER_REQUEST) {
    throw new OddsApiError(`fetchOddsForEvents acepta como máximo ${MAX_EVENTS_PER_REQUEST} partidos por llamada.`, 400);
  }

  const data = await oddsFetch<OddsApiEventWithOdds[] | OddsApiEventWithOdds>("/odds/multi", {
    eventIds: eventIds.join(","),
    bookmakers: bookmakers.join(","),
  });
  return Array.isArray(data) ? data : [data];
}

/** The bookmakers this account has enabled — two of them on the free plan. */
export async function fetchSelectedBookmakers(): Promise<string[]> {
  const data = await oddsFetch<{ bookmakers?: string[] }>("/bookmakers/selected", {});
  return data.bookmakers ?? [];
}
