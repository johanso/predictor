import { prisma } from "@/lib/db";
import type { BetModel } from "@/generated/prisma/models";

export interface MonthlySummary {
  month: string; // "2026-08"
  totalBets: number;
  resolvedBets: number; // won + lost — excludes pending and void
  pendingBets: number;
  voidBets: number;
  totalStaked: number; // won + lost only — a voided bet was never actually at risk
  totalProfit: number;
  yieldPct: number | null;
  winRate: number | null; // won / resolved
}

// UTC, not local time. The dev machine runs at UTC-5 and the deployed server at
// UTC, so reading a bet's month in local time would move bets placed in the last
// hours of a month into the next one depending on where the code happens to run.
// getBetsForMonth's bounds must stay in the same zone as this or the month tabs
// and the month's contents disagree.
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getMonthlySummaries(accountId: number): Promise<MonthlySummary[]> {
  const bets = await prisma.bet.findMany({ where: { accountId }, orderBy: { createdAt: "desc" } });

  const byMonth = new Map<string, BetModel[]>();
  for (const bet of bets) {
    const key = monthKey(bet.createdAt);
    const list = byMonth.get(key) ?? [];
    list.push(bet);
    byMonth.set(key, list);
  }

  return [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, monthBets]) => {
      const resolved = monthBets.filter((b) => b.status === "won" || b.status === "lost");
      const won = resolved.filter((b) => b.status === "won");
      const voidBets = monthBets.filter((b) => b.status === "void");
      const pendingBets = monthBets.filter((b) => b.status === "pending");
      const totalStaked = resolved.reduce((s, b) => s + b.stake, 0);
      const totalProfit = resolved.reduce((s, b) => s + (b.profit ?? 0), 0);

      return {
        month,
        totalBets: monthBets.length,
        resolvedBets: resolved.length,
        pendingBets: pendingBets.length,
        voidBets: voidBets.length,
        totalStaked,
        totalProfit,
        yieldPct: totalStaked > 0 ? totalProfit / totalStaked : null,
        winRate: resolved.length > 0 ? won.length / resolved.length : null,
      };
    });
}

export interface SourcePerformance {
  source: string;
  isManual: boolean;
  totalBets: number;
  resolvedBets: number;
  pendingBets: number;
  totalStaked: number;
  totalProfit: number;
  yieldPct: number | null;
  winRate: number | null;
  avgOdds: number | null;
}

/**
 * Yield per origin, across all time — which tipster, or the model itself, is actually
 * paying for itself.
 *
 * Scoped to one account, and grouped by Bet.source *within* it: "source" is where
 * the pick came from, the account is which bookmaker it was placed with. Two
 * different questions, and merging them would pool bookmakers that have different
 * prices and different margins.
 *
 * Ordered by profit rather than yield on purpose: yield on three settled bets is
 * mostly noise, and sorting by it would put a lucky one-off at the top. `resolvedBets`
 * rides along so the UI can say how much each row is worth believing.
 */
export async function getSourcePerformance(accountId: number): Promise<SourcePerformance[]> {
  const bets = await prisma.bet.findMany({ where: { accountId } });

  const bySource = new Map<string, BetModel[]>();
  for (const bet of bets) {
    const list = bySource.get(bet.source) ?? [];
    list.push(bet);
    bySource.set(bet.source, list);
  }

  return [...bySource.entries()]
    .map(([source, sourceBets]) => {
      const resolved = sourceBets.filter((b) => b.status === "won" || b.status === "lost");
      const won = resolved.filter((b) => b.status === "won");
      const totalStaked = resolved.reduce((s, b) => s + b.stake, 0);
      const totalProfit = resolved.reduce((s, b) => s + (b.profit ?? 0), 0);

      return {
        source,
        // `source` and `isManual` are independent columns — a tipster's name can sit
        // on a model bet and a hand-typed one alike — so the group only earns the
        // manual pill when every bet in it is manual. Reading it off an arbitrary
        // member (sourceBets[0]) labelled the row at random.
        isManual: sourceBets.every((b) => b.isManual),
        totalBets: sourceBets.length,
        resolvedBets: resolved.length,
        pendingBets: sourceBets.filter((b) => b.status === "pending").length,
        totalStaked,
        totalProfit,
        yieldPct: totalStaked > 0 ? totalProfit / totalStaked : null,
        winRate: resolved.length > 0 ? won.length / resolved.length : null,
        avgOdds: resolved.length > 0 ? resolved.reduce((s, b) => s + b.odds, 0) / resolved.length : null,
      };
    })
    .sort((a, b) => b.totalProfit - a.totalProfit);
}

