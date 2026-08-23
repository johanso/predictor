import { describe, it, expect } from "vitest";
import {
  buildProbabilityMatrix,
  oneXTwoProbabilities,
  bttsProbabilities,
  overUnderProbabilities,
  gridTotal,
  zeroGoalProbabilities,
  overZeroFiveProbabilities,
  cleanSheetProbabilities,
  winToNilProbabilities,
  goalRangeProbabilities,
} from "@/lib/poisson/markets";
import { computeLambdas } from "@/lib/poisson/matchup";
import { predictMatch } from "@/lib/poisson";
import type { LeagueAverages, TeamFactors, TeamGoalStats } from "@/types/domain";

// Fixed lambda values (Vitória home vs Internacional away, Calculadora tab of
// LIGA-SERIA-A-BRASIL.xlsx) — kept as plain constants rather than computed via
// computeLambdas(), so these markets.ts tests validate the market math (1X2,
// BTTS, over/under, derived markets) independent of how lambdas are derived.
// The computeLambdas formula itself is tested separately below.
const lambdaHome = 1.626969696969697;
const lambdaAway = 0.3762755102040816;

describe("computeLambdas", () => {
  // Small hand-built league: a team with a strong home attack (2x league average)
  // and average road defense, against a league baseline of 1.5 goals/game.
  const leagueAvg: LeagueAverages = {
    avgGoalsScoredHome: 1.5,
    avgGoalsConcededHome: 1.1,
    avgGoalsScoredAway: 1.1,
    avgGoalsConcededAway: 1.5,
  };
  const homeTeam: TeamFactors = {
    teamId: 1,
    teamName: "Home",
    avgGoalsScoredHome: 3.0,
    avgGoalsConcededHome: 1.1,
    avgGoalsScoredAway: 1.1,
    avgGoalsConcededAway: 1.5,
    attackFactorHome: 2.0, // 3.0 / 1.5
    attackFactorAway: 1.0,
    defenseFactorHome: 1.0,
    defenseFactorAway: 1.0,
  };
  const awayTeam: TeamFactors = {
    teamId: 2,
    teamName: "Away",
    avgGoalsScoredHome: 1.5,
    avgGoalsConcededHome: 1.1,
    avgGoalsScoredAway: 2.2,
    avgGoalsConcededAway: 0.75,
    attackFactorHome: 1.0,
    attackFactorAway: 2.0, // 2.2 / 1.1
    defenseFactorHome: 1.0,
    defenseFactorAway: 0.5, // 0.75 / 1.5 — stingy road defense
  };

  it("multiplies league baseline × attack factor × opponent's defense factor, symmetrically", () => {
    const result = computeLambdas(homeTeam, awayTeam, leagueAvg);
    // λ_home = leagueAvg.avgGoalsScoredHome * homeTeam.attackFactorHome * awayTeam.defenseFactorAway
    expect(result.lambdaHome).toBeCloseTo(1.5 * 2.0 * 0.5, 10);
    // λ_away = leagueAvg.avgGoalsScoredAway * awayTeam.attackFactorAway * homeTeam.defenseFactorHome
    expect(result.lambdaAway).toBeCloseTo(1.1 * 2.0 * 1.0, 10);
  });

  it("gives a league-average team (all factors = 1.0) lambdas equal to the league baseline", () => {
    const avgFactors: TeamFactors = {
      teamId: 3,
      teamName: "Average",
      avgGoalsScoredHome: leagueAvg.avgGoalsScoredHome,
      avgGoalsConcededHome: leagueAvg.avgGoalsConcededHome,
      avgGoalsScoredAway: leagueAvg.avgGoalsScoredAway,
      avgGoalsConcededAway: leagueAvg.avgGoalsConcededAway,
      attackFactorHome: 1,
      attackFactorAway: 1,
      defenseFactorHome: 1,
      defenseFactorAway: 1,
    };
    const result = computeLambdas(avgFactors, avgFactors, leagueAvg);
    expect(result.lambdaHome).toBeCloseTo(leagueAvg.avgGoalsScoredHome, 10);
    expect(result.lambdaAway).toBeCloseTo(leagueAvg.avgGoalsScoredAway, 10);
  });
});

describe("market probabilities for Vitória vs Internacional, replicating Excel's 0-5 grid exactly", () => {
  // The workbook's Poisson matrix only covers scores 0-5 per side (Poisson!E1:J1).
  // Using the same grid size here reproduces its outputs almost exactly, isolating
  // the market formulas (triangular sum, BTTS, over/under) from the grid-size choice.
  const matrix = buildProbabilityMatrix(lambdaHome, lambdaAway, 6);

  it("1X2 matches Calculadora!B10:B12", () => {
    const { homeWin, draw, awayWin } = oneXTwoProbabilities(matrix);
    expect(homeWin).toBeCloseTo(0.6813112194315069, 6);
    expect(draw).toBeCloseTo(0.2310115343053666, 6);
    expect(awayWin).toBeCloseTo(0.0811445346356358, 6);
  });

  it("BTTS matches Calculadora!B15", () => {
    const { yes } = bttsProbabilities(matrix);
    expect(yes).toBeCloseTo(0.24990945067752593, 6);
  });

  it("over/under 2.5 matches Calculadora!F26 (+2.5)", () => {
    const results = overUnderProbabilities(matrix);
    const line25 = results.find((r) => r.line === 2.5)!;
    expect(line25.over).toBeCloseTo(0.31766925348324015, 6);
  });
});

