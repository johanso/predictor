import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { computeEnrichedPrediction, PredictionUnavailableError } from "@/lib/predict";
import { qualifiesForTracking } from "@/lib/predictions/gate";

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
    // Recomputed server-side — the client's numbers are never trusted for the gate check.
    const prediction = await computeEnrichedPrediction(competitionCode, homeTeamId, awayTeamId);
    const { favorite, favoriteProbability } = prediction.summary;
    const confidenceLevel = prediction.confidence.level;

    if (!qualifiesForTracking(confidenceLevel)) {
      return NextResponse.json(
        {
          error: `Este pronóstico se apoya en muy pocos partidos jugados (confianza ${confidenceLevel}), así que evaluarlo no diría nada sobre el modelo. Espera a que ambos equipos acumulen más fechas.`,
        },
        { status: 422 }
      );
    }

    const data = {
      competitionCode,
      homeTeamId,
      homeTeamName: prediction.homeTeam,
      awayTeamId,
      awayTeamName: prediction.awayTeam,
      lambdaHome: prediction.lambdaHome,
      lambdaAway: prediction.lambdaAway,
      favorite,
      favoriteProbability,
      bttsYesProbability: prediction.btts.yes.probability,
      over25Probability: prediction.overUnder.find((ou) => ou.line === 2.5)?.over.probability ?? 0,
      predictedHomeGoals: prediction.summary.likelyScore.home,
      predictedAwayGoals: prediction.summary.likelyScore.away,
      confidenceLevel,
    };

    const existing = await prisma.prediction.findFirst({
      where: { competitionCode, homeTeamId, awayTeamId, evaluatedAt: null },
    });

    const saved = existing
      ? await prisma.prediction.update({ where: { id: existing.id }, data: { ...data, createdAt: new Date() } })
      : await prisma.prediction.create({ data });

    return NextResponse.json({ id: saved.id, createdAt: saved.createdAt });
  } catch (err) {
    if (err instanceof PredictionUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "Failed to save prediction.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
