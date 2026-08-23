import type { LeagueAverages, TeamFactors, TeamGoalStats } from "@/types/domain";

/**
 * League averages are sum(goals) / sum(games played) across all teams —
 * mirrors the Excel `Estadistica!I23:L23` totals row, not an average of averages.
 */
export function computeLeagueAverages(teams: TeamGoalStats[]): LeagueAverages {
  const totals = teams.reduce(
    (acc, t) => ({
      playedHome: acc.playedHome + t.playedHome,
      goalsForHome: acc.goalsForHome + t.goalsForHome,
      goalsAgainstHome: acc.goalsAgainstHome + t.goalsAgainstHome,
      playedAway: acc.playedAway + t.playedAway,
      goalsForAway: acc.goalsForAway + t.goalsForAway,
      goalsAgainstAway: acc.goalsAgainstAway + t.goalsAgainstAway,
    }),
    {
      playedHome: 0,
      goalsForHome: 0,
      goalsAgainstHome: 0,
      playedAway: 0,
      goalsForAway: 0,
      goalsAgainstAway: 0,
    }
  );

  return {
    avgGoalsScoredHome: totals.goalsForHome / totals.playedHome,
    avgGoalsConcededHome: totals.goalsAgainstHome / totals.playedHome,
    avgGoalsScoredAway: totals.goalsForAway / totals.playedAway,
    avgGoalsConcededAway: totals.goalsAgainstAway / totals.playedAway,
  };
}

// Empirical-Bayes shrinkage: blends a team's raw per-game rate with the league
// average, weighted by matches played. With 0 games the result is exactly the
// league average (factor 1.0); by ~20+ games the prior contributes <15% and the
// team's real rate dominates. Tames small-sample noise (e.g. a newly-promoted
// team's first 2-3 matches) without needing a separate "not enough data" path —
// the confidence badge (src/lib/poisson/confidence.ts) still warns separately
// based on raw match counts, this just keeps the point estimate itself sane.
export const SHRINKAGE_PSEUDO_MATCHES = 4;

function shrinkRate(teamGoals: number, teamPlayed: number, leagueAvgPerGame: number, pseudoMatches = SHRINKAGE_PSEUDO_MATCHES): number {
  return (teamGoals + pseudoMatches * leagueAvgPerGame) / (teamPlayed + pseudoMatches);
}

/**
 * Attack/defense factors for one team, relative to the league averages —
 * both sides normalized symmetrically (a team's attack matters relative to how
 * high-scoring its league is, exactly like its defense already does), and each
 * underlying rate is shrunk toward the league average per SHRINKAGE_PSEUDO_MATCHES.
 */
export function computeTeamFactors(team: TeamGoalStats, leagueAvg: LeagueAverages): TeamFactors {
  const avgGoalsScoredHome = shrinkRate(team.goalsForHome, team.playedHome, leagueAvg.avgGoalsScoredHome);
  const avgGoalsConcededHome = shrinkRate(team.goalsAgainstHome, team.playedHome, leagueAvg.avgGoalsConcededHome);
  const avgGoalsScoredAway = shrinkRate(team.goalsForAway, team.playedAway, leagueAvg.avgGoalsScoredAway);
  const avgGoalsConcededAway = shrinkRate(team.goalsAgainstAway, team.playedAway, leagueAvg.avgGoalsConcededAway);

  return {
    teamId: team.teamId,
    teamName: team.teamName,
    avgGoalsScoredHome,
    avgGoalsConcededHome,
    avgGoalsScoredAway,
    avgGoalsConcededAway,
    attackFactorHome: avgGoalsScoredHome / leagueAvg.avgGoalsScoredHome,
    attackFactorAway: avgGoalsScoredAway / leagueAvg.avgGoalsScoredAway,
    defenseFactorHome: avgGoalsConcededHome / leagueAvg.avgGoalsConcededHome,
    defenseFactorAway: avgGoalsConcededAway / leagueAvg.avgGoalsConcededAway,
  };
}
