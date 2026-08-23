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

/**
 * The range of rho that keeps every corrected cell positive. Outside it the
 * "probability" of a 0-0 or a 1-0 goes negative, which no amount of renormalising
 * repairs. Each bound comes from one of the four cells:
 *
 *   1 - lambda*mu*rho > 0  =>  rho <  1 / (lambda*mu)
 *   1 - rho          > 0   =>  rho <  1
 *   1 + lambda*rho   > 0   =>  rho > -1 / lambda
 *   1 + mu*rho       > 0   =>  rho > -1 / mu
 *
 * so the upper bound is driven by the *product* of the rates and the lower bound by
 * the *larger* of them.
 */
export function rhoBounds(lambda: number, mu: number): { min: number; max: number } {
  const safeLambda = Math.max(lambda, 1e-6);
  const safeMu = Math.max(mu, 1e-6);
  return {
    min: Math.max(-1 / Math.max(safeLambda, safeMu), -0.99),
    max: Math.min(1 / (safeLambda * safeMu), 0.99),
  };
}

export function clampRho(rho: number, lambda: number, mu: number): number {
  const { min, max } = rhoBounds(lambda, mu);
  return Math.min(Math.max(rho, min), max);
}

export function applyDixonColesAdjustment(
  matrix: number[][],
  lambdaHome: number,
  lambdaAway: number,
  rho: number = DEFAULT_RHO
): number[][] {
  // Clamped rather than trusted: a rho valid for one matchup can drive a cell
  // negative in a higher-scoring one, and renormalising afterwards would happily
  // hand back a negative probability.
  const safeRho = clampRho(rho, lambdaHome, lambdaAway);

  const adjusted = matrix.map((row) => [...row]);
  for (const [x, y] of ADJUSTED_CELLS) {
    if (x < adjusted.length && y < adjusted[x].length) {
      adjusted[x][y] = matrix[x][y] * tau(x, y, lambdaHome, lambdaAway, safeRho);
    }
  }
  const total = adjusted.reduce((s, row) => s + row.reduce((rs, v) => rs + v, 0), 0);
  return adjusted.map((row) => row.map((v) => v / total));
}
