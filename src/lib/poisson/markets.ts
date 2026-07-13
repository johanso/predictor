import { poissonPmf } from "./math";

/** matrix[homeGoals][awayGoals] = P(home scores homeGoals AND away scores awayGoals) */
export function buildProbabilityMatrix(lambdaHome: number, lambdaAway: number, size = 11): number[][] {
  const homePmf = Array.from({ length: size }, (_, k) => poissonPmf(k, lambdaHome));
  const awayPmf = Array.from({ length: size }, (_, k) => poissonPmf(k, lambdaAway));

  return homePmf.map((ph) => awayPmf.map((pa) => ph * pa));
}

export function oneXTwoProbabilities(matrix: number[][]) {
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i].length; j++) {
      if (i > j) homeWin += matrix[i][j];
      else if (i === j) draw += matrix[i][j];
      else awayWin += matrix[i][j];
    }
  }

  return { homeWin, draw, awayWin };
}

function gridTotal(matrix: number[][]): number {
  return matrix.reduce((s, row) => s + row.reduce((rs, v) => rs + v, 0), 0);
}

export function bttsProbabilities(matrix: number[][]) {
  // Normalize against the matrix's actual total mass (not a hardcoded 1) so this
  // stays correct for any grid size, including a truncated one like Excel's 0-5.
  const total = gridTotal(matrix);
  const pHomeZero = matrix[0].reduce((s, v) => s + v, 0);
  const pAwayZero = matrix.reduce((s, row) => s + row[0], 0);
  const pBothZero = matrix[0][0];

  const yes = total - pHomeZero - pAwayZero + pBothZero;
  return { yes, no: total - yes };
}

export interface ExactScoreProb {
  home: number;
  away: number;
  probability: number;
}

export function exactScoreProbabilities(matrix: number[][], maxGoals = 5): ExactScoreProb[] {
  const scores: ExactScoreProb[] = [];
  for (let i = 0; i <= maxGoals && i < matrix.length; i++) {
    for (let j = 0; j <= maxGoals && j < matrix[i].length; j++) {
      scores.push({ home: i, away: j, probability: matrix[i][j] });
    }
  }
  return scores;
}

export interface OverUnderProb {
  line: number;
  over: number;
  under: number;
}

export function overUnderProbabilities(matrix: number[][], lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]): OverUnderProb[] {
  const total = gridTotal(matrix);
  return lines.map((line) => {
    const threshold = Math.floor(line);
    let under = 0;
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        if (i + j <= threshold) under += matrix[i][j];
      }
    }
    return { line, under, over: total - under };
  });
}
