export interface FdTeam {
  id: number;
  name: string;
  shortName?: string;
  crest?: string;
}

export interface FdStandingRow {
  position: number;
  team: FdTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface FdStandingsGroup {
  stage: string;
  type: "TOTAL" | "HOME" | "AWAY";
  group?: string | null;
  table: FdStandingRow[];
}

export interface FdStandingsResponse {
  competition: { id: number; name: string; code: string };
  season: { id: number; startDate: string; endDate: string; currentMatchday: number | null };
  standings: FdStandingsGroup[];
}

export interface FdMatch {
  id: number;
  status: string;
  utcDate: string;
  matchday: number | null;
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    fullTime: { home: number | null; away: number | null };
  };
}

export interface FdMatchesResponse {
  competition: { id: number; name: string; code: string };
  season: { id: number; startDate: string; endDate: string; currentMatchday: number | null };
  matches: FdMatch[];
}
