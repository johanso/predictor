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

/** Attack/defense factors for one team, relative to the league averages. */
export function computeTeamFactors(team: TeamGoalStats, leagueAvg: LeagueAverages): TeamFactors {
  const avgGoalsScoredHome = team.goalsForHome / team.playedHome;
  const avgGoalsConcededHome = team.goalsAgainstHome / team.playedHome;
  const avgGoalsScoredAway = team.goalsForAway / team.playedAway;
  const avgGoalsConcededAway = team.goalsAgainstAway / team.playedAway;

  return {
    teamId: team.teamId,
    teamName: team.teamName,
    avgGoalsScoredHome,
    avgGoalsConcededHome,
    avgGoalsScoredAway,
    avgGoalsConcededAway,
    defenseFactorHome: avgGoalsConcededHome / leagueAvg.avgGoalsConcededHome,
    defenseFactorAway: avgGoalsConcededAway / leagueAvg.avgGoalsConcededAway,
  };
}
