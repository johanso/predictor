import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BET_MARKETS } from "@/lib/betting/settle";
import { getBetsForMonth } from "@/lib/betting/stats";

const marketValues = BET_MARKETS.map((m) => m.value) as [string, ...string[]];

const bodySchema = z.object({
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

// No server-side gate here (unlike /api/predictions) — this is the user's own
// subjective record of a real bet they placed, not data feeding model calibration.
export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;
  const bet = await prisma.bet.create({
    data: {
      competitionCode: data.competitionCode,
      homeTeamId: data.homeTeamId,
      homeTeamName: data.homeTeamName,
      awayTeamId: data.awayTeamId,
      awayTeamName: data.awayTeamName,
      matchUtcDate: new Date(data.matchUtcDate),
      market: data.market,
      marketLabel: data.marketLabel,
      modelProbability: data.modelProbability,
      odds: data.odds,
      stake: data.stake,
      suggestedStake: data.suggestedStake,
    },
  });

  return NextResponse.json({ id: bet.id, createdAt: bet.createdAt });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const month = url.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Query param 'month' is required, format YYYY-MM." }, { status: 400 });
  }

  const bets = await getBetsForMonth(month);
  return NextResponse.json({ bets });
}
