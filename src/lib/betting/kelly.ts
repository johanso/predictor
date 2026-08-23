// Fractional-Kelly stake sizing: how much of the bankroll to risk given the
// model's fair probability and the real odds a bookmaker is offering.

export const KELLY_FRACTION = 0.25; // quarter-Kelly — the literature-standard way to tame full Kelly's variance
export const MAX_STAKE_FRACTION = 0.1; // hard safety cap, regardless of what Kelly computes

export interface KellyResult {
  /** Fraction of bankroll to stake, after applying KELLY_FRACTION and the MAX_STAKE_FRACTION cap. */
  fraction: number;
  suggestedStake: number;
  /** False when the real odds don't beat the model's fair odds — no positive expectation. */
  hasEdge: boolean;
}

export function computeKellyStake(modelProbability: number, odds: number, bankroll: number): KellyResult {
  if (odds <= 1 || modelProbability <= 0 || modelProbability >= 1 || bankroll <= 0) {
    return { fraction: 0, suggestedStake: 0, hasEdge: false };
  }

  const b = odds - 1; // net odds
  const q = 1 - modelProbability;
  const rawFraction = (b * modelProbability - q) / b;
  const hasEdge = rawFraction > 0;

  const fraction = Math.max(0, Math.min(rawFraction * KELLY_FRACTION, MAX_STAKE_FRACTION));
  return { fraction, suggestedStake: bankroll * fraction, hasEdge };
}
