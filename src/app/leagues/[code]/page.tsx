import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompetitionInfo } from "@/lib/footballData/competitions";
import { ensureFreshStandings } from "@/lib/cache/standingsCache";
import { PredictorClient } from "@/components/PredictorClient";

function Banner({ tone, children }: { tone: "red" | "gold"; children: React.ReactNode }) {
  const toneClass = tone === "red" ? "border-red bg-red-dim text-red" : "border-gold bg-gold-dim text-gold";
  return <div className={`border-l-4 px-4 py-3 text-sm ${toneClass}`}>{children}</div>;
}

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
    <>
      <header className="border-b-2 border-gold bg-ink text-paper">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Link href="/" className="label-eyebrow text-xs text-paper/60 hover:text-gold">
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

        {standings && standings.hasHomeAway && standings.seasonStarted && (
          <PredictorClient
            competitionCode={code}
            teams={standings.teams.map((t) => ({ teamId: t.teamId, teamName: t.teamName }))}
            fetchedAt={standings.fetchedAt ? standings.fetchedAt.toISOString() : null}
          />
        )}
      </main>
    </>
  );
}
