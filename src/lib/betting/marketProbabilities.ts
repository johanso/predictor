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
  /** Model probability minus the one the price implies, in absolute terms (0.04 = 4 points). */
  points: number;
  /** Expected value per unit staked. Reported but never used for ranking — see below. */
  ev: number;
}

/**
 * The strongest positive edge among the priced markets, or null when none beats its
 * own price.
 *
 * Ranked by percentage points rather than EV%, for the same reason the bet slip is:
 * EV% divides by the stake, so identical disagreement looks larger at long odds and
 * ranking by it steers everything toward longshots, where a small error in the
 * model's probability does the most damage.
 */
export function bestEdge(
  probabilities: Record<BetMarket, number>,
  odds: Partial<Record<BetMarket, number>>
): MarketEdge | null {
  let best: MarketEdge | null = null;

  for (const [market, price] of Object.entries(odds) as [BetMarket, number][]) {
    if (!(price > 1)) continue;
    const p = probabilities[market];
    if (p === undefined) continue;

    const points = p - 1 / price;
    if (points <= 0) continue;
    if (!best || points > best.points) best = { market, odds: price, points, ev: p * price - 1 };
  }

  return best;
}
