export function formatPercent(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}

export function formatOdds(odds: number | null): string {
  return odds !== null ? odds.toFixed(2) : "—";
}
