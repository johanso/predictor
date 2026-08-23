import { ensureFreshStandings, getWeightedTeamStats } from "@/lib/cache/standingsCache";
import { getRawSampleSizes, getTeamComparativeStats, getTeamRecentForm } from "@/lib/cache/formCache";
import { getCompetitionRatings } from "@/lib/cache/ratingsCache";
import { buildDerivedMarkets, buildPredictionFromLambdas, buildSummary, computeConfidence, predictMatchWithMatrix } from "@/lib/poisson";
import { fittedLambdas } from "@/lib/poisson/dixonColesFit";
import type { EnrichedMatchPrediction, MatchPrediction } from "@/types/domain";

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

  // Preferred path: attack/defense strengths fitted by maximum likelihood over every
  // cached result, which prices each team relative to the opposition it actually faced.
  // Measured against the ratio-of-averages fallback below on three Brasileirão seasons
  // it roughly doubles the model's edge over league base rates and cuts the draw bias
  // from +3.5pp to +1.2pp (scripts/compare.test.ts). The fallback still runs whenever
  // the raw Match cache hasn't been backfilled for this competition yet.
  const ratings = await getCompetitionRatings(competitionCode);

  let prediction: MatchPrediction;
  let matrix: number[][];

  if (ratings && ratings.fit.attack.has(homeTeamId) && ratings.fit.attack.has(awayTeamId)) {
    const { lambdaHome, lambdaAway } = fittedLambdas(ratings.fit, homeTeamId, awayTeamId);
    ({ prediction, matrix } = buildPredictionFromLambdas(
      ratings.teamNames.get(homeTeamId) ?? String(homeTeamId),
      ratings.teamNames.get(awayTeamId) ?? String(awayTeamId),
      lambdaHome,
      lambdaAway,
      ratings.fit.rho
    ));
  } else {
    const teamStats = await getWeightedTeamStats(competitionCode);
    ({ prediction, matrix } = predictMatchWithMatrix(homeTeamId, awayTeamId, teamStats));
  }

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
