import { ensureFreshStandings, getWeightedTeamStats } from "@/lib/cache/standingsCache";
import { getRawSampleSizes, getTeamComparativeStats, getTeamRecentForm } from "@/lib/cache/formCache";
import { buildDerivedMarkets, buildSummary, computeConfidence, predictMatchWithMatrix } from "@/lib/poisson";
import type { EnrichedMatchPrediction } from "@/types/domain";

/** Thrown for expected "can't predict this" cases (unsupported competition, season not started) — carries the HTTP status the caller should respond with. */
export class PredictionUnavailableError extends Error {
  status: 422;
  constructor(message: string) {
    super(message);
    this.status = 422;
  }
}

/**
 * Assembles the full enriched prediction — shared by POST /api/predict (explore, free)
 * and POST /api/predictions (save-with-gate) so both always agree on the numbers, and
 * the save endpoint never has to trust client-supplied probabilities.
 */
export async function computeEnrichedPrediction(
  competitionCode: string,
  homeTeamId: number,
  awayTeamId: number
): Promise<EnrichedMatchPrediction> {
  const standings = await ensureFreshStandings(competitionCode);

  if (!standings.hasHomeAway) {
    throw new PredictionUnavailableError(
      `${standings.name} does not expose home/away split standings — predictions aren't supported for this competition.`
    );
  }

  if (!standings.seasonStarted) {
    throw new PredictionUnavailableError(
      `${standings.name}'s season hasn't started yet — no matches played, so there's no data to predict from.`
    );
  }

  const teamStats = await getWeightedTeamStats(competitionCode);
  const { prediction, matrix } = predictMatchWithMatrix(homeTeamId, awayTeamId, teamStats);

  const [homeForm, awayForm, homeComparative, awayComparative, sampleSizes] = await Promise.all([
    getTeamRecentForm(homeTeamId, prediction.homeTeam, competitionCode, "home"),
    getTeamRecentForm(awayTeamId, prediction.awayTeam, competitionCode, "away"),
    getTeamComparativeStats(homeTeamId, prediction.homeTeam, competitionCode),
    getTeamComparativeStats(awayTeamId, prediction.awayTeam, competitionCode),
    getRawSampleSizes(homeTeamId, awayTeamId, competitionCode),
  ]);

  const confidence = computeConfidence(sampleSizes.homeSampleSize, sampleSizes.awaySampleSize, standings.fetchedAt);
  const summary = buildSummary(prediction.homeTeam, prediction.awayTeam, prediction.oneXTwo, prediction.exactScores);
  const derivedMarkets = buildDerivedMarkets(matrix);

  return {
    ...prediction,
    summary,
    derivedMarkets,
    confidence,
    recentForm: { home: homeForm, away: awayForm },
    comparative: { home: homeComparative, away: awayComparative },
  };
}
