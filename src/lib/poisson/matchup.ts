import type { LeagueAverages, TeamFactors } from "@/types/domain";

/**
 * Expected goals for a specific matchup, both sides normalized symmetrically
 * against the league baseline (Maher 1982-style):
 *   λ_home = league avg home goals × home team's attack strength × away team's road defensive weakness
 *   λ_away = league avg away goals × away team's attack strength × home team's home defensive weakness
 * Deliberately does not reproduce the original reference spreadsheet's numbers —
 * that version left attack unnormalized (only defense was relative to league
 * average), which let attack strength be inflated by a high-scoring league.
 */
export function computeLambdas(
  homeFactors: TeamFactors,
  awayFactors: TeamFactors,
  leagueAvg: LeagueAverages
): { lambdaHome: number; lambdaAway: number } {
  return {
    lambdaHome: leagueAvg.avgGoalsScoredHome * homeFactors.attackFactorHome * awayFactors.defenseFactorAway,
    lambdaAway: leagueAvg.avgGoalsScoredAway * awayFactors.attackFactorAway * homeFactors.defenseFactorHome,
  };
}
