import { describe, it, expect } from "vitest";
import { computeKellyStake, KELLY_FRACTION, MAX_STAKE_FRACTION } from "@/lib/betting/kelly";

describe("computeKellyStake", () => {
  it("suggests 0 stake when the real odds don't beat the fair odds (no edge)", () => {
    // fair odds for p=0.5 is 2.00 — offering exactly 2.00 has zero edge (raw fraction 0)
    const result = computeKellyStake(0.5, 2.0, 1000);
    expect(result.hasEdge).toBe(false);
    expect(result.suggestedStake).toBe(0);
  });

  it("suggests 0 stake when the real odds are worse than fair", () => {
    const result = computeKellyStake(0.5, 1.8, 1000);
    expect(result.hasEdge).toBe(false);
    expect(result.suggestedStake).toBe(0);
  });

  it("computes a positive fractional-Kelly stake when there is a real edge", () => {
    // p=0.5, odds=2.5 (b=1.5): raw Kelly = (1.5*0.5 - 0.5)/1.5 = 0.1666...
    const result = computeKellyStake(0.5, 2.5, 1000);
    expect(result.hasEdge).toBe(true);
    const expectedRaw = (1.5 * 0.5 - 0.5) / 1.5;
    expect(result.fraction).toBeCloseTo(expectedRaw * KELLY_FRACTION, 10);
    expect(result.suggestedStake).toBeCloseTo(1000 * expectedRaw * KELLY_FRACTION, 6);
  });

  it("caps the suggested fraction at MAX_STAKE_FRACTION even with a huge edge", () => {
    // p=0.9, odds=10 (b=9): raw Kelly = (9*0.9 - 0.1)/9 ≈ 0.8889, far above the cap after *0.25
    const result = computeKellyStake(0.9, 10, 1000);
    expect(result.fraction).toBeCloseTo(MAX_STAKE_FRACTION, 10);
    expect(result.suggestedStake).toBeCloseTo(1000 * MAX_STAKE_FRACTION, 6);
  });

  it("returns no edge for invalid inputs (odds <= 1, probability out of range, non-positive bankroll)", () => {
    expect(computeKellyStake(0.5, 1, 1000).hasEdge).toBe(false);
    expect(computeKellyStake(0, 2.5, 1000).hasEdge).toBe(false);
    expect(computeKellyStake(1, 2.5, 1000).hasEdge).toBe(false);
    expect(computeKellyStake(0.5, 2.5, 0).hasEdge).toBe(false);
  });

  /**
   * Kelly is not an arbitrary formula — it is *defined* as the stake fraction that
   * maximises the expected logarithm of wealth. This checks the implementation
   * against that definition by brute force rather than against itself, so a wrong
   * rearrangement of (bp - q)/b could not pass.
   */
  it("matches the fraction that maximises expected log growth", () => {
    for (const [p, odds] of [
      [0.55, 2.2],
      [0.4, 3.2],
      [0.7, 1.8],
      [0.25, 5.0],
    ]) {
      const b = odds - 1;
      let bestF = 0;
      let bestGrowth = -Infinity;
      for (let f = 0; f < 1; f += 0.00005) {
        const growth = p * Math.log(1 + f * b) + (1 - p) * Math.log(1 - f);
        if (growth > bestGrowth) {
          bestGrowth = growth;
          bestF = f;
        }
      }
      // computeKellyStake reports the fractional stake, so undo KELLY_FRACTION.
      const raw = computeKellyStake(p, odds, 1000).fraction / KELLY_FRACTION;
      expect(raw).toBeCloseTo(bestF, 3);
    }
  });

  it("agrees with the equivalent (p*odds - 1)/(odds - 1) form", () => {
    for (const [p, odds] of [
      [0.5, 2.5],
      [0.33, 3.6],
      [0.62, 1.9],
    ]) {
      const alternative = (p * odds - 1) / (odds - 1);
      expect(computeKellyStake(p, odds, 1000).fraction).toBeCloseTo(alternative * KELLY_FRACTION, 10);
    }
  });

  it("flags an edge exactly when the bet has positive expected value", () => {
    // p*odds > 1 is the break-even line; hasEdge must agree with it on both sides.
    expect(computeKellyStake(0.51, 2.0, 1000).hasEdge).toBe(true); // EV +2%
    expect(computeKellyStake(0.49, 2.0, 1000).hasEdge).toBe(false); // EV -2%
    expect(computeKellyStake(0.455, 2.2, 1000).hasEdge).toBe(true); // just above 1/2.2
    expect(computeKellyStake(0.45, 2.2, 1000).hasEdge).toBe(false); // just below
  });

  it("never suggests staking more than the bankroll or a negative amount", () => {
    for (const p of [0.01, 0.3, 0.5, 0.8, 0.99]) {
      for (const odds of [1.01, 1.5, 2, 5, 50]) {
        const { fraction, suggestedStake } = computeKellyStake(p, odds, 500);
        expect(fraction).toBeGreaterThanOrEqual(0);
        expect(fraction).toBeLessThanOrEqual(MAX_STAKE_FRACTION);
        expect(suggestedStake).toBeGreaterThanOrEqual(0);
        expect(suggestedStake).toBeLessThanOrEqual(500);
      }
    }
  });
});
