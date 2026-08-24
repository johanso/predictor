import { prisma } from "@/lib/db";
import { getFinishedMatches, FootballDataError } from "@/lib/footballData/client";
import { getCompetitionInfo } from "@/lib/footballData/competitions";
import type { FdMatch } from "@/lib/footballData/types";
import { computeWeightedTeamGoalStats, DEFAULT_HALF_LIFE_DAYS } from "@/lib/poisson/weighting";
import { getFormStringsForCompetition } from "@/lib/cache/formCache";
import { evaluatePrediction } from "@/lib/predictions/evaluate";
import { settleBet, type BetMarket } from "@/lib/betting/settle";
import type { TeamGoalStats } from "@/types/domain";

const TTL_MS = 6 * 60 * 60 * 1000; // refetch at most every 6h
const MIN_REFRESH_INTERVAL_MS = 60 * 1000; // guard against rapid "Refresh" clicks
const CORRECTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // how far back a stored score is still rewritten

export interface StandingsRow {
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
  form: string; // e.g. "VVEDD", most recent first, up to last 5; "" if no matches cached yet
}

export interface LeagueStandingsResult {
  code: string;
  name: string;
  hasHomeAway: boolean;
  season: number | null;
  fetchedAt: Date | null;
  seasonStarted: boolean; // false when no finished matches yet
  teams: TeamGoalStats[];
  table: StandingsRow[]; // sorted for display: points desc, then goal difference, then goals for
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
  const formByTeam = await getFormStringsForCompetition(code);

  const table: StandingsRow[] = result.teams
    .filter((t) => t.standing)
    .map((t) => {
      const s = t.standing!;
      const goalsFor = s.goalsForHome + s.goalsForAway;
      const goalsAgainst = s.goalsAgainstHome + s.goalsAgainstAway;
      return {
        teamId: t.id,
        teamName: t.name,
        crestUrl: t.crestUrl,
        played: s.playedTotal,
        won: s.wonTotal,
        draw: s.drawTotal,
        lost: s.lostTotal,
        goalsFor,
        goalsAgainst,
        goalDifference: goalsFor - goalsAgainst,
        points: s.pointsTotal,
        form: formByTeam.get(t.id) ?? "",
      };
    })
    .sort(
      (a, b) =>
        b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.teamName.localeCompare(b.teamName)
    );

  return {
    code: result.code,
    name: result.name,
    hasHomeAway: result.hasHomeAway,
    season: result.season,
    fetchedAt: result.fetchedAt,
    seasonStarted,
    teams,
    table,
  };
}

/**
 * Recency-weighted team stats for prediction, read from the raw Match cache
 * (see refreshFromApi below). Falls back to the unweighted snapshot if Match
 * hasn't been backfilled yet for this competition (e.g. right after this
 * feature ships, before the next TTL-triggered or manual refresh runs).
 */
