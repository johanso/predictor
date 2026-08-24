export type BetMarket =
  | "home"
  | "draw"
  | "away"
  | "btts_yes"
  | "btts_no"
  | "over_1_5"
  | "under_1_5"
  | "over_2_5"
  | "under_2_5"
  | "double_1x"
  | "double_12"
  | "double_x2"
  | "home_scores"
  | "away_scores";

export const BET_MARKETS: { value: BetMarket; label: string }[] = [
  { value: "home", label: "Gana Local" },
  { value: "draw", label: "Empate" },
  { value: "away", label: "Gana Visitante" },
  { value: "btts_yes", label: "AEM: Sí" },
  { value: "btts_no", label: "AEM: No" },
  { value: "over_1_5", label: "Over 1.5" },
  { value: "under_1_5", label: "Under 1.5" },
  { value: "over_2_5", label: "Over 2.5" },
  { value: "under_2_5", label: "Under 2.5" },
  { value: "double_1x", label: "Doble oportunidad: 1X" },
  { value: "double_12", label: "Doble oportunidad: 12" },
  { value: "double_x2", label: "Doble oportunidad: X2" },
  { value: "home_scores", label: "Marca el local" },
  { value: "away_scores", label: "Marca el visitante" },
];

export function didMarketWin(market: BetMarket, actualHomeGoals: number, actualAwayGoals: number): boolean {
  const bothScored = actualHomeGoals > 0 && actualAwayGoals > 0;
  const totalGoals = actualHomeGoals + actualAwayGoals;
  switch (market) {
    case "home":
      return actualHomeGoals > actualAwayGoals;
    case "draw":
      return actualHomeGoals === actualAwayGoals;
    case "away":
      return actualHomeGoals < actualAwayGoals;
    case "btts_yes":
      return bothScored;
    case "btts_no":
      return !bothScored;
    case "over_1_5":
      return totalGoals > 1;
    case "under_1_5":
      return totalGoals <= 1;
    case "over_2_5":
      return totalGoals > 2;
    case "under_2_5":
      return totalGoals <= 2;
    case "double_1x":
      return actualHomeGoals >= actualAwayGoals;
    case "double_12":
      return actualHomeGoals !== actualAwayGoals;
    case "double_x2":
      return actualHomeGoals <= actualAwayGoals;
    case "home_scores":
      return actualHomeGoals > 0;
    case "away_scores":
      return actualAwayGoals > 0;
  }
}

export interface SettleResult {
  won: boolean;
  profit: number;
}

/**
 * Profit on a settled bet. Shared by automatic settlement and the manual close on the
 * bets page so the two can never disagree about what a win is worth — the bankroll is
 * built by summing this, and two formulas would eventually drift apart.
 */
export function profitFor(won: boolean, odds: number, stake: number): number {
  return won ? stake * (odds - 1) : -stake;
}

export function settleBet(
  market: BetMarket,
  odds: number,
  stake: number,
  actualHomeGoals: number,
  actualAwayGoals: number
): SettleResult {
  const won = didMarketWin(market, actualHomeGoals, actualAwayGoals);
  return { won, profit: profitFor(won, odds, stake) };
}
