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
});
