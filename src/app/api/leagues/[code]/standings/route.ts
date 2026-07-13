import { NextResponse } from "next/server";
import { ensureFreshStandings, FootballDataError } from "@/lib/cache/standingsCache";
import { getCompetitionInfo } from "@/lib/footballData/competitions";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const info = getCompetitionInfo(code);
  if (!info) {
    return NextResponse.json({ error: `Unknown competition code: ${code}` }, { status: 404 });
  }

  const forceRefresh = new URL(request.url).searchParams.get("refresh") === "1";

  try {
    const result = await ensureFreshStandings(code, { forceRefresh });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof FootballDataError) {
      return NextResponse.json({ error: err.message }, { status: err.status === 429 ? 429 : 502 });
    }
    const message = err instanceof Error ? err.message : "Unknown error fetching standings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
