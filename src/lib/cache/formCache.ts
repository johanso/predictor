import { prisma } from "@/lib/db";
import type { RecentFormEntry, TeamComparativeStats, TeamRecentForm } from "@/types/domain";

// Reads only — freshness of the Match rows themselves is owned by
// standingsCache.ts's TTL refresh; this module never fetches from the API.

export interface MatchResultRow {
  opponentId: number;
  opponentName: string;
  goalsFor: number;
  goalsAgainst: number;
  result: "V" | "E" | "D"; // Victoria / Empate / Derrota
  utcDate: Date;
  venue: "home" | "away";
}

interface RawMatchWithNames {
  utcDate: Date;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number;
  awayGoals: number;
  homeTeamName: string;
  awayTeamName: string;
}

function toResultRow(m: RawMatchWithNames, teamId: number): MatchResultRow {
  const isHome = m.homeTeamId === teamId;
  const goalsFor = isHome ? m.homeGoals : m.awayGoals;
  const goalsAgainst = isHome ? m.awayGoals : m.homeGoals;
  const result: "V" | "E" | "D" = goalsFor > goalsAgainst ? "V" : goalsFor < goalsAgainst ? "D" : "E";
  return {
    opponentId: isHome ? m.awayTeamId : m.homeTeamId,
    opponentName: isHome ? m.awayTeamName : m.homeTeamName,
    goalsFor,
    goalsAgainst,
    result,
    utcDate: m.utcDate,
    venue: isHome ? "home" : "away",
  };
}

interface MatchWhere {
  competitionCode: string;
  homeTeamId?: number;
  awayTeamId?: number;
  OR?: ({ homeTeamId: number } | { awayTeamId: number })[];
}

async function findMatchesWithNames(where: MatchWhere, take?: number): Promise<RawMatchWithNames[]> {
  const matches = await prisma.match.findMany({
    where,
    orderBy: { utcDate: "desc" },
    take,
  });
  if (matches.length === 0) return [];

  const teamIds = [...new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
  const teams = await prisma.team.findMany({ where: { id: { in: teamIds } } });
  const nameById = new Map(teams.map((t) => [t.id, t.name]));

  return matches.map((m) => ({
    utcDate: m.utcDate,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    homeTeamName: nameById.get(m.homeTeamId) ?? "?",
    awayTeamName: nameById.get(m.awayTeamId) ?? "?",
  }));
}

export async function getRecentMatches(
  teamId: number,
  competitionCode: string,
  opts: { venue?: "home" | "away"; limit?: number } = {}
): Promise<MatchResultRow[]> {
  const limit = opts.limit ?? 5;
  const where =
    opts.venue === "home"
      ? { competitionCode, homeTeamId: teamId }
      : opts.venue === "away"
        ? { competitionCode, awayTeamId: teamId }
        : { competitionCode, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] };

  const matches = await findMatchesWithNames(where, limit);
  return matches.map((m) => toResultRow(m, teamId));
}

function toEntry(row: MatchResultRow): RecentFormEntry {
  return {
    opponent: row.opponentName,
    result: row.result,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    utcDate: row.utcDate.toISOString(),
  };
}

export async function getTeamRecentForm(
  teamId: number,
  teamName: string,
  competitionCode: string,
  venue: "home" | "away"
): Promise<TeamRecentForm> {
  const [overall, venueMatches] = await Promise.all([
    getRecentMatches(teamId, competitionCode, { limit: 5 }),
    getRecentMatches(teamId, competitionCode, { venue, limit: 5 }),
  ]);

  return {
    teamId,
    teamName,
    overall: overall.map(toEntry),
    venue: venueMatches.map(toEntry),
    venueLabel: venue,
  };
}

export async function getTeamComparativeStats(
  teamId: number,
  teamName: string,
  competitionCode: string
): Promise<TeamComparativeStats> {
  const matches = await findMatchesWithNames({
    competitionCode,
    OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
  });

  const rows = matches.map((m) => toResultRow(m, teamId));
  const matchesAnalyzed = rows.length;

  if (matchesAnalyzed === 0) {
    return {
      teamId,
      teamName,
      matchesAnalyzed: 0,
      avgGoalsScored: 0,
      avgGoalsConceded: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      bttsPct: 0,
      over25Pct: 0,
    };
  }

  const wins = rows.filter((r) => r.result === "V").length;
  const draws = rows.filter((r) => r.result === "E").length;
  const losses = rows.filter((r) => r.result === "D").length;
  const goalsScored = rows.reduce((s, r) => s + r.goalsFor, 0);
  const goalsConceded = rows.reduce((s, r) => s + r.goalsAgainst, 0);
  const bttsCount = rows.filter((r) => r.goalsFor > 0 && r.goalsAgainst > 0).length;
  const over25Count = rows.filter((r) => r.goalsFor + r.goalsAgainst > 2).length;

  return {
    teamId,
    teamName,
    matchesAnalyzed,
    avgGoalsScored: goalsScored / matchesAnalyzed,
    avgGoalsConceded: goalsConceded / matchesAnalyzed,
    wins,
    draws,
    losses,
    bttsPct: bttsCount / matchesAnalyzed,
    over25Pct: over25Count / matchesAnalyzed,
  };
}

