import { prisma } from "@/lib/db";
import { getFinishedMatches, FootballDataError } from "@/lib/footballData/client";
import { getCompetitionInfo } from "@/lib/footballData/competitions";
import type { FdMatch } from "@/lib/footballData/types";
import type { TeamGoalStats } from "@/types/domain";

const TTL_MS = 6 * 60 * 60 * 1000; // refetch at most every 6h
const MIN_REFRESH_INTERVAL_MS = 60 * 1000; // guard against rapid "Refresh" clicks

export interface LeagueStandingsResult {
  code: string;
  name: string;
  hasHomeAway: boolean;
  season: number | null;
  fetchedAt: Date | null;
  seasonStarted: boolean; // false when no finished matches yet
  teams: TeamGoalStats[];
}

export async function ensureFreshStandings(
  code: string,
  opts: { forceRefresh?: boolean } = {}
): Promise<LeagueStandingsResult> {
  const info = getCompetitionInfo(code);
  if (!info) throw new Error(`Unknown competition code: ${code}`);

  const existing = await prisma.competition.findUnique({ where: { code } });
  const isStale = !existing?.fetchedAt || Date.now() - existing.fetchedAt.getTime() > TTL_MS;
  const canForceRefresh =
    !existing?.fetchedAt || Date.now() - existing.fetchedAt.getTime() > MIN_REFRESH_INTERVAL_MS;

  if (isStale || (opts.forceRefresh && canForceRefresh)) {
    await refreshFromApi(code, info.name, info.hasHomeAway);
  }

  return readFromDb(code);
}

async function readFromDb(code: string): Promise<LeagueStandingsResult> {
  const result = await prisma.competition.findUnique({
    where: { code },
    include: { teams: { include: { standing: true } } },
  });

  if (!result) {
    throw new Error(`No cached data for competition ${code} — the initial fetch must have failed.`);
  }

  const teams: TeamGoalStats[] = result.teams
    .filter((t) => t.standing)
    .map((t) => ({
      teamId: t.id,
      teamName: t.name,
      playedHome: t.standing!.playedHome,
      goalsForHome: t.standing!.goalsForHome,
      goalsAgainstHome: t.standing!.goalsAgainstHome,
      playedAway: t.standing!.playedAway,
      goalsForAway: t.standing!.goalsForAway,
      goalsAgainstAway: t.standing!.goalsAgainstAway,
    }));

  const seasonStarted = teams.some((t) => t.playedHome > 0 || t.playedAway > 0);

  return {
    code: result.code,
    name: result.name,
    hasHomeAway: result.hasHomeAway,
    season: result.season,
    fetchedAt: result.fetchedAt,
    seasonStarted,
    teams,
  };
}

interface AggregatedTeam {
  id: number;
  name: string;
  crest: string | null;
  playedHome: number;
  goalsForHome: number;
  goalsAgainstHome: number;
  playedAway: number;
  goalsForAway: number;
  goalsAgainstAway: number;
  won: number;
  draw: number;
  lost: number;
}

function aggregateFromMatches(matches: FdMatch[]): Map<number, AggregatedTeam> {
  const byTeam = new Map<number, AggregatedTeam>();

  function getOrCreate(id: number, name: string, crest: string | null): AggregatedTeam {
    let entry = byTeam.get(id);
    if (!entry) {
      entry = {
        id,
        name,
        crest,
        playedHome: 0,
        goalsForHome: 0,
        goalsAgainstHome: 0,
        playedAway: 0,
        goalsForAway: 0,
        goalsAgainstAway: 0,
        won: 0,
        draw: 0,
        lost: 0,
      };
      byTeam.set(id, entry);
    }
    return entry;
  }

  for (const match of matches) {
    const homeGoals = match.score.fullTime.home;
    const awayGoals = match.score.fullTime.away;
    if (homeGoals === null || awayGoals === null) continue; // incomplete score, skip

    const home = getOrCreate(match.homeTeam.id, match.homeTeam.name, match.homeTeam.crest ?? null);
    const away = getOrCreate(match.awayTeam.id, match.awayTeam.name, match.awayTeam.crest ?? null);

    home.playedHome += 1;
    home.goalsForHome += homeGoals;
    home.goalsAgainstHome += awayGoals;

    away.playedAway += 1;
    away.goalsForAway += awayGoals;
    away.goalsAgainstAway += homeGoals;

    if (match.score.winner === "HOME_TEAM") {
      home.won += 1;
      away.lost += 1;
    } else if (match.score.winner === "AWAY_TEAM") {
      away.won += 1;
      home.lost += 1;
    } else {
      home.draw += 1;
      away.draw += 1;
    }
  }

  return byTeam;
}

async function refreshFromApi(code: string, name: string, hasHomeAway: boolean): Promise<void> {
  if (!hasHomeAway) {
    await prisma.competition.upsert({
      where: { code },
      create: { code, name, hasHomeAway: false, fetchedAt: new Date() },
      update: { name, hasHomeAway: false, fetchedAt: new Date() },
    });
    return;
  }

  let data;
  try {
    data = await getFinishedMatches(code);
  } catch (err) {
    // If we already have a cached snapshot, prefer serving stale data over
    // surfacing a hard error (e.g. transient network issue, rate limit).
    const hasCache = await prisma.competition.findUnique({ where: { code } });
    if (hasCache) return;
    throw err;
  }

  const season = data.season?.startDate ? new Date(data.season.startDate).getFullYear() : null;
  const byTeam = aggregateFromMatches(data.matches);

  await prisma.$transaction([
    prisma.competition.upsert({
      where: { code },
      create: { code, name, season, hasHomeAway: true, fetchedAt: new Date() },
      update: { name, season, hasHomeAway: true, fetchedAt: new Date() },
    }),
    ...[...byTeam.values()].flatMap((t) => [
      prisma.team.upsert({
        where: { id: t.id },
        create: { id: t.id, name: t.name, crestUrl: t.crest, competitionCode: code },
        update: { name: t.name, crestUrl: t.crest, competitionCode: code },
      }),
      prisma.teamStanding.upsert({
        where: { teamId: t.id },
        create: {
          teamId: t.id,
          playedHome: t.playedHome,
          goalsForHome: t.goalsForHome,
          goalsAgainstHome: t.goalsAgainstHome,
          playedAway: t.playedAway,
          goalsForAway: t.goalsForAway,
          goalsAgainstAway: t.goalsAgainstAway,
          playedTotal: t.playedHome + t.playedAway,
          wonTotal: t.won,
          drawTotal: t.draw,
          lostTotal: t.lost,
          pointsTotal: t.won * 3 + t.draw,
        },
        update: {
          playedHome: t.playedHome,
          goalsForHome: t.goalsForHome,
          goalsAgainstHome: t.goalsAgainstHome,
          playedAway: t.playedAway,
          goalsForAway: t.goalsForAway,
          goalsAgainstAway: t.goalsAgainstAway,
          playedTotal: t.playedHome + t.playedAway,
          wonTotal: t.won,
          drawTotal: t.draw,
          lostTotal: t.lost,
          pointsTotal: t.won * 3 + t.draw,
          fetchedAt: new Date(),
        },
      }),
    ]),
  ]);
}

export { FootballDataError };