describe("market probabilities with the app's default 0-10 grid", () => {
  // Wider grid than Excel's 0-5: captures the goal-count tail Excel truncates,
  // so results are close to but not identical to the workbook (slightly higher
  // home-win/BTTS/over probabilities, since the missing mass skews toward the
  // stronger side scoring more). Verify internal consistency instead of an exact match.
  const matrix = buildProbabilityMatrix(lambdaHome, lambdaAway);

  it("1X2 probabilities sum to ~1 and stay close to the Excel reference", () => {
    const { homeWin, draw, awayWin } = oneXTwoProbabilities(matrix);
    expect(homeWin + draw + awayWin).toBeCloseTo(1, 5);
    expect(homeWin).toBeGreaterThan(0.6813112194315069);
    expect(homeWin).toBeCloseTo(0.6813112194315069, 1);
  });
});

describe("derived markets, on the app's default 0-10 grid", () => {
  const matrix = buildProbabilityMatrix(lambdaHome, lambdaAway);
  const total = gridTotal(matrix);

  it("zeroGoalProbabilities matches the values bttsProbabilities relies on", () => {
    const { pHomeZero, pAwayZero, pBothZero } = zeroGoalProbabilities(matrix);
    const btts = bttsProbabilities(matrix);
    expect(total - pHomeZero - pAwayZero + pBothZero).toBeCloseTo(btts.yes, 10);
  });

  it("overZeroFiveProbabilities is 1 - P(that side scores 0)", () => {
    const { pHomeZero, pAwayZero } = zeroGoalProbabilities(matrix);
    const over05 = overZeroFiveProbabilities(matrix);
    expect(over05.home).toBeCloseTo(total - pHomeZero, 10);
    expect(over05.away).toBeCloseTo(total - pAwayZero, 10);
  });

  it("cleanSheetProbabilities: home clean sheet = P(away scores 0)", () => {
    const { pHomeZero, pAwayZero } = zeroGoalProbabilities(matrix);
    const cleanSheet = cleanSheetProbabilities(matrix);
    expect(cleanSheet.home).toBeCloseTo(pAwayZero, 10);
    expect(cleanSheet.away).toBeCloseTo(pHomeZero, 10);
  });

  it("winToNilProbabilities stays within cleanSheet and 1X2 win bounds", () => {
    const cleanSheet = cleanSheetProbabilities(matrix);
    const winToNil = winToNilProbabilities(matrix);
    const { homeWin, awayWin } = oneXTwoProbabilities(matrix);
    expect(winToNil.home).toBeLessThanOrEqual(cleanSheet.home + 1e-9);
    expect(winToNil.home).toBeLessThanOrEqual(homeWin + 1e-9);
    expect(winToNil.away).toBeLessThanOrEqual(cleanSheet.away + 1e-9);
    expect(winToNil.away).toBeLessThanOrEqual(awayWin + 1e-9);
  });

  it("goalRangeProbabilities buckets sum to ~1", () => {
    const ranges = goalRangeProbabilities(matrix);
    const sum = ranges.reduce((s, r) => s + r.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(ranges.map((r) => r.label)).toEqual(["0-1", "2-3", "4+"]);
  });
});

describe("predictMatch end-to-end", () => {
  const teams: TeamGoalStats[] = [
    {
      teamId: 1,
      teamName: "Vitória",
      playedHome: 8,
      goalsForHome: 14,
      goalsAgainstHome: 3,
      playedAway: 9,
      goalsForAway: 7,
      goalsAgainstAway: 22,
    },
    {
      teamId: 2,
      teamName: "Internacional",
      playedHome: 9,
      goalsForHome: 11,
      goalsAgainstHome: 9,
      playedAway: 9,
      goalsForAway: 10,
      goalsAgainstAway: 13,
    },
    {
      teamId: 3,
      teamName: "Rest",
      playedHome: 160,
      goalsForHome: 250,
      goalsAgainstHome: 184,
      playedAway: 159,
      goalsForAway: 179,
      goalsAgainstAway: 240,
    },
  ];

  it("reproduces the same ballpark 1X2 result via the public predictMatch() API", () => {
    // Values include both the symmetric attack/defense normalization + small-sample
    // shrinkage (src/lib/poisson/teamStats.ts, matchup.ts) and the Dixon-Coles
    // low-score correction (src/lib/poisson/dixonColes.ts) — re-pinned from real
    // predictMatch() output, not hand-derived. Home-win probability is noticeably
    // lower than the pre-normalization numbers: Vitória's home attack (14 goals/8
    // games, well above league average) is no longer taken at face value — it's
    // both normalized against the league baseline and shrunk toward it.
    const prediction = predictMatch(1, 2, teams);
    expect(prediction.oneXTwo.homeWin.probability).toBeCloseTo(0.598423216169795, 6);
    expect(prediction.oneXTwo.homeWin.odds).toBeCloseTo(1.6710581624832261, 6);
    expect(prediction.oneXTwo.draw.probability).toBeCloseTo(0.27385860598956924, 6);
    expect(prediction.oneXTwo.awayWin.probability).toBeCloseTo(0.1277181778406354, 6);
    expect(prediction.doubleChance.oneX.probability).toBeCloseTo(0.8722818221593642, 6);
    const total = prediction.oneXTwo.homeWin.probability + prediction.oneXTwo.draw.probability + prediction.oneXTwo.awayWin.probability;
    expect(total).toBeCloseTo(1, 5);
  });
});
