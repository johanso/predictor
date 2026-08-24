import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureFreshStandings, FootballDataError } from "@/lib/cache/standingsCache";
import { getCompetitionInfo } from "@/lib/footballData/competitions";
import { isAuthError, requireAccountApi } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
// It walks competitions one at a time behind a 10-requests-per-minute limiter;
// the platform default would cut the loop off partway through.
export const maxDuration = 60;

/**
 * Settles everything whose match has already been played.
 *
 * Settlement itself lives inside refreshFromApi (standingsCache), where it rides
 * along with the results fetch so it costs no extra API calls. The catch was that it
 * only ever ran as a side effect of refreshing a league's standings — from another
 * page — so a bet could sit pending for days if that page went unvisited, with no way
 * to tell when it would update. This gives it a front door.
 *
 * Only competitions with something actually waiting are refreshed, and only once the
 * kickoff is far enough in the past for the match to be over, so the button costs the
 * fewest football-data.org requests it can.
 *
 * Which competitions get refreshed is global; what gets reported back is scoped to
 * the logged-in account. Refreshing a competition another account is waiting on
 * costs this caller nothing — the response is shared and cached — whereas scoping
 * it would mean logging into each bookmaker in turn just to make results land,
 * which is the friction this front door exists to remove. The counts, though, sit
 * next to one account's table, so "3 liquidadas" has to mean the three rows that
 * just changed on screen.
 */

// A match is assumed finished this long after kickoff; results appear upstream soon after.
const MATCH_DURATION_MS = 2.5 * 60 * 60 * 1000;

export async function POST() {
  const account = await requireAccountApi();
  if (isAuthError(account)) return account;

  const cutoff = new Date(Date.now() - MATCH_DURATION_MS);

  const [pendingBets, pendingPredictions] = await Promise.all([
    // Manual bets are excluded: they are closed by hand, and many are sports this
    // refresh knows nothing about, so they must not drag a competition into the
    // refresh list and spend a request for nothing.
    prisma.bet.findMany({
      where: { status: "pending", isManual: false, matchUtcDate: { lt: cutoff } },
      select: { competitionCode: true },
    }),
    // Predictions carry no kickoff date — they are matched to whichever finished game
    // came after they were saved. The creation cutoff is what stops a just-saved
    // prediction, whose match cannot possibly have been played yet, from spending a
    // football-data request on every press.
    prisma.prediction.findMany({
      where: { evaluatedAt: null, createdAt: { lt: cutoff } },
      select: { competitionCode: true },
    }),
  ]);

  const codes = [...new Set([...pendingBets, ...pendingPredictions].map((r) => r.competitionCode))].filter(
    (code): code is string => code !== null && Boolean(getCompetitionInfo(code))
  );

  if (codes.length === 0) {
    return NextResponse.json({
      refreshed: [],
      settledBets: 0,
      evaluatedPredictions: 0,
      message: "No hay nada pendiente cuyo partido ya se haya jugado.",
    });
  }

  const before = await countOutstanding(account.id);
  const refreshed: string[] = [];
  const failures: string[] = [];

  for (const code of codes) {
    try {
      await ensureFreshStandings(code, { forceRefresh: true });
      refreshed.push(code);
    } catch (err) {
      failures.push(err instanceof FootballDataError ? `${code}: ${err.message}` : code);
    }
  }

  const after = await countOutstanding(account.id);

  return NextResponse.json({
    refreshed,
    failures,
    settledBets: Math.max(0, before.bets - after.bets),
    settledOtherAccounts: Math.max(0, before.betsAllAccounts - after.betsAllAccounts - (before.bets - after.bets)),
    evaluatedPredictions: Math.max(0, before.predictions - after.predictions),
    stillPendingBets: after.bets,
  });
}

async function countOutstanding(accountId: number) {
  const [bets, betsAllAccounts, predictions] = await Promise.all([
    prisma.bet.count({ where: { accountId, status: "pending", isManual: false } }),
    prisma.bet.count({ where: { status: "pending", isManual: false } }),
    // Predictions stay global: they measure the model, not a bettor, and the page
    // says as much.
    prisma.prediction.count({ where: { evaluatedAt: null } }),
  ]);
  return { bets, betsAllAccounts, predictions };
}