export async function getBetsForMonth(accountId: number, month: string): Promise<BetModel[]> {
  const [year, monthNum] = month.split("-").map(Number);
  // Date.UTC, matching monthKey above — see the note there.
  const start = new Date(Date.UTC(year, monthNum - 1, 1));
  const end = new Date(Date.UTC(year, monthNum, 1));
  return prisma.bet.findMany({
    where: { accountId, createdAt: { gte: start, lt: end } },
    orderBy: { createdAt: "desc" },
  });
}

export interface BankrollStatus {
  startingBalance: number;
  currentBalance: number;
  totalProfit: number;
  totalStaked: number;
  pendingCount: number;
}

export async function getBankrollStatus(accountId: number): Promise<BankrollStatus> {
  const [bankroll, resolvedBets, pendingCount] = await Promise.all([
    prisma.bankroll.findUnique({ where: { accountId } }),
    // "won"/"lost" only — a voided bet always has profit 0, so including it here
    // wouldn't change currentBalance, but it also shouldn't count toward totalStaked.
    prisma.bet.findMany({ where: { accountId, status: { in: ["won", "lost"] } } }),
    prisma.bet.count({ where: { accountId, status: "pending" } }),
  ]);

  const startingBalance = bankroll?.startingBalance ?? 0;
  const totalProfit = resolvedBets.reduce((s, b) => s + (b.profit ?? 0), 0);
  const totalStaked = resolvedBets.reduce((s, b) => s + b.stake, 0);

  return {
    startingBalance,
    currentBalance: startingBalance + totalProfit,
    totalProfit,
    totalStaked,
    pendingCount,
  };
}

export interface BankrollHistoryPoint {
  date: string; // ISO — settledAt of the bet that caused this balance, or the starting anchor
  balance: number;
  label: string;
}

/** Cumulative bankroll balance after each settled (won/lost) bet, in order — the "evolución de banca" chart's data. */
export async function getBankrollHistory(accountId: number): Promise<BankrollHistoryPoint[]> {
  const [bankroll, resolvedBets] = await Promise.all([
    prisma.bankroll.findUnique({ where: { accountId } }),
    prisma.bet.findMany({
      where: { accountId, status: { in: ["won", "lost"] } },
      orderBy: { settledAt: "asc" },
    }),
  ]);

  const startingBalance = bankroll?.startingBalance ?? 0;
  const points: BankrollHistoryPoint[] = [
    { date: (bankroll?.updatedAt ?? new Date(0)).toISOString(), balance: startingBalance, label: "Banca inicial" },
  ];

  let running = startingBalance;
  for (const bet of resolvedBets) {
    running += bet.profit ?? 0;
    points.push({
      date: (bet.settledAt ?? bet.createdAt).toISOString(),
      balance: running,
      label: `${bet.homeTeamName} vs ${bet.awayTeamName} — ${bet.marketLabel} (${bet.status === "won" ? "ganada" : "perdida"})`,
    });
  }

  return points;
}

export async function setStartingBalance(accountId: number, startingBalance: number): Promise<void> {
  await prisma.bankroll.upsert({
    where: { accountId },
    create: { accountId, startingBalance },
    update: { startingBalance },
  });
}
