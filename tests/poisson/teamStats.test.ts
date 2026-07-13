import { describe, it, expect } from "vitest";
import { computeLeagueAverages, computeTeamFactors } from "@/lib/poisson/teamStats";
import type { TeamGoalStats } from "@/types/domain";

// Reproduces the exact Estadistica totals (row 23) from LIGA-SERIA-A-BRASIL.xlsx
// by splitting the league into Vitória, Internacional, and a synthetic "Rest"
// team whose stats equal the sum of the other 18 real teams. League-wide sums
// (and therefore averages/factors) come out identical to the workbook.
const vitoria: TeamGoalStats = {
  teamId: 1,
  teamName: "Vitória",
  playedHome: 8,
  goalsForHome: 14,
  goalsAgainstHome: 3,
  playedAway: 9,
  goalsForAway: 7,
  goalsAgainstAway: 22,
};

const internacional: TeamGoalStats = {
  teamId: 2,
  teamName: "Internacional",
  playedHome: 9,
  goalsForHome: 11,
  goalsAgainstHome: 9,
  playedAway: 9,
  goalsForAway: 10,
  goalsAgainstAway: 13,
};

const rest: TeamGoalStats = {
  teamId: 3,
  teamName: "Rest",
  playedHome: 160,
  goalsForHome: 250,
  goalsAgainstHome: 184,
  playedAway: 159,
  goalsForAway: 179,
  goalsAgainstAway: 240,
};

const league = [vitoria, internacional, rest];

describe("computeLeagueAverages", () => {
  it("matches Estadistica!I23:L23", () => {
    const avg = computeLeagueAverages(league);
    expect(avg.avgGoalsScoredHome).toBeCloseTo(1.5536723163841808, 10);
    expect(avg.avgGoalsConcededHome).toBeCloseTo(1.1073446327683616, 10);
    expect(avg.avgGoalsScoredAway).toBeCloseTo(1.1073446327683616, 10);
    expect(avg.avgGoalsConcededAway).toBeCloseTo(1.5536723163841808, 10);
  });
});

describe("computeTeamFactors", () => {
  const avg = computeLeagueAverages(league);

  it("matches Vitória's defenseFactorHome (Calculadora!B5)", () => {
    const factors = computeTeamFactors(vitoria, avg);
    expect(factors.avgGoalsScoredHome).toBeCloseTo(1.75, 10);
    expect(factors.defenseFactorHome).toBeCloseTo(0.33864795918367346, 10);
  });

  it("matches Internacional's defenseFactorAway (Calculadora!D5)", () => {
    const factors = computeTeamFactors(internacional, avg);
    expect(factors.avgGoalsScoredAway).toBeCloseTo(1.1111111111111112, 10);
    expect(factors.defenseFactorAway).toBeCloseTo(0.9296969696969697, 10);
  });
});
