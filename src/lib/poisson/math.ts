// Pure math helpers — no I/O.

function factorial(n: number): number {
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/** Poisson probability mass function P(X = k) for rate lambda. */
export function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/** probability -> decimal odds. Returns null for a zero (or negative) probability. */
export function toOdds(probability: number): number | null {
  if (probability <= 0) return null;
  return 1 / probability;
}
