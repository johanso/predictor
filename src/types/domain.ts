export interface TeamGoalStats {
  teamId: number;
  teamName: string;
  playedHome: number;
  goalsForHome: number;
  goalsAgainstHome: number;
  playedAway: number;
  goalsForAway: number;
  goalsAgainstAway: number;
}

export interface LeagueAverages {
  avgGoalsScoredHome: number;
  avgGoalsConcededHome: number;
  avgGoalsScoredAway: number;
  avgGoalsConcededAway: number;
}

export interface TeamFactors {
  teamId: number;
  teamName: string;
  avgGoalsScoredHome: number;
  avgGoalsConcededHome: number;
  avgGoalsScoredAway: number;
  avgGoalsConcededAway: number;
  attackFactorHome: number;
  attackFactorAway: number;
  defenseFactorHome: number;
  defenseFactorAway: number;
}

export interface MarketOutcome {
  label: string;
  probability: number;
  odds: number | null; // null when probability is 0 (undefined odds)
}

export interface ExactScoreOutcome {
  home: number;
  away: number;
  probability: number;
  odds: number | null;
}

export interface OverUnderOutcome {
  line: number; // e.g. 2.5
  over: MarketOutcome;
  under: MarketOutcome;
}

export interface MatchPrediction {
  homeTeam: string;
  awayTeam: string;
  lambdaHome: number;
  lambdaAway: number;
  oneXTwo: {
    homeWin: MarketOutcome;
    draw: MarketOutcome;
    awayWin: MarketOutcome;
  };
  doubleChance: {
    oneX: MarketOutcome;
    oneTwo: MarketOutcome;
    xTwo: MarketOutcome;
  };
  btts: {
    yes: MarketOutcome;
    no: MarketOutcome;
  };
  exactScores: ExactScoreOutcome[];
  overUnder: OverUnderOutcome[];
}

export interface PredictionSummary {
  favorite: "home" | "away" | "draw";
  favoriteLabel: string;
  favoriteProbability: number;
  likelyScore: { home: number; away: number; probability: number };
  text: string;
}

export interface DerivedMarkets {
  homeOver05: MarketOutcome;
  awayOver05: MarketOutcome;
  cleanSheetHome: MarketOutcome;
  cleanSheetAway: MarketOutcome;
  winToNilHome: MarketOutcome;
  winToNilAway: MarketOutcome;
  goalRanges: { label: "0-1" | "2-3" | "4+"; outcome: MarketOutcome }[];
}

export type ConfidenceLevel = "alta" | "media" | "baja";

export interface ConfidenceInfo {
  level: ConfidenceLevel;
  homeSampleSize: number;
  awaySampleSize: number;
  dataAgeHours: number | null;
  warnings: string[];
}

export interface RecentFormEntry {
  opponent: string;
  result: "V" | "E" | "D"; // Victoria / Empate / Derrota
  goalsFor: number;
  goalsAgainst: number;
  utcDate: string;
}

export interface TeamRecentForm {
  teamId: number;
  teamName: string;
  overall: RecentFormEntry[];
  venue: RecentFormEntry[];
  venueLabel: "home" | "away";
}

export interface TeamComparativeStats {
  teamId: number;
  teamName: string;
  matchesAnalyzed: number;
  avgGoalsScored: number;
  avgGoalsConceded: number;
  wins: number;
  draws: number;
  losses: number;
  bttsPct: number;
  over25Pct: number;
}

export interface EnrichedMatchPrediction extends MatchPrediction {
  summary: PredictionSummary;
  derivedMarkets: DerivedMarkets;
  confidence: ConfidenceInfo;
  recentForm: { home: TeamRecentForm; away: TeamRecentForm };
  comparative: { home: TeamComparativeStats; away: TeamComparativeStats };
}
