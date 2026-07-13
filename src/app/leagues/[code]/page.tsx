import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionInfo } from "@/lib/footballData/competitions";
import { ensureFreshStandings } from "@/lib/cache/standingsCache";
import { PredictorClient } from "@/components/PredictorClient";

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

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-neutral-500 hover:underline">
            ← Ligas
          </Link>
          <h1 className="text-2xl font-semibold">{info.name}</h1>
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {loadError}
        </div>
      )}

      {standings && !standings.hasHomeAway && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {info.name} no expone tabla de posiciones separada por local/visitante (formato de grupos/eliminatorias), así
          que el predictor no está disponible para esta competición.
        </div>
      )}

      {standings && standings.hasHomeAway && !standings.seasonStarted && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          La temporada de {info.name} aún no ha comenzado — todavía no hay partidos jugados para calcular predicciones.
        </div>
      )}

      {standings && standings.hasHomeAway && standings.seasonStarted && (
        <PredictorClient
          competitionCode={code}
          teams={standings.teams.map((t) => ({ teamId: t.teamId, teamName: t.teamName }))}
          fetchedAt={standings.fetchedAt ? standings.fetchedAt.toISOString() : null}
        />
      )}
    </main>
  );
}
