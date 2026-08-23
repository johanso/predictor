import type { BetMarket } from "./settle";
import type { DerivedMarkets, MatchPrediction } from "@/types/domain";

/**
 * The model's probability for every market the app can price, keyed the same way
 * bets are stored.
 *
 * Shared by the bet slip and the matchday value scan so the two cannot disagree
 * about what the model thinks — a scan that highlighted a fixture the slip then
 * priced differently would be worse than no scan at all.
 */
export function marketProbabilities(prediction: MatchPrediction, derived: DerivedMarkets): Record<BetMarket, number> {
  const line15 = prediction.overUnder.find((ou) => ou.line === 1.5);
  const line25 = prediction.overUnder.find((ou) => ou.line === 2.5);

  return {
    home: prediction.oneXTwo.homeWin.probability,
    draw: prediction.oneXTwo.draw.probability,
    away: prediction.oneXTwo.awayWin.probability,
    btts_yes: prediction.btts.yes.probability,
    btts_no: prediction.btts.no.probability,
    over_1_5: line15?.over.probability ?? 0,
    under_1_5: line15?.under.probability ?? 0,
    over_2_5: line25?.over.probability ?? 0,
    under_2_5: line25?.under.probability ?? 0,
    double_1x: prediction.doubleChance.oneX.probability,
    double_12: prediction.doubleChance.oneTwo.probability,
    double_x2: prediction.doubleChance.xTwo.probability,
    home_scores: derived.homeOver05.probability,
    away_scores: derived.awayOver05.probability,
  };
}

export interface MarketEdge {
  market: BetMarket;
  odds: number;
  /** What the model gives this outcome. Surfaced because it is half the trade-off. */
  probability: number;
  /** Model probability minus the one the price implies, in absolute terms (0.04 = 4 points). */
  points: number;
  /** Expected value per unit staked. Reported but never used for ranking — see below. */
  ev: number;
}

/**
 * Positive expected value alone will always favour long odds — that is what "value"
 * means, not a flaw in the ranking. But a bet the model itself expects to lose seven
 * times in ten is a different proposition from a even-money one with the same edge,
 * and which of the two is acceptable is a risk preference, not a mathematical fact.
 *
 * So the floor is a setting, not a constant, and the caller owns it. This default
 * keeps recommendations at or near a coin flip; drop it to see longshots, raise it to
 * only ever back outcomes the model actually expects to happen.
 */
export const DEFAULT_MIN_PROBABILITY = 0.4;

/** Offered wherever the floor is adjustable, so every table agrees on the choices. */
export const MIN_PROBABILITY_OPTIONS = [0, 0.3, 0.4, 0.5, 0.6];

/**
 * The strongest positive edge among the priced markets, ignoring outcomes the model
 * rates below `minProbability`. Null when nothing qualifies.
 *
 * Ranked by percentage points rather than EV%, for the same reason the bet slip is:
 * EV% divides by the stake, so identical disagreement looks larger at long odds and
 * ranking by it steers everything toward longshots, where a small error in the
 * model's probability does the most damage.
 */
export function bestEdge(
  probabilities: Record<BetMarket, number>,
  odds: Partial<Record<BetMarket, number>>,
  minProbability: number = DEFAULT_MIN_PROBABILITY
): MarketEdge | null {
  return positiveEdges(probabilities, odds).find((e) => e.probability >= minProbability) ?? null;
}

/**
 * Every market whose real price beats the model's fair odds, strongest first.
 *
 * Returned unfiltered so the probability floor can be moved in the UI without going
 * back to the server — the trade-off between edge and likelihood is the thing the
 * user is actually choosing between, and it should respond immediately.
 */
export function positiveEdges(
  probabilities: Record<BetMarket, number>,
  odds: Partial<Record<BetMarket, number>>
): MarketEdge[] {
  const edges: MarketEdge[] = [];

  for (const [market, price] of Object.entries(odds) as [BetMarket, number][]) {
    if (!(price > 1)) continue;
    const p = probabilities[market];
    if (p === undefined) continue;

    const points = p - 1 / price;
    if (points <= 0) continue;
    edges.push({ market, odds: price, probability: p, points, ev: p * price - 1 });
  }

  return edges.sort((a, b) => b.points - a.points);
}
