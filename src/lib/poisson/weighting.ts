// Recency-weighted goal aggregation, pure/no I/O like the rest of poisson/.
// A match's weight decays exponentially with age relative to a reference date
// (the caller passes the most recent match's date, not wall-clock now(), so
// results stay reproducible between a fetch and a later prediction call).

export interface WeightedMatchInput {
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number;
  awayGoals: number;
  utcDate: Date;
}

export interface WeightedTeamAgg {
  teamId: number;
  playedHome: number; // sum of weights, not an integer count
  goalsForHome: number; // weight-scaled goals
  goalsAgainstHome: number;
  playedAway: number;
  goalsForAway: number;
  goalsAgainstAway: number;
}

export const DEFAULT_HALF_LIFE_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function decayWeight(matchDate: Date, referenceDate: Date, halfLifeDays: number): number {
  const ageDays = (referenceDate.getTime() - matchDate.getTime()) / MS_PER_DAY;
  const clampedAge = Math.max(0, ageDays); // guard a match dated after referenceDate (clock skew)
  return Math.pow(0.5, clampedAge / halfLifeDays);
}

export function computeWeightedTeamGoalStats(
  matches: WeightedMatchInput[],
  referenceDate: Date,
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS
): Map<number, WeightedTeamAgg> {
  const byTeam = new Map<number, WeightedTeamAgg>();

  function getOrCreate(id: number): WeightedTeamAgg {
    let entry = byTeam.get(id);
    if (!entry) {
      entry = {
        teamId: id,
        playedHome: 0,
        goalsForHome: 0,
        goalsAgainstHome: 0,
        playedAway: 0,
        goalsForAway: 0,
        goalsAgainstAway: 0,
      };
      byTeam.set(id, entry);
    }
    return entry;
  }

  for (const m of matches) {
    const w = decayWeight(m.utcDate, referenceDate, halfLifeDays);
    const home = getOrCreate(m.homeTeamId);
    const away = getOrCreate(m.awayTeamId);

    home.playedHome += w;
    home.goalsForHome += m.homeGoals * w;
    home.goalsAgainstHome += m.awayGoals * w;

    away.playedAway += w;
    away.goalsForAway += m.awayGoals * w;
    away.goalsAgainstAway += m.homeGoals * w;
  }

  return byTeam;
}
