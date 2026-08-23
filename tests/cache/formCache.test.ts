import { describe, it, expect, vi } from "vitest";

// formCache.ts only ever reads Match/Team via prisma — mock the client so
// these tests don't touch the real dev.db (freshness of that data is owned
// by standingsCache.ts's refresh flow, out of scope here).

interface FakeMatch {
  id: number;
  competitionCode: string;
  utcDate: Date;
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number;
  awayGoals: number;
}

interface FakeTeam {
  id: number;
  name: string;
}

const COMP = "TST";
const HOME_TEAM = { id: 1, name: "Home FC" };
const AWAY_TEAM = { id: 2, name: "Away FC" };
const OTHER_TEAM = { id: 3, name: "Other FC" };

const teams: FakeTeam[] = [HOME_TEAM, AWAY_TEAM, OTHER_TEAM];

// Home FC's matches, most recent last here (sorted desc at query time):
// day -1: Home 2-0 vs Other (home win)      -> Home's most recent match, at home
// day -3: Other 1-1 Home (away)             -> draw
// day -5: Home 0-1 vs Away (home, loss)     -> Home's most recent HOME match before day -1... (see below)
const day = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const matches: FakeMatch[] = [
  { id: 1, competitionCode: COMP, utcDate: day(1), homeTeamId: 1, awayTeamId: 3, homeGoals: 2, awayGoals: 0 },
  { id: 2, competitionCode: COMP, utcDate: day(3), homeTeamId: 3, awayTeamId: 1, homeGoals: 1, awayGoals: 1 },
  { id: 3, competitionCode: COMP, utcDate: day(5), homeTeamId: 1, awayTeamId: 2, homeGoals: 0, awayGoals: 1 },
  { id: 4, competitionCode: COMP, utcDate: day(7), homeTeamId: 2, awayTeamId: 3, homeGoals: 3, awayGoals: 3 },
  { id: 5, competitionCode: COMP, utcDate: day(9), homeTeamId: 1, awayTeamId: 3, homeGoals: 1, awayGoals: 0 },
];

function matchesWhere(m: FakeMatch, where: Record<string, unknown>): boolean {
  if (where.competitionCode && m.competitionCode !== where.competitionCode) return false;
  if (where.homeTeamId !== undefined && m.homeTeamId !== where.homeTeamId) return false;
  if (where.awayTeamId !== undefined && m.awayTeamId !== where.awayTeamId) return false;
  if (where.OR) {
    const or = where.OR as Record<string, unknown>[];
    return or.some((cond) => matchesWhere(m, { ...where, OR: undefined, ...cond }));
  }
  return true;
}

vi.mock("@/lib/db", () => ({
  prisma: {
    match: {
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
        const filtered = [...matches].filter((m) => matchesWhere(m, where)).sort((a, b) => b.utcDate.getTime() - a.utcDate.getTime());
        return take ? filtered.slice(0, take) : filtered;
      },
      count: async ({ where }: { where: Record<string, unknown> }) => matches.filter((m) => matchesWhere(m, where)).length,
    },
    team: {
      findMany: async ({ where }: { where: { id: { in: number[] } } }) => teams.filter((t) => where.id.in.includes(t.id)),
    },
  },
}));

const { getRecentMatches, getTeamComparativeStats, getFormStringsForCompetition, getRawSampleSizes } = await import("@/lib/cache/formCache");

describe("getRecentMatches", () => {
  it("returns all matches for a team, most recent first, with correct perspective", async () => {
    const rows = await getRecentMatches(1, COMP);
    expect(rows.map((r) => r.opponentId)).toEqual([3, 3, 2, 3]);
    expect(rows[0]).toMatchObject({ goalsFor: 2, goalsAgainst: 0, result: "V", venue: "home" });
    expect(rows[1]).toMatchObject({ goalsFor: 1, goalsAgainst: 1, result: "E", venue: "away" });
    expect(rows[2]).toMatchObject({ goalsFor: 0, goalsAgainst: 1, result: "D", venue: "home" });
  });

  it("filters to only home matches when venue is specified", async () => {
    const rows = await getRecentMatches(1, COMP, { venue: "home" });
    expect(rows.every((r) => r.venue === "home")).toBe(true);
    expect(rows.map((r) => r.goalsFor)).toEqual([2, 0, 1]);
  });

  it("filters to only away matches when venue is specified", async () => {
    const rows = await getRecentMatches(1, COMP, { venue: "away" });
    expect(rows.every((r) => r.venue === "away")).toBe(true);
    expect(rows).toHaveLength(1);
  });

  it("respects the limit option", async () => {
    const rows = await getRecentMatches(1, COMP, { limit: 2 });
    expect(rows).toHaveLength(2);
  });
});

describe("getTeamComparativeStats", () => {
  it("aggregates across all of a team's matches, home and away combined", async () => {
    const stats = await getTeamComparativeStats(1, "Home FC", COMP);
    expect(stats.matchesAnalyzed).toBe(4);
    expect(stats.wins).toBe(2);
    expect(stats.draws).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.avgGoalsScored).toBeCloseTo((2 + 1 + 0 + 1) / 4, 10);
    expect(stats.avgGoalsConceded).toBeCloseTo((0 + 1 + 1 + 0) / 4, 10);
    expect(stats.bttsPct).toBeCloseTo(1 / 4, 10); // only the 1-1 draw has both teams scoring
    expect(stats.over25Pct).toBeCloseTo(0, 10); // no match totals more than 2 goals
  });

  it("returns a zeroed result for a team with no cached matches", async () => {
    const stats = await getTeamComparativeStats(99, "Ghost FC", COMP);
    expect(stats.matchesAnalyzed).toBe(0);
    expect(stats.avgGoalsScored).toBe(0);
  });
});

describe("getFormStringsForCompetition", () => {
  it("matches getRecentMatches's last-5 results, one query for the whole league", async () => {
    const forms = await getFormStringsForCompetition(COMP);
    const expectedHomeForm = (await getRecentMatches(1, COMP, { limit: 5 })).map((r) => r.result).join("");
    expect(forms.get(1)).toBe(expectedHomeForm);
    expect(forms.get(2)).toBeDefined();
    expect(forms.get(3)).toBeDefined();
  });
});

describe("getRawSampleSizes", () => {
  it("counts raw home/away matches for the predict-route confidence check", async () => {
    const sizes = await getRawSampleSizes(1, 2, COMP);
    expect(sizes.homeSampleSize).toBe(3); // Home FC (id 1) as homeTeamId: matches 1, 3, 5
    expect(sizes.awaySampleSize).toBe(1); // Away FC (id 2) as awayTeamId: match 3
  });
});
