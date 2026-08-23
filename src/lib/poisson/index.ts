import type { DerivedMarkets, MatchPrediction, MarketOutcome, TeamGoalStats } from "@/types/domain";
import { computeLeagueAverages, computeTeamFactors } from "./teamStats";
import { computeLambdas } from "./matchup";
import {
  buildProbabilityMatrix,
  oneXTwoProbabilities,
  bttsProbabilities,
  exactScoreProbabilities,
  overUnderProbabilities,
  overZeroFiveProbabilities,
  cleanSheetProbabilities,
  winToNilProbabilities,
  goalRangeProbabilities,
} from "./markets";
import { toOdds } from "./math";
import { applyDixonColesAdjustment } from "./dixonColes";

function outcome(label: string, probability: number): MarketOutcome {
  return { label, probability, odds: toOdds(probability) };
}

export function predictMatchWithMatrix(
  homeTeamId: number,
  awayTeamId: number,
  allTeamStats: TeamGoalStats[]
): { prediction: MatchPrediction; matrix: number[][] } {
  const home = allTeamStats.find((t) => t.teamId === homeTeamId);
  const away = allTeamStats.find((t) => t.teamId === awayTeamId);
  if (!home) throw new Error(`Unknown home team id ${homeTeamId}`);
  if (!away) throw new Error(`Unknown away team id ${awayTeamId}`);
  if (home.playedHome === 0) throw new Error(`${home.teamName} has no home games played yet.`);
  if (away.playedAway === 0) throw new Error(`${away.teamName} has no away games played yet.`);

  const leagueAvg = computeLeagueAverages(allTeamStats);
  const homeFactors = computeTeamFactors(home, leagueAvg);
  const awayFactors = computeTeamFactors(away, leagueAvg);
  const { lambdaHome, lambdaAway } = computeLambdas(homeFactors, awayFactors, leagueAvg);

  const rawMatrix = buildProbabilityMatrix(lambdaHome, lambdaAway);
  // Dixon-Coles: corrects the independent-Poisson model's known mispricing of
  // low scorelines (0-0/1-0/0-1/1-1) — see src/lib/poisson/dixonColes.ts.
  const matrix = applyDixonColesAdjustment(rawMatrix, lambdaHome, lambdaAway);

  const { homeWin, draw, awayWin } = oneXTwoProbabilities(matrix);
  const btts = bttsProbabilities(matrix);
  const exactScores = exactScoreProbabilities(matrix).map((s) => ({
    ...s,
    odds: toOdds(s.probability),
  }));
  const overUnder = overUnderProbabilities(matrix).map((ou) => ({
    line: ou.line,
    over: outcome(`+${ou.line}`, ou.over),
    under: outcome(`-${ou.line}`, ou.under),
  }));

  const prediction: MatchPrediction = {
    homeTeam: home.teamName,
    awayTeam: away.teamName,
    lambdaHome,
    lambdaAway,
    oneXTwo: {
      homeWin: outcome("Gana Local", homeWin),
      draw: outcome("Empate", draw),
      awayWin: outcome("Gana Visitante", awayWin),
    },
    doubleChance: {
      oneX: outcome("1X", homeWin + draw),
      oneTwo: outcome("12", homeWin + awayWin),
      xTwo: outcome("X2", draw + awayWin),
    },
    btts: {
      yes: outcome("Sí", btts.yes),
      no: outcome("No", btts.no),
    },
    exactScores,
    overUnder,
  };

  return { prediction, matrix };
}

export function predictMatch(
  homeTeamId: number,
  awayTeamId: number,
  allTeamStats: TeamGoalStats[]
): MatchPrediction {
  return predictMatchWithMatrix(homeTeamId, awayTeamId, allTeamStats).prediction;
}

export function buildDerivedMarkets(matrix: number[][]): DerivedMarkets {
  const over05 = overZeroFiveProbabilities(matrix);
  const cleanSheet = cleanSheetProbabilities(matrix);
  const winToNil = winToNilProbabilities(matrix);
  const goalRanges = goalRangeProbabilities(matrix);

  return {
    homeOver05: outcome("Local marca +0.5", over05.home),
    awayOver05: outcome("Visitante marca +0.5", over05.away),
    cleanSheetHome: outcome("Portería a cero (Local)", cleanSheet.home),
    cleanSheetAway: outcome("Portería a cero (Visitante)", cleanSheet.away),
    winToNilHome: outcome("Gana sin recibir (Local)", winToNil.home),
    winToNilAway: outcome("Gana sin recibir (Visitante)", winToNil.away),
    goalRanges: goalRanges.map((r) => ({ label: r.label, outcome: outcome(r.label, r.probability) })),
  };
}

export * from "./math";
export * from "./teamStats";
export * from "./matchup";
export * from "./markets";
export * from "./dixonColes";
export * from "./weighting";
export * from "./summary";
export * from "./confidence";
