import { NextResponse } from "next/server";
import { ensureFreshFixtures, FootballDataError } from "@/lib/cache/fixturesCache";
import { getCompetitionInfo } from "@/lib/footballData/competitions";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const info = getCompetitionInfo(code);
  if (!info) {
    return NextResponse.json({ error: `Unknown competition code: ${code}` }, { status: 404 });
  }

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const fixtures = await ensureFreshFixtures(code, { forceRefresh });
    return NextResponse.json(fixtures);
  } catch (err) {
    if (err instanceof FootballDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status === 429 ? 429 : 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error fetching fixtures.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