export async function getWeightedTeamStats(
  code: string,
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS
): Promise<TeamGoalStats[]> {
  const [matches, teams] = await Promise.all([
    prisma.match.findMany({ where: { competitionCode: code } }),
    prisma.team.findMany({ where: { competitionCode: code } }),
  ]);

  if (matches.length === 0) {
    return (await readFromDb(code)).teams;
  }

  const referenceDate = matches.reduce((max, m) => (m.utcDate > max ? m.utcDate : max), matches[0].utcDate);
  const weighted = computeWeightedTeamGoalStats(
    matches.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
      utcDate: m.utcDate,
    })),
    referenceDate,
    halfLifeDays
  );

  return teams.map((t) => {
    const w = weighted.get(t.id);
    return {
      teamId: t.id,
      teamName: t.name,
      playedHome: w?.playedHome ?? 0,
      goalsForHome: w?.goalsForHome ?? 0,
      goalsAgainstHome: w?.goalsAgainstHome ?? 0,
      playedAway: w?.playedAway ?? 0,
      goalsForAway: w?.goalsForAway ?? 0,
      goalsAgainstAway: w?.goalsAgainstAway ?? 0,
    };
  });
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
  const completedMatches = data.matches.filter((m) => m.score.fullTime.home !== null && m.score.fullTime.away !== null);
  // The window in which upstream might still amend a scoreline. Everything older is
  // inserted once and never touched again — see the transaction below.
  const correctionWindow = Date.now() - CORRECTION_WINDOW_MS;
  const recentMatches = completedMatches.filter((m) => new Date(m.utcDate).getTime() >= correctionWindow);

  // Opportunistic evaluation: piggybacks on this same fetch, no extra API calls. A
  // tracked prediction gets evaluated the next time this competition's cache refreshes
  // after its match has been played — see src/lib/predictions/evaluate.ts.
  const pendingPredictions = await prisma.prediction.findMany({ where: { competitionCode: code, evaluatedAt: null } });
  const evaluationOps = pendingPredictions.flatMap((pred) => {
    const match = completedMatches.find(
      (m) => m.homeTeam.id === pred.homeTeamId && m.awayTeam.id === pred.awayTeamId && new Date(m.utcDate) > pred.createdAt
    );
    if (!match) return [];
    const actualHomeGoals = match.score.fullTime.home!;
    const actualAwayGoals = match.score.fullTime.away!;
    const evalFields = evaluatePrediction(
      {
        favorite: pred.favorite as "home" | "draw" | "away",
        bttsYesProbability: pred.bttsYesProbability,
        over25Probability: pred.over25Probability,
        predictedHomeGoals: pred.predictedHomeGoals,
        predictedAwayGoals: pred.predictedAwayGoals,
        lambdaHome: pred.lambdaHome,
        lambdaAway: pred.lambdaAway,
      },
      actualHomeGoals,
      actualAwayGoals
    );
    return [
      prisma.prediction.update({
        where: { id: pred.id },
        data: { evaluatedAt: new Date(), actualHomeGoals, actualAwayGoals, ...evalFields },
      }),
    ];
  });

  // Same opportunistic pattern for real user bets — see src/lib/betting/settle.ts.
  // Matched by (teams, matchUtcDate) with a tolerance window rather than "any match
  // after createdAt", since a Bet already points at one specific scheduled fixture.
  // isManual excluded on purpose: a manual bet may be another sport entirely, and
  // even when it is football it carries no football-data team ids to match on. Those
  // are closed by hand from the bets page.
  //
  // Deliberately NOT filtered by accountId. A match result is the same fact for every
  // bookmaker account, one API response settles all of them at once for free, and this
  // refresh has no session to scope to anyway. Scoping it would leave a bet pending
  // until its own account happened to be logged in during a refresh — intermittent,
  // invisible staleness that would take weeks to notice.
  const pendingBets = await prisma.bet.findMany({
    where: { competitionCode: code, status: "pending", isManual: false },
  });
  const betSettleOps = pendingBets.flatMap((bet) => {
    const match = completedMatches.find(
      (m) =>
        m.homeTeam.id === bet.homeTeamId &&
        m.awayTeam.id === bet.awayTeamId &&
        Math.abs(new Date(m.utcDate).getTime() - bet.matchUtcDate.getTime()) < 3 * 24 * 60 * 60 * 1000
    );
    if (!match) return [];
    const actualHomeGoals = match.score.fullTime.home!;
    const actualAwayGoals = match.score.fullTime.away!;
    const { won, profit } = settleBet(bet.market as BetMarket, bet.odds, bet.stake, actualHomeGoals, actualAwayGoals);
    return [
      prisma.bet.update({
        where: { id: bet.id },
        data: { status: won ? "won" : "lost", settledAt: new Date(), actualHomeGoals, actualAwayGoals, profit },
      }),
    ];
  });

  await prisma.$transaction([
    ...evaluationOps,
    ...betSettleOps,
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
    // One statement for the whole season instead of one upsert per match. A finished
    // Match is immutable (see the model comment), so anything already stored is
    // already right and skipDuplicates can drop it. This used to be ~380 upserts,
    // which was free against a local SQLite file and is ~380 network round trips
    // against a hosted Postgres — enough to blow the transaction timeout on its own.
    prisma.match.createMany({
      data: completedMatches.map((m) => ({
        id: m.id,
        competitionCode: code,
        utcDate: new Date(m.utcDate),
        homeTeamId: m.homeTeam.id,
        awayTeamId: m.awayTeam.id,
        homeGoals: m.score.fullTime.home!,
        awayGoals: m.score.fullTime.away!,
        winner: m.score.winner,
      })),
      skipDuplicates: true,
    }),
    // "Immutable" holds in practice, not on the day upstream corrects a scoreline, so
    // recent matches still get written through. A handful of rows per refresh.
    ...recentMatches.map((m) =>
      prisma.match.update({
        where: { id: m.id },
        data: {
          utcDate: new Date(m.utcDate),
          homeGoals: m.score.fullTime.home!,
          awayGoals: m.score.fullTime.away!,
          winner: m.score.winner,
        },
      })
    ),
  ]);
}

export { FootballDataError };
