import { prisma } from "@/lib/db";
import { getUpcomingMatches, FootballDataError } from "@/lib/footballData/client";
import { getCompetitionInfo } from "@/lib/footballData/competitions";

const TTL_MS = 6 * 60 * 60 * 1000; // same cadence as standingsCache, independent column

export interface FixtureRow {
  id: number;
  utcDate: Date;
  matchday: number | null;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamCrest: string | null;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamCrest: string | null;
}

export async function ensureFreshFixtures(
  code: string,
  opts: { forceRefresh?: boolean } = {}
): Promise<FixtureRow[]> {
  const info = getCompetitionInfo(code);
  if (!info) throw new Error(`Unknown competition code: ${code}`);
  if (!info.hasHomeAway) return []; // no fixtures UI for group-stage competitions

  const existing = await prisma.competition.findUnique({ where: { code } });
  const isStale = !existing?.fixturesFetchedAt || Date.now() - existing.fixturesFetchedAt.getTime() > TTL_MS;

  if (isStale || opts.forceRefresh) {
    await refreshFixturesFromApi(code);
  }

  return readFixturesFromDb(code);
}

async function refreshFixturesFromApi(code: string): Promise<void> {
  let data;
  try {
    data = await getUpcomingMatches(code);
  } catch (err) {
    const hasCache = await prisma.competition.findUnique({ where: { code } });
    if (hasCache?.fixturesFetchedAt) return; // serve stale on transient failure
    throw err;
  }

  const seenIds = data.matches.map((m) => m.id);

  await prisma.$transaction([
    prisma.competition.upsert({
      where: { code },
      create: { code, name: getCompetitionInfo(code)!.name, fixturesFetchedAt: new Date() },
      update: { fixturesFetchedAt: new Date() },
    }),
    ...data.matches.map((m) =>
      prisma.fixture.upsert({
        where: { id: m.id },
        create: {
          id: m.id,
          competitionCode: code,
          utcDate: new Date(m.utcDate),
          matchday: m.matchday,
          homeTeamId: m.homeTeam.id,
          homeTeamName: m.homeTeam.name,
          homeTeamCrest: m.homeTeam.crest ?? null,
          awayTeamId: m.awayTeam.id,
          awayTeamName: m.awayTeam.name,
          awayTeamCrest: m.awayTeam.crest ?? null,
        },
        update: {
          utcDate: new Date(m.utcDate),
          matchday: m.matchday,
          homeTeamName: m.homeTeam.name,
          homeTeamCrest: m.homeTeam.crest ?? null,
          awayTeamName: m.awayTeam.name,
          awayTeamCrest: m.awayTeam.crest ?? null,
        },
      })
    ),
    prisma.fixture.deleteMany({ where: { competitionCode: code, id: { notIn: seenIds.length > 0 ? seenIds : [-1] } } }),
  ]);
}

async function readFixturesFromDb(code: string): Promise<FixtureRow[]> {
  return prisma.fixture.findMany({
    where: { competitionCode: code },
    orderBy: { utcDate: "asc" },
  });
}

export { FootballDataError };
