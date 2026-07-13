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
