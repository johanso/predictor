import { prisma } from "@/lib/db";
import { fitDixonColes, type DixonColesFit } from "@/lib/poisson/dixonColesFit";

/**
 * Fitted attack/defense ratings for a competition, kept in memory between requests.
 *
 * The fit is a numerical optimisation over every cached match (~40ms for a full
 * Brasileirão season), so it is worth not repeating on every prediction. The cache
 * key is the competition plus the number and latest date of the matches it was built
 * from: when refreshFromApi() ingests new results, one of those changes and the fit
 * is rebuilt. There is no TTL, because nothing else can invalidate it.
 */
interface CachedFit {
  fit: DixonColesFit;
  matchCount: number;
  latestMatch: number;
  teamNames: Map<number, string>;
}

const cache = new Map<string, CachedFit>();

export interface CompetitionRatings {
  fit: DixonColesFit;
  teamNames: Map<number, string>;
  matchCount: number;
}

export async function getCompetitionRatings(competitionCode: string): Promise<CompetitionRatings | null> {
  const matches = await prisma.match.findMany({
    where: { competitionCode },
    select: { homeTeamId: true, awayTeamId: true, homeGoals: true, awayGoals: true, utcDate: true },
  });

  if (matches.length === 0) return null;

  const latestMatch = matches.reduce((max, m) => Math.max(max, m.utcDate.getTime()), 0);
  const cached = cache.get(competitionCode);
  if (cached && cached.matchCount === matches.length && cached.latestMatch === latestMatch) {
    return { fit: cached.fit, teamNames: cached.teamNames, matchCount: cached.matchCount };
  }

  const teams = await prisma.team.findMany({ where: { competitionCode }, select: { id: true, name: true } });
  const teamNames = new Map(teams.map((t) => [t.id, t.name]));

  const fit = fitDixonColes(
    matches.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      utcDate: m.utcDate,
    }))
  );

  cache.set(competitionCode, { fit, matchCount: matches.length, latestMatch, teamNames });
  return { fit, teamNames, matchCount: matches.length };
}

/** Number of matches each team appears in — the honest sample behind its rating. */
export async function getFitSampleSizes(competitionCode: string): Promise<Map<number, number>> {
  const matches = await prisma.match.findMany({
    where: { competitionCode },
    select: { homeTeamId: true, awayTeamId: true },
  });
  const counts = new Map<number, number>();
  for (const m of matches) {
    counts.set(m.homeTeamId, (counts.get(m.homeTeamId) ?? 0) + 1);
    counts.set(m.awayTeamId, (counts.get(m.awayTeamId) ?? 0) + 1);
  }
  return counts;
}
