// Dixon & Coles (1997) low-score correlation adjustment. The independent-Poisson
// model systematically misprices 0-0/1-0/0-1/1-1 because it assumes home and away
// goals are independent. This applies a bounded correction to just those 4 cells.
// rho is a fixed literature-typical constant, not fitted per-league via MLE — no
// historical log-likelihood infrastructure exists or is planned.
export const DEFAULT_RHO = -0.13;

export function tau(x: number, y: number, lambda: number, mu: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

const ADJUSTED_CELLS: Array<[number, number]> = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
];

export function applyDixonColesAdjustment(
  matrix: number[][],
  lambdaHome: number,
  lambdaAway: number,
  rho: number = DEFAULT_RHO
): number[][] {
  const adjusted = matrix.map((row) => [...row]);
  for (const [x, y] of ADJUSTED_CELLS) {
    if (x < adjusted.length && y < adjusted[x].length) {
      adjusted[x][y] = matrix[x][y] * tau(x, y, lambdaHome, lambdaAway, rho);
    }
  }
  const total = adjusted.reduce((s, row) => s + row.reduce((rs, v) => rs + v, 0), 0);
  return adjusted.map((row) => row.map((v) => v / total));
}
