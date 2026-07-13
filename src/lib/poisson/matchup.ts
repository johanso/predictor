import type { TeamFactors } from "@/types/domain";

/**
 * Expected goals for a specific matchup:
 *   λ_home = avg goals scored at home by the home team × away team's road defensive weakness
 *   λ_away = avg goals scored on the road by the away team × home team's home defensive weakness
 * Matches Calculadora!B6 / D6 in the reference spreadsheet.
 */
export function computeLambdas(
  homeFactors: TeamFactors,
  awayFactors: TeamFactors
): { lambdaHome: number; lambdaAway: number } {
  return {
    lambdaHome: homeFactors.avgGoalsScoredHome * awayFactors.defenseFactorAway,
    lambdaAway: awayFactors.avgGoalsScoredAway * homeFactors.defenseFactorHome,
  };
}
