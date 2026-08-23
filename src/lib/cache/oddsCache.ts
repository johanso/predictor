import { prisma } from "@/lib/db";
import { config } from "@/lib/config";
import {
  fetchLeagueEvents,
  fetchOddsForEvents,
  fetchSelectedBookmakers,
  MAX_EVENTS_PER_REQUEST,
  OddsApiError,
} from "@/lib/oddsApi/client";
import { mapMarkets } from "@/lib/oddsApi/markets";
import { findEventForFixture, type OddsEvent } from "@/lib/oddsApi/matchTeams";
import { ODDS_API_LEAGUE_SLUGS } from "@/lib/oddsApi/leagues";
import type { BetMarket } from "@/lib/betting/settle";

/**
 * Quota discipline lives here, not at the call site.
 *
 * The free plan allows 500 requests a day. Everything below is arranged so a normal
 * session spends a handful: fixtures for a league are priced a whole matchday at a
 * time (10 per request), results are cached for TTL_MS, and a refresh that arrives
 * sooner than MIN_REFRESH_MS after the last one is served from cache instead. A ten
 * match round refreshed every hour all day costs ~24 requests.
 */
const TTL_MS = 30 * 60 * 1000; // pre-match prices drift slowly; half an hour is plenty
const MIN_REFRESH_MS = 5 * 60 * 1000; // guards against a refresh button being leaned on
const HORIZON_MS = 10 * 24 * 60 * 60 * 1000; // don't price fixtures further out than this
const MIN_USEFUL_MARKETS = 6; // of the 12 the app prices — below this the grid stays mostly empty

export interface CachedOdds {
  bookmaker: string;
  markets: Partial<Record<BetMarket, number>>;
  fetchedAt: Date;
  eventId: string;
}

const lastRefreshByCompetition = new Map<string, number>();

interface FixtureRef {
  homeTeamName: string;
  awayTeamName: string;
  utcDate: Date;
}

/**
 * Reads cached prices for one fixture, refreshing the whole upcoming round in a
 * single batch when what we hold is stale. Returns [] when the odds API isn't
 * configured or the fixture can't be matched confidently.
 */
export async function getOddsForFixture(
  competitionCode: string,
  fixture: FixtureRef,
  opts: { forceRefresh?: boolean } = {}
): Promise<{ odds: CachedOdds[]; quotaSpent: number; error: string | null }> {
  if (!config.oddsApi.isConfigured) {
    return { odds: [], quotaSpent: 0, error: null };
  }
  const leagueSlug = ODDS_API_LEAGUE_SLUGS[competitionCode];
  if (!leagueSlug) {
    return { odds: [], quotaSpent: 0, error: null }; // competition not covered — stay silent
  }

  const cached = await readCache(competitionCode, fixture);
  const isStale = cached.length === 0 || Date.now() - cached[0].fetchedAt.getTime() > TTL_MS;
  const lastRefresh = lastRefreshByCompetition.get(competitionCode) ?? 0;
  const refreshAllowed = Date.now() - lastRefresh > MIN_REFRESH_MS;

  if ((isStale || opts.forceRefresh) && refreshAllowed) {
    try {
      const spent = await refreshCompetitionOdds(competitionCode, leagueSlug);
      return { odds: await readCache(competitionCode, fixture), quotaSpent: spent, error: null };
    } catch (err) {
      // Serving a stale price beats showing nothing; surface the reason alongside it.
      const message = err instanceof OddsApiError ? err.message : "No se pudieron actualizar las cuotas.";
      return { odds: cached, quotaSpent: 0, error: message };
    }
  }

  return { odds: cached, quotaSpent: 0, error: null };
}

async function readCache(competitionCode: string, fixture: FixtureRef): Promise<CachedOdds[]> {
  // Match on kickoff time first (cheap, indexed), then confirm the teams — the stored
  // names come from odds-api.io and won't equal football-data.org's spelling.
  const window = 36 * 60 * 60 * 1000;
  const rows = await prisma.oddsSnapshot.findMany({
    where: {
      competitionCode,
      matchUtcDate: {
        gte: new Date(fixture.utcDate.getTime() - window),
        lte: new Date(fixture.utcDate.getTime() + window),
      },
    },
  });
  if (rows.length === 0) return [];

  const events: OddsEvent[] = rows.map((r) => ({
    id: Number(r.eventId),
    home: r.homeTeamName,
    away: r.awayTeamName,
    date: r.matchUtcDate.toISOString(),
  }));
  const event = findEventForFixture(fixture, events);
  if (!event) return [];

  return (
    rows
      .filter((r) => r.eventId === String(event.id))
      .map((r) => ({
        bookmaker: r.bookmaker,
        markets: JSON.parse(r.marketsJson) as Partial<Record<BetMarket, number>>,
        fetchedAt: r.fetchedAt,
        eventId: r.eventId,
      }))
      // Some bookmakers publish a reduced side-feed alongside their main one
      // (Bet365 ships a "no latency" variant carrying only 1X2 and totals). Anything
      // that can't fill most of the grid is noise in the picker.
      .filter((o) => Object.keys(o.markets).length >= MIN_USEFUL_MARKETS)
      // Fullest feed first, so the default selection is the most complete one.
      .sort((a, b) => Object.keys(b.markets).length - Object.keys(a.markets).length || a.bookmaker.localeCompare(b.bookmaker))
  );
}

/**
 * Prices every upcoming fixture of a competition. Returns how many API requests it
 * cost, so the UI can show the user what a refresh actually spends.
 */
export async function refreshCompetitionOdds(competitionCode: string, leagueSlug: string): Promise<number> {
  lastRefreshByCompetition.set(competitionCode, Date.now());

  const [bookmakers, events] = await Promise.all([fetchSelectedBookmakers(), fetchLeagueEvents(leagueSlug)]);
  let requests = 2;

  if (bookmakers.length === 0) {
    throw new OddsApiError(
      "No tienes casas de apuestas seleccionadas en odds-api.io. Elige hasta 2 en tu panel de la API.",
      400
    );
  }

  const now = Date.now();
  const upcoming = events
    .filter((e) => e.status === "pending")
    .filter((e) => {
      const t = new Date(e.date).getTime();
      return t > now - 3 * 60 * 60 * 1000 && t < now + HORIZON_MS;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (let i = 0; i < upcoming.length; i += MAX_EVENTS_PER_REQUEST) {
    const batch = upcoming.slice(i, i + MAX_EVENTS_PER_REQUEST);
    const priced = await fetchOddsForEvents(
      batch.map((e) => e.id),
      bookmakers
    );
    requests++;

    const writes = priced.flatMap((event) =>
      Object.entries(event.bookmakers ?? {}).flatMap(([bookmaker, markets]) => {
        const mapped = mapMarkets(markets);
        if (Object.keys(mapped).length === 0) return [];
        const data = {
          competitionCode,
          homeTeamName: event.home,
          awayTeamName: event.away,
          matchUtcDate: new Date(event.date),
          marketsJson: JSON.stringify(mapped),
          fetchedAt: new Date(),
        };
        return [
          prisma.oddsSnapshot.upsert({
            where: { eventId_bookmaker: { eventId: String(event.id), bookmaker } },
            create: { eventId: String(event.id), bookmaker, ...data },
            update: data,
          }),
        ];
      })
    );
    if (writes.length > 0) await prisma.$transaction(writes);
  }

  return requests;
}

export { OddsApiError };
