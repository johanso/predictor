import { describe, it, expect } from "vitest";
import { evaluatePrediction, type TrackedPredictionFields } from "@/lib/predictions/evaluate";

const base: TrackedPredictionFields = {
  favorite: "home",
  bttsYesProbability: 0.3,
  over25Probability: 0.4,
  predictedHomeGoals: 2,
  predictedAwayGoals: 0,
  lambdaHome: 1.8,
  lambdaAway: 0.7,
};

describe("evaluatePrediction", () => {
  it("marks 1X2 correct when the favorite actually wins", () => {
    const result = evaluatePrediction(base, 2, 0);
    expect(result.correctOneXTwo).toBe(true);
    expect(result.correctExactScore).toBe(true);
  });

  it("marks 1X2 incorrect when a draw happens instead of the predicted home win", () => {
    const result = evaluatePrediction(base, 1, 1);
    expect(result.correctOneXTwo).toBe(false);
    expect(result.correctExactScore).toBe(false);
  });

  it("evaluates BTTS against the 50% threshold, not the raw pick", () => {
    // predicted "no" (30% < 50%); actual both score -> incorrect
    const result = evaluatePrediction(base, 1, 1);
    expect(result.correctBtts).toBe(false);
  });

  it("evaluates BTTS correct when predicted no and actual is no", () => {
    const result = evaluatePrediction(base, 2, 0);
    expect(result.correctBtts).toBe(true);
  });

  it("evaluates over/under 2.5 against the 50% threshold", () => {
    // predicted under (40% < 50%); actual total = 2 -> under -> correct
    const result = evaluatePrediction(base, 2, 0);
    expect(result.correctOverUnder25).toBe(true);
    // actual total = 4 -> over -> incorrect vs predicted under
    const result2 = evaluatePrediction(base, 3, 1);
    expect(result2.correctOverUnder25).toBe(false);
  });

  it("computes goalError as |expected total - actual total|", () => {
    const result = evaluatePrediction(base, 3, 1);
    expect(result.goalError).toBeCloseTo(Math.abs(1.8 + 0.7 - 4), 10);
  });
});
