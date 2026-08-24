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

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function getMonthlySummaries(): Promise<MonthlySummary[]> {
  const bets = await prisma.bet.findMany({ orderBy: { createdAt: "desc" } });

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
 * Ordered by profit rather than yield on purpose: yield on three settled bets is
 * mostly noise, and sorting by it would put a lucky one-off at the top. `resolvedBets`
 * rides along so the UI can say how much each row is worth believing.
 */
export async function getSourcePerformance(): Promise<SourcePerformance[]> {
  const bets = await prisma.bet.findMany();

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
        isManual: sourceBets[0].isManual,
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

export async function getBetsForMonth(month: string): Promise<BetModel[]> {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(year, monthNum - 1, 1);
  const end = new Date(year, monthNum, 1);
  return prisma.bet.findMany({
    where: { createdAt: { gte: start, lt: end } },
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

const BANKROLL_ID = 1;

export async function getBankrollStatus(): Promise<BankrollStatus> {
  const [bankroll, resolvedBets, pendingCount] = await Promise.all([
    prisma.bankroll.findUnique({ where: { id: BANKROLL_ID } }),
    // "won"/"lost" only — a voided bet always has profit 0, so including it here
    // wouldn't change currentBalance, but it also shouldn't count toward totalStaked.
    prisma.bet.findMany({ where: { status: { in: ["won", "lost"] } } }),
    prisma.bet.count({ where: { status: "pending" } }),
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
export async function getBankrollHistory(): Promise<BankrollHistoryPoint[]> {
  const [bankroll, resolvedBets] = await Promise.all([
    prisma.bankroll.findUnique({ where: { id: BANKROLL_ID } }),
    prisma.bet.findMany({ where: { status: { in: ["won", "lost"] } }, orderBy: { settledAt: "asc" } }),
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

export async function setStartingBalance(startingBalance: number): Promise<void> {
  await prisma.bankroll.upsert({
    where: { id: BANKROLL_ID },
    create: { id: BANKROLL_ID, startingBalance },
    update: { startingBalance },
  });
}
