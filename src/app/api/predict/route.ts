import { NextResponse } from "next/server";
import { z } from "zod";
import { computeEnrichedPrediction, PredictionUnavailableError } from "@/lib/predict";

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

  try {
    const response = await computeEnrichedPrediction(competitionCode, homeTeamId, awayTeamId);
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof PredictionUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to compute prediction.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const dynamic = "force-dynamic";
