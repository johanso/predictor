import type { MatchPrediction, MarketOutcome, TeamGoalStats } from "@/types/domain";
import { computeLeagueAverages, computeTeamFactors } from "./teamStats";
import { computeLambdas } from "./matchup";
import {
  buildProbabilityMatrix,
  oneXTwoProbabilities,
  bttsProbabilities,
  exactScoreProbabilities,
  overUnderProbabilities,
} from "./markets";
import { toOdds } from "./math";

function outcome(label: string, probability: number): MarketOutcome {
  return { label, probability, odds: toOdds(probability) };
}

export function predictMatch(
  homeTeamId: number,
  awayTeamId: number,
  allTeamStats: TeamGoalStats[]
): MatchPrediction {
  const home = allTeamStats.find((t) => t.teamId === homeTeamId);
  const away = allTeamStats.find((t) => t.teamId === awayTeamId);
  if (!home) throw new Error(`Unknown home team id ${homeTeamId}`);
  if (!away) throw new Error(`Unknown away team id ${awayTeamId}`);
  if (home.playedHome === 0) throw new Error(`${home.teamName} has no home games played yet.`);
  if (away.playedAway === 0) throw new Error(`${away.teamName} has no away games played yet.`);

  const leagueAvg = computeLeagueAverages(allTeamStats);
  const homeFactors = computeTeamFactors(home, leagueAvg);
  const awayFactors = computeTeamFactors(away, leagueAvg);
  const { lambdaHome, lambdaAway } = computeLambdas(homeFactors, awayFactors);

  const matrix = buildProbabilityMatrix(lambdaHome, lambdaAway);

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

  return {
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
}

export * from "./math";
export * from "./teamStats";
export * from "./matchup";
export * from "./markets";
