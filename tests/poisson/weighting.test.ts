import { describe, it, expect } from "vitest";
import { decayWeight, computeWeightedTeamGoalStats } from "@/lib/poisson/weighting";

const DAY = 24 * 60 * 60 * 1000;

describe("decayWeight", () => {
  it("is 1 at the reference date itself", () => {
    const ref = new Date("2026-06-01T00:00:00Z");
    expect(decayWeight(ref, ref, 60)).toBeCloseTo(1, 10);
  });

  it("is exactly 0.5 at one half-life", () => {
    const ref = new Date("2026-06-01T00:00:00Z");
    const matchDate = new Date(ref.getTime() - 60 * DAY);
    expect(decayWeight(matchDate, ref, 60)).toBeCloseTo(0.5, 10);
  });

  it("clamps future-dated matches to weight 1, never >1 (clock-skew guard)", () => {
    const ref = new Date("2026-06-01T00:00:00Z");
    const future = new Date(ref.getTime() + 10 * DAY);
    expect(decayWeight(future, ref, 60)).toBeCloseTo(1, 10);
  });
});

describe("computeWeightedTeamGoalStats", () => {
  it("returns an empty map for empty input", () => {
    const result = computeWeightedTeamGoalStats([], new Date(), 60);
    expect(result.size).toBe(0);
  });

  it("computes exact weighted sums for a small hand-built match set", () => {
    const ref = new Date("2026-06-01T00:00:00Z");
    const halfLife = 60;
    const recentMatch = { homeTeamId: 1, awayTeamId: 2, homeGoals: 3, awayGoals: 1, utcDate: ref };
    const oldMatch = {
      homeTeamId: 1,
      awayTeamId: 3,
      homeGoals: 1,
      awayGoals: 1,
      utcDate: new Date(ref.getTime() - halfLife * DAY),
    };

    const result = computeWeightedTeamGoalStats([recentMatch, oldMatch], ref, halfLife);
    const team1 = result.get(1)!;

    const wRecent = decayWeight(recentMatch.utcDate, ref, halfLife);
    const wOld = decayWeight(oldMatch.utcDate, ref, halfLife);

    expect(wRecent).toBeCloseTo(1, 10);
    expect(wOld).toBeCloseTo(0.5, 10);

    expect(team1.playedHome).toBeCloseTo(wRecent + wOld, 10);
    expect(team1.goalsForHome).toBeCloseTo(3 * wRecent + 1 * wOld, 10);
    expect(team1.goalsAgainstHome).toBeCloseTo(1 * wRecent + 1 * wOld, 10);

    // The old match's contribution is small relative to the recent one's.
    expect(1 * wOld).toBeLessThan(3 * wRecent);
  });

  it("splits home/away accumulation correctly across both teams in a match", () => {
    const ref = new Date("2026-06-01T00:00:00Z");
    const result = computeWeightedTeamGoalStats(
      [{ homeTeamId: 10, awayTeamId: 20, homeGoals: 2, awayGoals: 0, utcDate: ref }],
      ref,
      60
    );
    const home = result.get(10)!;
    const away = result.get(20)!;

    expect(home.playedHome).toBeCloseTo(1, 10);
    expect(home.playedAway).toBe(0);
    expect(home.goalsForHome).toBeCloseTo(2, 10);
    expect(home.goalsAgainstHome).toBeCloseTo(0, 10);

    expect(away.playedAway).toBeCloseTo(1, 10);
    expect(away.playedHome).toBe(0);
    expect(away.goalsForAway).toBeCloseTo(0, 10);
    expect(away.goalsAgainstAway).toBeCloseTo(2, 10);
  });
});
