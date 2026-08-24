import { describe, it, expect, vi } from "vitest";

/**
 * The point of this file is account isolation: one bookmaker's numbers must never
 * be moved by another's rows. Everything here seeds two accounts whose bets would
 * visibly contaminate each other if a `where` clause were ever dropped.
 */

interface FakeBet {
  id: number;
  accountId: number;
  source: string;
  isManual: boolean;
  status: string;
  stake: number;
  odds: number;
  profit: number | null;
  createdAt: Date;
  settledAt: Date | null;
  homeTeamName: string;
  awayTeamName: string;
  marketLabel: string;
}

const A = 1;
const B = 2;

function bet(partial: Partial<FakeBet> & { id: number; accountId: number }): FakeBet {
  return {
    source: "modelo",
    isManual: false,
    status: "won",
    stake: 10,
    odds: 2,
    profit: 10,
    createdAt: new Date("2026-08-10T12:00:00Z"),
    settledAt: new Date("2026-08-11T12:00:00Z"),
    homeTeamName: "Local",
    awayTeamName: "Visitante",
    marketLabel: "1X2",
    ...partial,
  };
}

const bets: FakeBet[] = [
  // Account A: one won, one lost, one pending. Net +5 over 20 staked.
  bet({ id: 1, accountId: A, status: "won", stake: 10, profit: 15 }),
  bet({ id: 2, accountId: A, status: "lost", stake: 10, profit: -10 }),
  bet({ id: 3, accountId: A, status: "pending", profit: null, settledAt: null }),
  // Account B, deliberately much larger, and sharing the "modelo" source name with A.
  bet({ id: 4, accountId: B, status: "won", stake: 1000, profit: 900 }),
  bet({ id: 5, accountId: B, status: "lost", stake: 1000, profit: -1000 }),
  // A bet at the very end of August UTC — 31 Aug 23:30Z is 1 Sep in a UTC+ zone
  // and 31 Aug in a UTC- one, so it pins the month boundary.
  bet({ id: 6, accountId: A, status: "won", stake: 10, profit: 5, createdAt: new Date("2026-08-31T23:30:00Z") }),
  // A manual bet of A's sharing a source with a model bet, for the isManual grouping.
  bet({ id: 7, accountId: A, status: "won", stake: 10, profit: 5, source: "Tipster X", isManual: true }),
  bet({ id: 8, accountId: A, status: "lost", stake: 10, profit: -10, source: "Tipster X", isManual: false }),
];

const bankrolls = [
  { accountId: A, startingBalance: 100, updatedAt: new Date("2026-08-01T00:00:00Z") },
  { accountId: B, startingBalance: 50_000, updatedAt: new Date("2026-08-01T00:00:00Z") },
];

function matches(b: FakeBet, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  if (where.accountId !== undefined && b.accountId !== where.accountId) return false;
  if (typeof where.status === "string" && b.status !== where.status) return false;
  const status = where.status as { in?: string[] } | undefined;
  if (status?.in && !status.in.includes(b.status)) return false;
  if (where.isManual !== undefined && b.isManual !== where.isManual) return false;
  const createdAt = where.createdAt as { gte?: Date; lt?: Date } | undefined;
  if (createdAt?.gte && b.createdAt < createdAt.gte) return false;
  if (createdAt?.lt && b.createdAt >= createdAt.lt) return false;
  return true;
}

vi.mock("@/lib/db", () => ({
  prisma: {
    bet: {
      findMany: async (args?: { where?: Record<string, unknown> }) => bets.filter((b) => matches(b, args?.where)),
      count: async (args?: { where?: Record<string, unknown> }) => bets.filter((b) => matches(b, args?.where)).length,
    },
    bankroll: {
      findUnique: async ({ where }: { where: { accountId: number } }) =>
        bankrolls.find((r) => r.accountId === where.accountId) ?? null,
    },
  },
}));

const {
  getBankrollStatus,
  getBankrollHistory,
  getMonthlySummaries,
  getSourcePerformance,
  getBetsForMonth,
} = await import("@/lib/betting/stats");

describe("account isolation", () => {
  it("getBankrollStatus counts only its own account", async () => {
    const a = await getBankrollStatus(A);
    // A's five settled bets: +15 -10 +5 +5 -10 = +5 over 50 staked. B's 1000-unit
    // swings are absent, which is the whole point.
    expect(a.startingBalance).toBe(100);
    expect(a.totalProfit).toBe(5);
    expect(a.totalStaked).toBe(50);
    expect(a.currentBalance).toBe(105);
    expect(a.pendingCount).toBe(1);

    const b = await getBankrollStatus(B);
    expect(b.startingBalance).toBe(50_000);
    expect(b.totalProfit).toBe(-100);
    expect(b.pendingCount).toBe(0);
  });

  it("getBankrollHistory never plots another account's bets", async () => {
    const history = await getBankrollHistory(B);
    // Anchor point plus B's two settled bets, and nothing of A's.
    expect(history).toHaveLength(3);
    expect(history.at(-1)!.balance).toBe(49_900);
  });

  it("getMonthlySummaries is scoped", async () => {
    const [august] = await getMonthlySummaries(A);
    expect(august.month).toBe("2026-08");
    expect(august.totalBets).toBe(6); // A's six, none of B's
    expect(august.totalStaked).toBe(50);
  });

  it("getBetsForMonth is scoped", async () => {
    const rows = await getBetsForMonth(B, "2026-08");
    expect(rows.map((r) => r.id).sort()).toEqual([4, 5]);
  });

  it("does not merge two accounts that share a source name", async () => {
    const a = await getSourcePerformance(A);
    const modelo = a.find((s) => s.source === "modelo")!;
    // A has four "modelo" bets; B's two must not appear even though the key matches.
    expect(modelo.totalBets).toBe(4);
    expect(modelo.totalStaked).toBe(30);
    expect(modelo.totalProfit).toBe(10);
  });
});

describe("source grouping", () => {
  it("only labels a source manual when every one of its bets is", async () => {
    const sources = await getSourcePerformance(A);
    // "Tipster X" holds one manual and one model bet — reading the flag off an
    // arbitrary member used to label the whole row at random.
    expect(sources.find((s) => s.source === "Tipster X")!.isManual).toBe(false);
    expect(sources.find((s) => s.source === "modelo")!.isManual).toBe(false);
  });
});

describe("month boundaries", () => {
  // Both helpers must read the month in UTC. The dev machine runs at UTC-5 and the
  // deployed server at UTC, so a local-time reading would move this bet between
  // months depending on where the code happens to run.
  it.each(["UTC", "America/Bogota", "Asia/Tokyo"])("files a 23:30Z bet under August in %s", async (tz) => {
    const original = process.env.TZ;
    process.env.TZ = tz;
    try {
      const summaries = await getMonthlySummaries(A);
      expect(summaries.map((s) => s.month)).toEqual(["2026-08"]);
      expect((await getBetsForMonth(A, "2026-08")).map((b) => b.id)).toContain(6);
      expect(await getBetsForMonth(A, "2026-09")).toHaveLength(0);
    } finally {
      process.env.TZ = original;
    }
  });
});