/**
 * Batched V/E/D form string (most recent first, e.g. "VVEDD") for every team in a
 * competition — one query, avoids N+1 in the standings table. `venue` restricts
 * which side of each match counts toward a team's form (for the Local/Visitante
 * ranking tabs); omitted means "any venue" (the General tab).
 */
export async function getFormStringsForCompetition(competitionCode: string, venue?: "home" | "away"): Promise<Map<number, string>> {
  const matches = await prisma.match.findMany({
    where: { competitionCode },
    orderBy: { utcDate: "desc" },
  });

  const byTeam = new Map<number, ("V" | "E" | "D")[]>();
  for (const m of matches) {
    const teamIds = venue === "home" ? [m.homeTeamId] : venue === "away" ? [m.awayTeamId] : [m.homeTeamId, m.awayTeamId];
    for (const teamId of teamIds) {
      const list = byTeam.get(teamId) ?? [];
      if (list.length >= 5) continue;
      const isHome = m.homeTeamId === teamId;
      const goalsFor = isHome ? m.homeGoals : m.awayGoals;
      const goalsAgainst = isHome ? m.awayGoals : m.homeGoals;
      const letter: "V" | "E" | "D" = goalsFor > goalsAgainst ? "V" : goalsFor < goalsAgainst ? "D" : "E";
      list.push(letter);
      byTeam.set(teamId, list);
    }
  }

  return new Map([...byTeam.entries()].map(([teamId, letters]) => [teamId, letters.join("")]));
}

export interface VenueStandingsRow {
  teamId: number;
  teamName: string;
  crestUrl: string | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string;
}

