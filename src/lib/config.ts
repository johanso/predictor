// Server-only config. Never import this from a "use client" component —
// FOOTBALL_DATA_API_KEY must never reach the browser bundle.
// Values are read lazily (not at module load) so build-time page-data
// collection doesn't fail before .env is actually populated.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and add your football-data.org API key.`
    );
  }
  return value;
}

export const config = {
  footballData: {
    get apiKey(): string {
      return requireEnv("FOOTBALL_DATA_API_KEY");
    },
    get baseUrl(): string {
      return process.env.FOOTBALL_DATA_BASE_URL ?? "https://api.football-data.org/v4";
    },
  },
  oddsApi: {
    get apiKey(): string {
      return requireEnv("ODDS_API_KEY");
    },
    get baseUrl(): string {
      return process.env.ODDS_API_BASE_URL ?? "https://api.odds-api.io/v3";
    },
    /** Absent until the key is set — lets the UI hide the odds features instead of erroring. */
    get isConfigured(): boolean {
      return Boolean(process.env.ODDS_API_KEY);
    },
  },
};
