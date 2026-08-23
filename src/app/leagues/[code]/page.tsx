import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionInfo } from "@/lib/footballData/competitions";
import { ensureFreshStandings, getWeightedTeamStats } from "@/lib/cache/standingsCache";
import { ensureFreshFixtures, type FixtureRow } from "@/lib/cache/fixturesCache";
import { getVenueStandings, getSeasonRecords, type VenueStandingsRow } from "@/lib/cache/formCache";
import { predictMatch, buildSummary } from "@/lib/poisson";
import { LeaguePageClient } from "@/components/LeaguePageClient";
import { Banner } from "@/components/ui/Banner";
import { SeasonRecordsCard } from "@/components/SeasonRecordsCard";
import type { FixtureFavorite } from "@/components/FixturesList";

export default async function LeaguePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const info = getCompetitionInfo(code);
  if (!info) notFound();

  let standings;
  let loadError: string | null = null;
  try {
    standings = await ensureFreshStandings(code);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "No se pudieron cargar los standings.";
  }

  let fixtures: FixtureRow[] = [];
  try {
    fixtures = await ensureFreshFixtures(code);
  } catch {
    fixtures = []; // fixtures are a nice-to-have, never turn into a page-level error
  }

  let homeStandings: VenueStandingsRow[] = [];
  let awayStandings: VenueStandingsRow[] = [];
  let seasonRecords: Awaited<ReturnType<typeof getSeasonRecords>> | null = null;
  const fixturePredictions: Record<number, FixtureFavorite> = {};
  if (standings && standings.hasHomeAway && standings.seasonStarted) {
    [homeStandings, awayStandings, seasonRecords] = await Promise.all([
      getVenueStandings(code, "home"),
      getVenueStandings(code, "away"),
      getSeasonRecords(code),
    ]);

    // Precomputed here (pure, no extra API calls) so "Próximos partidos" can show
    // each match's favorite without the user opening the predictor for every one.
    const teamStats = await getWeightedTeamStats(code);
    for (const f of fixtures) {
      try {
        const prediction = predictMatch(f.homeTeamId, f.awayTeamId, teamStats);
        const summary = buildSummary(prediction.homeTeam, prediction.awayTeam, prediction.oneXTwo, prediction.exactScores);
        fixturePredictions[f.id] = {
          favorite: summary.favorite,
          favoriteLabel: summary.favoriteLabel,
          favoriteProbability: summary.favoriteProbability,
        };
      } catch {
        // one of the two teams has no home or away games logged yet — skip, no badge for this fixture
      }
    }
  }

  return (
    <>
      <header className="border-b-2 border-gold bg-chrome text-chrome-ink">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Link href="/" className="label-eyebrow text-xs text-chrome-ink/60 hover:text-gold">
            ← Ligas
          </Link>
          <h1 className="mt-2 text-3xl font-semibold uppercase tracking-tight">{info.name}</h1>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        {loadError && <Banner tone="red">{loadError}</Banner>}

        {standings && !standings.hasHomeAway && (
          <Banner tone="gold">
            {info.name} no expone tabla de posiciones separada por local/visitante (formato de
            grupos/eliminatorias), así que el predictor no está disponible para esta competición.
          </Banner>
        )}

        {standings && standings.hasHomeAway && !standings.seasonStarted && (
          <Banner tone="gold">
            La temporada de {info.name} aún no ha comenzado — todavía no hay partidos jugados para
            calcular predicciones.
          </Banner>
        )}

        {seasonRecords && <SeasonRecordsCard records={seasonRecords} />}

        {standings && standings.hasHomeAway && standings.seasonStarted && (
          <LeaguePageClient
            competitionCode={code}
            standingsRows={standings.table}
            homeStandingsRows={homeStandings}
            awayStandingsRows={awayStandings}
            teams={standings.teams.map((t) => ({ teamId: t.teamId, teamName: t.teamName }))}
            fetchedAt={standings.fetchedAt ? standings.fetchedAt.toISOString() : null}
            fixtures={fixtures.map((f) => ({
              id: f.id,
              utcDate: f.utcDate.toISOString(),
              matchday: f.matchday,
              homeTeamId: f.homeTeamId,
              homeTeamName: f.homeTeamName,
              homeTeamCrest: f.homeTeamCrest,
              awayTeamId: f.awayTeamId,
              awayTeamName: f.awayTeamName,
              awayTeamCrest: f.awayTeamCrest,
            }))}
            fixturePredictions={fixturePredictions}
          />
        )}
      </main>
    </>
  );
}