/** Mini-league table counting only a team's home (or away) matches — ranked by points earned in that venue alone. */
export async function getVenueStandings(competitionCode: string, venue: "home" | "away"): Promise<VenueStandingsRow[]> {
  const [matches, teams, formByTeam] = await Promise.all([
    prisma.match.findMany({ where: { competitionCode } }),
    prisma.team.findMany({ where: { competitionCode } }),
    getFormStringsForCompetition(competitionCode, venue),
  ]);

  interface Agg {
    played: number;
    won: number;
    draw: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
  }
  const byTeam = new Map<number, Agg>();
  function getOrCreate(id: number): Agg {
    let agg = byTeam.get(id);
    if (!agg) {
      agg = { played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
      byTeam.set(id, agg);
    }
    return agg;
  }

  for (const m of matches) {
    const teamId = venue === "home" ? m.homeTeamId : m.awayTeamId;
    const goalsFor = venue === "home" ? m.homeGoals : m.awayGoals;
    const goalsAgainst = venue === "home" ? m.awayGoals : m.homeGoals;
    const agg = getOrCreate(teamId);
    agg.played += 1;
    agg.goalsFor += goalsFor;
    agg.goalsAgainst += goalsAgainst;
    if (goalsFor > goalsAgainst) agg.won += 1;
    else if (goalsFor < goalsAgainst) agg.lost += 1;
    else agg.draw += 1;
  }

  return teams
    .map((t) => {
      const agg = byTeam.get(t.id) ?? { played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
      const goalDifference = agg.goalsFor - agg.goalsAgainst;
      return {
        teamId: t.id,
        teamName: t.name,
        crestUrl: t.crestUrl,
        played: agg.played,
        won: agg.won,
        draw: agg.draw,
        lost: agg.lost,
        goalsFor: agg.goalsFor,
        goalsAgainst: agg.goalsAgainst,
        goalDifference,
        points: agg.won * 3 + agg.draw,
        form: formByTeam.get(t.id) ?? "",
      };
    })
    .sort(
      (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName)
    );
}

export interface SeasonRecordEntry {
  teamId: number;
  teamName: string;
  crestUrl: string | null;
  value: number;
}

export interface SeasonRecords {
  topScorer: SeasonRecordEntry | null; // most goals scored, total
  bestDefense: SeasonRecordEntry | null; // fewest goals conceded, total (qualifying teams only)
  mostBtts: SeasonRecordEntry | null; // highest % of matches with both teams scoring (qualifying teams only)
  longestUnbeatenStreak: SeasonRecordEntry | null; // current run of matches without a loss, most recent backward
}

// A team needs at least this many matches played before it's eligible for the
// "best defense" / "most BTTS" boards — otherwise a team with 1-2 matches can
// top the board on a fluke, which isn't a meaningful "record" yet.
const MIN_QUALIFYING_MATCHES = 5;

/** Season-wide trivia/leaderboard cards for a competition, computed from the cached Match table — one query, no API calls. */
export async function getSeasonRecords(competitionCode: string): Promise<SeasonRecords> {
  const [matches, teams] = await Promise.all([
    prisma.match.findMany({ where: { competitionCode }, orderBy: { utcDate: "desc" } }),
    prisma.team.findMany({ where: { competitionCode } }),
  ]);

  interface Agg {
    played: number;
    goalsFor: number;
    goalsAgainst: number;
    bttsCount: number;
    results: ("V" | "E" | "D")[]; // most recent first
  }
  const byTeam = new Map<number, Agg>();
  function getOrCreate(id: number): Agg {
    let agg = byTeam.get(id);
    if (!agg) {
      agg = { played: 0, goalsFor: 0, goalsAgainst: 0, bttsCount: 0, results: [] };
      byTeam.set(id, agg);
    }
    return agg;
  }

  for (const m of matches) {
    for (const isHome of [true, false]) {
      const teamId = isHome ? m.homeTeamId : m.awayTeamId;
      const goalsFor = isHome ? m.homeGoals : m.awayGoals;
      const goalsAgainst = isHome ? m.awayGoals : m.homeGoals;
      const agg = getOrCreate(teamId);
      agg.played += 1;
      agg.goalsFor += goalsFor;
      agg.goalsAgainst += goalsAgainst;
      if (goalsFor > 0 && goalsAgainst > 0) agg.bttsCount += 1;
      agg.results.push(goalsFor > goalsAgainst ? "V" : goalsFor < goalsAgainst ? "D" : "E");
    }
  }

  const nameById = new Map(teams.map((t) => [t.id, { name: t.name, crestUrl: t.crestUrl }]));
  const entries = [...byTeam.entries()].map(([teamId, agg]) => {
    const info = nameById.get(teamId);
    let unbeatenStreak = 0;
    for (const r of agg.results) {
      if (r === "D") break;
      unbeatenStreak += 1;
    }
    return {
      teamId,
      teamName: info?.name ?? "?",
      crestUrl: info?.crestUrl ?? null,
      played: agg.played,
      goalsFor: agg.goalsFor,
      goalsAgainst: agg.goalsAgainst,
      bttsPct: agg.played > 0 ? agg.bttsCount / agg.played : 0,
      unbeatenStreak,
    };
  });

  function top<T>(list: T[], value: (t: T) => number): T | null {
    if (list.length === 0) return null;
    return list.reduce((best, cur) => (value(cur) > value(best) ? cur : best));
  }

  const qualifying = entries.filter((e) => e.played >= MIN_QUALIFYING_MATCHES);

  const topScorerEntry = top(entries.filter((e) => e.played > 0), (e) => e.goalsFor);
  const bestDefenseEntry = top(qualifying, (e) => -e.goalsAgainst); // "highest" -goalsAgainst = fewest conceded
  const mostBttsEntry = top(qualifying, (e) => e.bttsPct);
  const longestStreakEntry = top(entries.filter((e) => e.played > 0), (e) => e.unbeatenStreak);

  const toRecord = (e: (typeof entries)[number] | null, value: number): SeasonRecordEntry | null =>
    e ? { teamId: e.teamId, teamName: e.teamName, crestUrl: e.crestUrl, value } : null;

  return {
    topScorer: toRecord(topScorerEntry, topScorerEntry?.goalsFor ?? 0),
    bestDefense: toRecord(bestDefenseEntry, bestDefenseEntry?.goalsAgainst ?? 0),
    mostBtts: toRecord(mostBttsEntry, mostBttsEntry?.bttsPct ?? 0),
    longestUnbeatenStreak: toRecord(longestStreakEntry, longestStreakEntry?.unbeatenStreak ?? 0),
  };
}

export async function getRawSampleSizes(
  homeTeamId: number,
  awayTeamId: number,
  competitionCode: string
): Promise<{ homeSampleSize: number; awaySampleSize: number }> {
  const [homeSampleSize, awaySampleSize] = await Promise.all([
    prisma.match.count({ where: { competitionCode, homeTeamId } }),
    prisma.match.count({ where: { competitionCode, awayTeamId } }),
  ]);
  return { homeSampleSize, awaySampleSize };
}
