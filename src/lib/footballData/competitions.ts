// 10 of the 12 competitions included in football-data.org's free tier.
// World Cup and European Championship are excluded: their matches are played
// at neutral/mixed venues in single round-robin groups, so a home/away split
// isn't meaningful — they're left out entirely rather than shown disabled.

export interface CompetitionInfo {
  code: string;
  name: string;
  hasHomeAway: boolean;
}

export const COMPETITIONS: CompetitionInfo[] = [
  { code: "PL", name: "Premier League", hasHomeAway: true },
  { code: "PD", name: "La Liga", hasHomeAway: true },
  { code: "SA", name: "Serie A", hasHomeAway: true },
  { code: "BL1", name: "Bundesliga", hasHomeAway: true },
  { code: "FL1", name: "Ligue 1", hasHomeAway: true },
  { code: "BSA", name: "Brasileirão Série A", hasHomeAway: true },
  { code: "DED", name: "Eredivisie", hasHomeAway: true },
  { code: "PPL", name: "Primeira Liga", hasHomeAway: true },
  { code: "ELC", name: "Championship", hasHomeAway: true },
  { code: "CL", name: "Champions League", hasHomeAway: true },
];

export function getCompetitionInfo(code: string): CompetitionInfo | undefined {
  return COMPETITIONS.find((c) => c.code === code);
}
