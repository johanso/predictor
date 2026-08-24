import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BET_MARKETS } from "@/lib/betting/settle";
import { getBetsForMonth } from "@/lib/betting/stats";
import { isAuthError, requireAccountApi } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const marketValues = BET_MARKETS.map((m) => m.value) as [string, ...string[]];

/** Sent from the predictor: tied to a real fixture, with the model's probability behind it. */
const modelBetSchema = z.object({
  isManual: z.literal(false).optional(),
  competitionCode: z.string().min(1),
  homeTeamId: z.number().int(),
  homeTeamName: z.string().min(1),
  awayTeamId: z.number().int(),
  awayTeamName: z.string().min(1),
  matchUtcDate: z.string().min(1),
  market: z.enum(marketValues),
  marketLabel: z.string().min(1),
  modelProbability: z.number().gt(0).lt(1),
  odds: z.number().gt(1),
  stake: z.number().gte(0),
  suggestedStake: z.number().gte(0),
});

/**
 * Typed in by hand. No competition, no team ids, no model probability — it may be a
 * sport the app knows nothing about — so all it needs is enough to name the event,
 * price it, and say where the pick came from.
 */
const manualBetSchema = z.object({
  isManual: z.literal(true),
  source: z.string().min(1).max(60),
  homeTeamName: z.string().min(1),
  awayTeamName: z.string().min(1),
  matchUtcDate: z.string().min(1),
  marketLabel: z.string().min(1).max(80),
  odds: z.number().gt(1),
  stake: z.number().gte(0),
});

const bodySchema = z.union([manualBetSchema, modelBetSchema]);

// No server-side gate here (unlike /api/predictions) — this is the user's own
// subjective record of a real bet they placed, not data feeding model calibration.
export async function POST(request: Request) {
  // The account comes from the session, never from the body — a client must not
  // get to name which bookmaker's book it is writing into.
  const account = await requireAccountApi();
  if (isAuthError(account)) return account;

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  const common = {
    accountId: account.id,
    homeTeamName: data.homeTeamName,
    awayTeamName: data.awayTeamName,
    matchUtcDate: new Date(data.matchUtcDate),
    marketLabel: data.marketLabel,
    odds: data.odds,
    stake: data.stake,
  };

  const bet = await prisma.bet.create({
    data:
      data.isManual === true
        ? {
            ...common,
            isManual: true,
            source: data.source,
            // `market` doubles as the settlement key for model bets; a manual one has
            // no such key, so it just mirrors the label the user typed.
            market: data.marketLabel,
          }
        : {
            ...common,
            isManual: false,
            source: "modelo",
            competitionCode: data.competitionCode,
            homeTeamId: data.homeTeamId,
            awayTeamId: data.awayTeamId,
            market: data.market,
            modelProbability: data.modelProbability,
            suggestedStake: data.suggestedStake,
          },
  });

  return NextResponse.json({ id: bet.id, createdAt: bet.createdAt });
}

export async function GET(request: Request) {
  const account = await requireAccountApi();
  if (isAuthError(account)) return account;

  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Query param 'month' is required, format YYYY-MM." }, { status: 400 });
  }

  const bets = await getBetsForMonth(account.id, month);
  return NextResponse.json({ bets });
}
