import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureFreshStandings } from "@/lib/cache/standingsCache";
import { predictMatch } from "@/lib/poisson";

const bodySchema = z.object({
  competitionCode: z.string().min(1),
  homeTeamId: z.number().int(),
  awayTeamId: z.number().int(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body", issues: parsed.error.issues }, { status: 400 });
  }

  const { competitionCode, homeTeamId, awayTeamId } = parsed.data;
  if (homeTeamId === awayTeamId) {
    return NextResponse.json({ error: "homeTeamId and awayTeamId must be different." }, { status: 400 });
  }

  const standings = await ensureFreshStandings(competitionCode);

  if (!standings.hasHomeAway) {
    return NextResponse.json(
      { error: `${standings.name} does not expose home/away split standings — predictions aren't supported for this competition.` },
      { status: 422 }
    );
  }

  if (!standings.seasonStarted) {
    return NextResponse.json(
      { error: `${standings.name}'s season hasn't started yet — no matches played, so there's no data to predict from.` },
      { status: 422 }
    );
  }

  try {
    const prediction = predictMatch(homeTeamId, awayTeamId, standings.teams);
    return NextResponse.json(prediction);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to compute prediction.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
