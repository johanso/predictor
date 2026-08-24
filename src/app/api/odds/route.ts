import { NextResponse } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { getOddsForFixture } from "@/lib/cache/oddsCache";
import { getOddsQuota } from "@/lib/oddsApi/quota";
import { ODDS_API_LEAGUE_SLUGS } from "@/lib/oddsApi/leagues";

const querySchema = z.object({
  competitionCode: z.string().min(1),
  homeTeamName: z.string().min(1),
  awayTeamName: z.string().min(1),
  utcDate: z.string().min(1),
  refresh: z.enum(["0", "1"]).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  const { competitionCode, homeTeamName, awayTeamName, utcDate, refresh } = parsed.data;

  if (!config.oddsApi.isConfigured) {
    return NextResponse.json({ configured: false, supported: false, odds: [], quota: null, error: null });
  }
  if (!ODDS_API_LEAGUE_SLUGS[competitionCode]) {
    return NextResponse.json({ configured: true, supported: false, odds: [], quota: await getOddsQuota(), error: null });
  }

  const kickoff = new Date(utcDate);
  if (Number.isNaN(kickoff.getTime())) {
    return NextResponse.json({ error: "Fecha de partido inválida." }, { status: 400 });
  }

  try {
    const { odds, quotaSpent, error } = await getOddsForFixture(
      competitionCode,
      { homeTeamName, awayTeamName, utcDate: kickoff },
      { forceRefresh: refresh === "1" }
    );

    return NextResponse.json({
      configured: true,
      supported: true,
      odds: odds.map((o) => ({
        bookmaker: o.bookmaker,
        markets: o.markets,
        fetchedAt: o.fetchedAt.toISOString(),
      })),
      quotaSpent,
      quota: await getOddsQuota(),
      error,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error consultando las cuotas.";
    return NextResponse.json({ configured: true, supported: true, odds: [], quota: await getOddsQuota(), error: message }, { status: 502 });
  }
}

export const dynamic = "force-dynamic";
