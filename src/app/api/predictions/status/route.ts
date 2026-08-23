import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Lets the predictor UI know whether this exact matchup already has a tracked prediction (pending or evaluated), so the save button never looks like a no-op or silently overwrites without telling the user. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const competitionCode = url.searchParams.get("competitionCode");
  const homeTeamId = Number(url.searchParams.get("homeTeamId"));
  const awayTeamId = Number(url.searchParams.get("awayTeamId"));

  if (!competitionCode || !Number.isInteger(homeTeamId) || !Number.isInteger(awayTeamId)) {
    return NextResponse.json({ error: "competitionCode, homeTeamId and awayTeamId are required." }, { status: 400 });
  }

  const prediction = await prisma.prediction.findFirst({
    where: { competitionCode, homeTeamId, awayTeamId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ prediction });
}
