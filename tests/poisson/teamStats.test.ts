import { describe, it, expect } from "vitest";
import { computeLeagueAverages, computeTeamFactors, SHRINKAGE_PSEUDO_MATCHES } from "@/lib/poisson/teamStats";
import type { TeamGoalStats } from "@/types/domain";

// Reproduces the exact Estadistica totals (row 23) from LIGA-SERIA-A-BRASIL.xlsx
// by splitting the league into Vitória, Internacional, and a synthetic "Rest"
// team whose stats equal the sum of the other 18 real teams. League-wide sums
// (and therefore averages) come out identical to the workbook. Note: this file
// no longer pins computeTeamFactors against the workbook — that function's
// methodology changed on purpose (symmetric attack/defense normalization +
// small-sample shrinkage), so it diverges from the original spreadsheet.
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

  it("shrinks a team with 0 matches played exactly to the league average (all factors = 1.0)", () => {
    const newTeam: TeamGoalStats = {
      teamId: 99,
      teamName: "Recién Ascendido",
      playedHome: 0,
      goalsForHome: 0,
      goalsAgainstHome: 0,
      playedAway: 0,
      goalsForAway: 0,
      goalsAgainstAway: 0,
    };
    const factors = computeTeamFactors(newTeam, avg);
    expect(factors.attackFactorHome).toBeCloseTo(1, 10);
    expect(factors.attackFactorAway).toBeCloseTo(1, 10);
    expect(factors.defenseFactorHome).toBeCloseTo(1, 10);
    expect(factors.defenseFactorAway).toBeCloseTo(1, 10);
    expect(factors.avgGoalsScoredHome).toBeCloseTo(avg.avgGoalsScoredHome, 10);
    expect(factors.avgGoalsConcededAway).toBeCloseTo(avg.avgGoalsConcededAway, 10);
  });

  it("computes both attack and defense factors symmetrically, shrunk toward league average, for a real sample", () => {
    const factors = computeTeamFactors(vitoria, avg);

    // Hand-computed via shrinkRate = (goals + k*leagueAvgPerGame) / (played + k), k = SHRINKAGE_PSEUDO_MATCHES.
    const k = SHRINKAGE_PSEUDO_MATCHES;
    const expectedAvgGoalsScoredHome = (14 + k * avg.avgGoalsScoredHome) / (8 + k);
    const expectedAvgGoalsConcededHome = (3 + k * avg.avgGoalsConcededHome) / (8 + k);
    const expectedAvgGoalsScoredAway = (7 + k * avg.avgGoalsScoredAway) / (9 + k);
    const expectedAvgGoalsConcededAway = (22 + k * avg.avgGoalsConcededAway) / (9 + k);

    expect(factors.avgGoalsScoredHome).toBeCloseTo(expectedAvgGoalsScoredHome, 10);
    expect(factors.avgGoalsConcededHome).toBeCloseTo(expectedAvgGoalsConcededHome, 10);
    expect(factors.avgGoalsScoredAway).toBeCloseTo(expectedAvgGoalsScoredAway, 10);
    expect(factors.avgGoalsConcededAway).toBeCloseTo(expectedAvgGoalsConcededAway, 10);

    expect(factors.attackFactorHome).toBeCloseTo(expectedAvgGoalsScoredHome / avg.avgGoalsScoredHome, 10);
    expect(factors.attackFactorAway).toBeCloseTo(expectedAvgGoalsScoredAway / avg.avgGoalsScoredAway, 10);
    expect(factors.defenseFactorHome).toBeCloseTo(expectedAvgGoalsConcededHome / avg.avgGoalsConcededHome, 10);
    expect(factors.defenseFactorAway).toBeCloseTo(expectedAvgGoalsConcededAway / avg.avgGoalsConcededAway, 10);

    // Vitória scored well above league average at home (14 goals / 8 games) — shrinkage
    // pulls it down from the raw 1.75 average, but it should still clearly exceed 1.0.
    expect(factors.avgGoalsScoredHome).toBeLessThan(14 / 8);
    expect(factors.attackFactorHome).toBeGreaterThan(1);
  });

  it("shrinkage effect shrinks toward 0 as matches played grows", () => {
    // Same per-game rate (2 goals/game) at two very different sample sizes — the
    // shrunk estimate should sit closer to the raw rate for the larger sample.
    const small: TeamGoalStats = { teamId: 1, teamName: "Small", playedHome: 2, goalsForHome: 4, goalsAgainstHome: 0, playedAway: 1, goalsForAway: 0, goalsAgainstAway: 0 };
    const big: TeamGoalStats = { teamId: 2, teamName: "Big", playedHome: 30, goalsForHome: 60, goalsAgainstHome: 0, playedAway: 1, goalsForAway: 0, goalsAgainstAway: 0 };

    const smallFactors = computeTeamFactors(small, avg);
    const bigFactors = computeTeamFactors(big, avg);

    const rawRate = 2; // both have a raw 2 goals/game home rate
    expect(Math.abs(bigFactors.avgGoalsScoredHome - rawRate)).toBeLessThan(Math.abs(smallFactors.avgGoalsScoredHome - rawRate));
  });
});
