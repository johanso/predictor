/**
 * football-data.org competition code -> odds-api.io league slug.
 *
 * Confirmed against GET /leagues?sport=football. Competitions absent from this map
 * simply get no odds — the app stays usable, the odds column just stays empty.
 * Champions League is left out on purpose: its fixtures span many national leagues
 * and the fuzzy fixture match is far less reliable there.
 */
export const ODDS_API_LEAGUE_SLUGS: Record<string, string> = {
  BSA: "brazil-brasileiro-serie-a",
  PD: "spain-laliga",
  PL: "england-premier-league",
  SA: "italy-serie-a",
  BL1: "germany-bundesliga",
  FL1: "france-ligue-1",
  DED: "netherlands-eredivisie",
  PPL: "portugal-liga-portugal",
  ELC: "england-championship",
};
