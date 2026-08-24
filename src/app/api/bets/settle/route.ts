import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureFreshStandings, FootballDataError } from "@/lib/cache/standingsCache";
import { getCompetitionInfo } from "@/lib/footballData/competitions";

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
 */

// A match is assumed finished this long after kickoff; results appear upstream soon after.
const MATCH_DURATION_MS = 2.5 * 60 * 60 * 1000;

export async function POST() {
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

  const before = await countOutstanding();
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

  const after = await countOutstanding();

  return NextResponse.json({
    refreshed,
    failures,
    settledBets: Math.max(0, before.bets - after.bets),
    evaluatedPredictions: Math.max(0, before.predictions - after.predictions),
    stillPendingBets: after.bets,
  });
}

async function countOutstanding() {
  const [bets, predictions] = await Promise.all([
    prisma.bet.count({ where: { status: "pending", isManual: false } }),
    prisma.prediction.count({ where: { evaluatedAt: null } }),
  ]);
  return { bets, predictions };
}
