export interface TrackedPredictionFields {
  favorite: "home" | "draw" | "away";
  bttsYesProbability: number;
  over25Probability: number;
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  lambdaHome: number;
  lambdaAway: number;
}

export interface EvaluationResult {
  correctOneXTwo: boolean;
  correctBtts: boolean;
  correctOverUnder25: boolean;
  correctExactScore: boolean;
  goalError: number;
}

function actualOutcome(actualHomeGoals: number, actualAwayGoals: number): "home" | "draw" | "away" {
  if (actualHomeGoals > actualAwayGoals) return "home";
  if (actualHomeGoals < actualAwayGoals) return "away";
  return "draw";
}

/**
 * Which side of a two-way market the model actually backs, and its confidence in
 * *that* side (not always the "yes" probability). Exported so the performance
 * table renders the same pick this file scores — displaying the raw "yes"
 * probability next to a "no" pick is what made the ✓/✗ marks unreadable.
 */
export function bttsPick(bttsYesProbability: number): { yes: boolean; probability: number } {
  const yes = bttsYesProbability >= 0.5;
  return { yes, probability: yes ? bttsYesProbability : 1 - bttsYesProbability };
}

export function overUnderPick(over25Probability: number): { over: boolean; probability: number } {
  const over = over25Probability >= 0.5;
  return { over, probability: over ? over25Probability : 1 - over25Probability };
}

/** Compares a tracked prediction against the real final score. Pure — no I/O. */
export function evaluatePrediction(
  pred: TrackedPredictionFields,
  actualHomeGoals: number,
  actualAwayGoals: number
): EvaluationResult {
  const correctOneXTwo = actualOutcome(actualHomeGoals, actualAwayGoals) === pred.favorite;

  const actualBtts = actualHomeGoals > 0 && actualAwayGoals > 0;
  const correctBtts = bttsPick(pred.bttsYesProbability).yes === actualBtts;

  const actualOver25 = actualHomeGoals + actualAwayGoals > 2;
  const correctOverUnder25 = overUnderPick(pred.over25Probability).over === actualOver25;

  const correctExactScore = actualHomeGoals === pred.predictedHomeGoals && actualAwayGoals === pred.predictedAwayGoals;

  const goalError = Math.abs(pred.lambdaHome + pred.lambdaAway - (actualHomeGoals + actualAwayGoals));

  return { correctOneXTwo, correctBtts, correctOverUnder25, correctExactScore, goalError };
}
