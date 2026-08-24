/**
 * The owner's timezone, for text rendered on the server. Client components can use
 * the browser's zone and do; server-rendered dates have no such thing — the dev
 * machine runs at UTC-5 and the deployed server at UTC, so without this a "se repone
 * a las HH:MM" reads five hours wrong once deployed.
 */
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE ?? "America/Bogota";

export function formatPercent(probability: number): string {
  return `${(probability * 100).toFixed(1)}%`;
}

export function formatOdds(odds: number | null): string {
  return odds !== null ? odds.toFixed(2) : "—";
}
