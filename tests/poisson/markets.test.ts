import { describe, it, expect } from "vitest";
import { buildProbabilityMatrix, oneXTwoProbabilities, bttsProbabilities, overUnderProbabilities } from "@/lib/poisson/markets";
import { computeLambdas } from "@/lib/poisson/matchup";
import { predictMatch } from "@/lib/poisson";
import type { TeamFactors, TeamGoalStats } from "@/types/domain";

// Reference match: Vitória (home) vs Internacional (away), Calculadora tab of
// LIGA-SERIA-A-BRASIL.xlsx. Expected values below are the workbook's own output
// (its grid only covers scores 0-5, ours covers 0-10, so a tiny tolerance is used).
const homeFactors: TeamFactors = {
  teamId: 1,
  teamName: "Vitória",
  avgGoalsScoredHome: 1.75,
  avgGoalsConcededHome: 0.375,
  avgGoalsScoredAway: 0.7777777777777778,
  avgGoalsConcededAway: 2.4444444444444446,
  defenseFactorHome: 0.33864795918367346,
  defenseFactorAway: 1.5733333333333335,
};

const awayFactors: TeamFactors = {
  teamId: 2,
  teamName: "Internacional",
  avgGoalsScoredHome: 1.2222222222222223,
  avgGoalsConcededHome: 1,
  avgGoalsScoredAway: 1.1111111111111112,
  avgGoalsConcededAway: 1.4444444444444444,
  defenseFactorHome: 0.9030612244897959,
  defenseFactorAway: 0.9296969696969697,
};

describe("computeLambdas", () => {
  it("matches Calculadora!B6/D6", () => {
    const { lambdaHome, lambdaAway } = computeLambdas(homeFactors, awayFactors);
    expect(lambdaHome).toBeCloseTo(1.626969696969697, 10);
    expect(lambdaAway).toBeCloseTo(0.3762755102040816, 10);
  });
});

describe("market probabilities for Vitória vs Internacional, replicating Excel's 0-5 grid exactly", () => {
  // The workbook's Poisson matrix only covers scores 0-5 per side (Poisson!E1:J1).
  // Using the same grid size here reproduces its outputs almost exactly, isolating
  // the market formulas (triangular sum, BTTS, over/under) from the grid-size choice.
  const { lambdaHome, lambdaAway } = computeLambdas(homeFactors, awayFactors);
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
  const { lambdaHome, lambdaAway } = computeLambdas(homeFactors, awayFactors);
  const matrix = buildProbabilityMatrix(lambdaHome, lambdaAway);

  it("1X2 probabilities sum to ~1 and stay close to the Excel reference", () => {
    const { homeWin, draw, awayWin } = oneXTwoProbabilities(matrix);
    expect(homeWin + draw + awayWin).toBeCloseTo(1, 5);
    expect(homeWin).toBeGreaterThan(0.6813112194315069);
    expect(homeWin).toBeCloseTo(0.6813112194315069, 1);
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
    const prediction = predictMatch(1, 2, teams);
    expect(prediction.oneXTwo.homeWin.probability).toBeCloseTo(0.6813112194315069, 1);
    expect(prediction.oneXTwo.homeWin.odds).toBeCloseTo(1.4677580105526669, 1);
    expect(prediction.doubleChance.oneX.probability).toBeCloseTo(0.9123227537368734, 1);
    const total = prediction.oneXTwo.homeWin.probability + prediction.oneXTwo.draw.probability + prediction.oneXTwo.awayWin.probability;
    expect(total).toBeCloseTo(1, 5);
  });
});
