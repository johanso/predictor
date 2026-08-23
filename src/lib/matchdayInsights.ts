import { getCompetitionRatings } from "@/lib/cache/ratingsCache";
import { getWeightedTeamStats } from "@/lib/cache/standingsCache";
import { getOddsForFixture } from "@/lib/cache/oddsCache";
import { buildDerivedMarkets, buildPredictionFromLambdas, buildSummary, predictMatchWithMatrix } from "@/lib/poisson";
import { fittedLambdas } from "@/lib/poisson/dixonColesFit";
import { positiveEdges, marketProbabilities, type MarketEdge } from "@/lib/betting/marketProbabilities";
import { BET_MARKETS } from "@/lib/betting/settle";
import type { MatchPrediction, DerivedMarkets } from "@/types/domain";

const MARKET_LABELS = Object.fromEntries(BET_MARKETS.map((m) => [m.value, m.label]));

export interface FixtureInsight {
  favorite: "home" | "draw" | "away";
  favoriteLabel: string;
  favoriteProbability: number;
  /**
   * Every market beating its real price, strongest first. Sent unfiltered so the
   * probability floor can be moved client-side without another round trip.
   */
  edges: (MarketEdge & { label: string })[];
  bookmaker: string | null;
}

interface FixtureRef {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string;
  awayTeamName: string;
  /** Date from the DB row, or the ISO string the client component carries. */
  utcDate: Date | string;
}

/**
 * Per-fixture summary for the upcoming-matches list: who the model favours, and the
 * best value against the bookmaker's real price.
 *
 * Uses the same fitted model as the predictor page. It previously called the
 * ratio-of-averages fallback directly, so the list and the predictor could name
 * different favourites for the same fixture.
 *
 * Cheap by construction: the ratings are fitted once for the whole competition, and
 * the odds come from the cache — where the first lookup prices the entire matchday
 * in one batch and every later fixture in the round is free. See oddsCache.ts.
 */
export async function getMatchdayInsights(
  competitionCode: string,
  fixtures: FixtureRef[]
): Promise<Record<number, FixtureInsight>> {
  const insights: Record<number, FixtureInsight> = {};
  if (fixtures.length === 0) return insights;

  const ratings = await getCompetitionRatings(competitionCode);
  const fallbackStats = ratings ? null : await getWeightedTeamStats(competitionCode);

  for (const fixture of fixtures) {
    let prediction: MatchPrediction;
    let derived: DerivedMarkets;

    try {
      if (ratings && ratings.fit.attack.has(fixture.homeTeamId) && ratings.fit.attack.has(fixture.awayTeamId)) {
        const { lambdaHome, lambdaAway } = fittedLambdas(ratings.fit, fixture.homeTeamId, fixture.awayTeamId);
        const built = buildPredictionFromLambdas(
          fixture.homeTeamName,
          fixture.awayTeamName,
          lambdaHome,
          lambdaAway,
          ratings.fit.rho
        );
        prediction = built.prediction;
        derived = buildDerivedMarkets(built.matrix);
      } else if (fallbackStats) {
        const built = predictMatchWithMatrix(fixture.homeTeamId, fixture.awayTeamId, fallbackStats);
        prediction = built.prediction;
        derived = buildDerivedMarkets(built.matrix);
      } else {
        continue; // no ratings and no fallback stats — nothing to say about this fixture
      }
    } catch {
      continue; // a team with no matches logged yet; leave the row unannotated
    }

    const summary = buildSummary(prediction.homeTeam, prediction.awayTeam, prediction.oneXTwo, prediction.exactScores);
    const insight: FixtureInsight = {
      favorite: summary.favorite,
      favoriteLabel: summary.favoriteLabel,
      favoriteProbability: summary.favoriteProbability,
      edges: [],
      bookmaker: null,
    };

    // Odds are best-effort: a fixture the provider doesn't carry, or an exhausted
    // quota, must not cost the whole list its favourites.
    try {
      const { odds } = await getOddsForFixture(competitionCode, {
        homeTeamName: fixture.homeTeamName,
        awayTeamName: fixture.awayTeamName,
        utcDate: fixture.utcDate instanceof Date ? fixture.utcDate : new Date(fixture.utcDate),
      });
      const book = odds[0];
      if (book) {
        insight.bookmaker = book.bookmaker;
        insight.edges = positiveEdges(marketProbabilities(prediction, derived), book.markets).map((e) => ({
          ...e,
          label: MARKET_LABELS[e.market] ?? e.market,
        }));
      }
    } catch {
      // leave edges empty
    }

    insights[fixture.id] = insight;
  }

  return insights;
}
