import { config } from "@/lib/config";
import { recordApiCall } from "./rateLimiter";
import type { FdStandingsResponse, FdMatchesResponse } from "./types";

export class FootballDataError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "FootballDataError";
  }
}

async function fdFetch<T>(path: string): Promise<T> {
  await recordApiCall();
  const res = await fetch(`${config.footballData.baseUrl}${path}`, {
    headers: { "X-Auth-Token": config.footballData.apiKey },
    cache: "no-store",
  });

  if (res.status === 429) {
    throw new FootballDataError(
      "football-data.org rate limit reached (10 req/min on the free tier). Try again shortly.",
      429
    );
  }
  if (res.status === 403) {
    throw new FootballDataError(
      "football-data.org rejected the request (403) — check FOOTBALL_DATA_API_KEY or plan access to this competition.",
      403
    );
  }
  if (!res.ok) {
    throw new FootballDataError(`football-data.org request failed: ${res.status} ${res.statusText}`, res.status);
  }

  return (await res.json()) as T;
}

export function getStandings(competitionCode: string): Promise<FdStandingsResponse> {
  return fdFetch<FdStandingsResponse>(`/competitions/${competitionCode}/standings`);
}

/**
 * The free tier's /standings endpoint only exposes a single TOTAL table (no
 * HOME/AWAY split), so home/away splits are derived here by aggregating
 * individual finished matches instead.
 */
export function getFinishedMatches(competitionCode: string): Promise<FdMatchesResponse> {
  return fdFetch<FdMatchesResponse>(`/competitions/${competitionCode}/matches?status=FINISHED`);
}

export function getUpcomingMatches(competitionCode: string): Promise<FdMatchesResponse> {
  return fdFetch<FdMatchesResponse>(`/competitions/${competitionCode}/matches?status=SCHEDULED`);
}
