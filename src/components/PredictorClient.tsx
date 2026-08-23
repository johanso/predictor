"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TeamSelector } from "@/components/TeamSelector";
import { FixturesList, type FixtureOption, type FixtureFavorite } from "@/components/FixturesList";
import { SummaryCard } from "@/components/ResultsPanel/SummaryCard";
import { ExpectedGoalsCard } from "@/components/ResultsPanel/ExpectedGoalsCard";
import { TopScoresCard } from "@/components/ResultsPanel/TopScoresCard";
import { OneXTwoCard } from "@/components/ResultsPanel/OneXTwoCard";
import { ExactScoreGrid } from "@/components/ResultsPanel/ExactScoreGrid";
import { BttsCard } from "@/components/ResultsPanel/BttsCard";
import { DoubleChanceCard } from "@/components/ResultsPanel/DoubleChanceCard";
import { OverUnderTable } from "@/components/ResultsPanel/OverUnderTable";
import { DerivedMarketsCard } from "@/components/ResultsPanel/DerivedMarketsCard";
import { RecentFormCard } from "@/components/ResultsPanel/RecentFormCard";
import { ComparativeStatsCard } from "@/components/ResultsPanel/ComparativeStatsCard";
import { BetSlipCard } from "@/components/betting/BetSlipCard";
import { Pill } from "@/components/ui/Pill";
import { qualifiesForTracking } from "@/lib/predictions/gate";
import type { EnrichedMatchPrediction } from "@/types/domain";

interface TeamOption {
  teamId: number;
  teamName: string;
}

interface TrackedStatus {
  id: number;
  createdAt: string;
  evaluatedAt: string | null;
  favoriteProbability: number;
  actualHomeGoals: number | null;
  actualAwayGoals: number | null;
  correctOneXTwo: boolean | null;
}

type Mode = "quick" | "detailed";

export function PredictorClient({
  competitionCode,
  teams,
  fetchedAt,
  fixtures,
  fixturePredictions,
  homeTeamId,
  awayTeamId,
  onHomeTeamChange,
  onAwayTeamChange,
}: {
  competitionCode: string;
  teams: TeamOption[];
  fetchedAt: string | null;
  fixtures: FixtureOption[];
  fixturePredictions: Record<number, FixtureFavorite>;
  homeTeamId: number | null;
  awayTeamId: number | null;
  onHomeTeamChange: (teamId: number) => void;
  onAwayTeamChange: (teamId: number) => void;
}) {
  const router = useRouter();
  const [prediction, setPrediction] = useState<EnrichedMatchPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("quick");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tracked, setTracked] = useState<TrackedStatus | null>(null);

  const canCalculate = homeTeamId !== null && awayTeamId !== null && homeTeamId !== awayTeamId;

  async function fetchTrackedStatus() {
    if (homeTeamId === null || awayTeamId === null) return;
    try {
      const res = await fetch(
        `/api/predictions/status?competitionCode=${competitionCode}&homeTeamId=${homeTeamId}&awayTeamId=${awayTeamId}`
      );
      const data = await res.json();
      setTracked(data.prediction as TrackedStatus | null);
    } catch {
      setTracked(null); // best-effort — a failed status check shouldn't block the rest of the UI
    }
  }

  async function handleCalculate() {
    if (!canCalculate) return;
    setLoading(true);
    setError(null);
    setSaveStatus("idle");
    setSaveError(null);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionCode, homeTeamId, awayTeamId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo calcular la predicción.");
      setPrediction(data as EnrichedMatchPrediction);
      await fetchTrackedStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
      setPrediction(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        fetch(`/api/leagues/${competitionCode}/standings?refresh=1`),
        fetch(`/api/leagues/${competitionCode}/fixtures?refresh=1`),
      ]);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSaveForEvaluation() {
    if (!canCalculate) return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionCode, homeTeamId, awayTeamId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el pronóstico.");
      setSaveStatus("saved");
      await fetchTrackedStatus();
    } catch (err) {
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Error desconocido.");
    }
  }

  function handleFixtureClick(f: FixtureOption) {
    onHomeTeamChange(f.homeTeamId);
    onAwayTeamChange(f.awayTeamId);
    setPrediction(null);
    setError(null);
    setSaveStatus("idle");
    setSaveError(null);
    setTracked(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {fixtures.length > 0 && (
        <FixturesList fixtures={fixtures} predictions={fixturePredictions} onSelect={handleFixtureClick} />
      )}
      <div className="flex flex-wrap items-end gap-4 border border-line bg-paper-raised p-4">
        <TeamSelector label="Local" tone="pitch" teams={teams} value={homeTeamId} onChange={onHomeTeamChange} disabledTeamId={awayTeamId} />
        <span className="label-eyebrow pb-2 text-xs text-ink-soft">vs</span>
        <TeamSelector label="Visitante" tone="sky" teams={teams} value={awayTeamId} onChange={onAwayTeamChange} disabledTeamId={homeTeamId} />
        <button
          onClick={handleCalculate}
          disabled={!canCalculate || loading}
          className="label-eyebrow bg-ink px-5 py-2 text-xs text-paper transition-colors hover:bg-pitch disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Calculando…" : "Calcular"}
        </button>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="label-eyebrow ml-auto border border-line px-3 py-2 text-xs text-ink-soft transition-colors hover:border-sky hover:text-sky disabled:opacity-50"
        >
          {refreshing ? "Actualizando…" : "Refrescar"}
        </button>
      </div>

      {fetchedAt && (
        <p className="font-numeric text-xs text-ink-soft">
          Datos actualizados: {new Date(fetchedAt).toLocaleString("es")}
        </p>
      )}

      {error && <div className="border-l-4 border-red bg-red-dim px-4 py-3 text-sm text-red">{error}</div>}

      {prediction && (
        <div className="flex flex-col gap-6 print:gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-baseline gap-3 text-2xl font-semibold uppercase tracking-tight">
              <span className="text-pitch">{prediction.homeTeam}</span>
              <span className="label-eyebrow text-sm text-ink-soft">vs</span>
              <span className="text-sky">{prediction.awayTeam}</span>
            </h2>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={() => setMode(mode === "quick" ? "detailed" : "quick")}
                className="label-eyebrow border border-line px-3 py-2 text-xs text-ink-soft transition-colors hover:border-pitch hover:text-pitch"
              >
                {mode === "quick" ? "Ver análisis detallado" : "Ver análisis rápido"}
              </button>
              <button
                onClick={() => window.print()}
                className="label-eyebrow border border-line px-3 py-2 text-xs text-ink-soft transition-colors hover:border-pitch hover:text-pitch"
              >
                Imprimir / Exportar
              </button>
            </div>
          </div>

          <SummaryCard
            summary={prediction.summary}
            confidence={prediction.confidence}
            action={(() => {
              // A tracked prediction is deliberately immutable. There used to be an
              // "update submission" button here that overwrote the stored record and
              // reset its timestamp — which quietly let a forecast be replaced by a
              // better-informed one after more matches had been played, so the
              // accuracy stats stopped measuring what was actually predicted.
              if (tracked?.evaluatedAt) {
                return (
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    <Pill tone={tracked.correctOneXTwo ? "pitch" : "red"}>
                      {tracked.correctOneXTwo ? "Acertó ✓" : "Falló ✗"} {tracked.actualHomeGoals}-{tracked.actualAwayGoals}
                    </Pill>
                    <Link href="/rendimiento" className="label-eyebrow text-[0.65rem] text-ink-soft hover:text-gold print:hidden">
                      Historial →
                    </Link>
                  </span>
                );
              }

              if (saveStatus === "saved" || tracked?.evaluatedAt === null) {
                return (
                  <span className="flex items-center gap-2 whitespace-nowrap print:hidden">
                    <Pill tone="gold">En seguimiento</Pill>
                    <Link href="/rendimiento" className="label-eyebrow text-[0.65rem] text-ink-soft hover:text-gold">
                      Historial →
                    </Link>
                  </span>
                );
              }

              const qualifies = qualifiesForTracking(prediction.confidence.level);
              return (
                <span className="flex items-center gap-3 print:hidden">
                  {!qualifies && (
                    <span className="max-w-[18rem] text-[0.65rem] text-ink-soft">
                      Muy pocos partidos jugados para que evaluarlo diga algo del modelo.
                    </span>
                  )}
                  {saveStatus === "error" && saveError && <span className="max-w-[18rem] text-[0.65rem] text-red">{saveError}</span>}
                  <button
                    onClick={handleSaveForEvaluation}
                    disabled={!qualifies || saveStatus === "saving"}
                    title="Guarda este pronóstico tal cual para compararlo con el resultado real. No se puede modificar después."
                    className="label-eyebrow whitespace-nowrap border border-line px-3 py-2 text-xs text-ink-soft transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saveStatus === "saving" ? "Enviando…" : "Seguir este pronóstico"}
                  </button>
                  <Link href="/rendimiento" className="label-eyebrow text-[0.65rem] text-ink-soft hover:text-gold">
                    Historial →
                  </Link>
                </span>
              );
            })()}
          />

          <div>
            <p className="label-eyebrow mb-3 text-xs text-ink-soft">Predicción principal</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <OneXTwoCard homeWin={prediction.oneXTwo.homeWin} draw={prediction.oneXTwo.draw} awayWin={prediction.oneXTwo.awayWin} />
              <BttsCard yes={prediction.btts.yes} no={prediction.btts.no} />
              <DoubleChanceCard oneX={prediction.doubleChance.oneX} oneTwo={prediction.doubleChance.oneTwo} xTwo={prediction.doubleChance.xTwo} />
            </div>
          </div>

          <div>
            <p className="label-eyebrow mb-3 text-xs text-ink-soft">Goles esperados</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ExpectedGoalsCard
                lambdaHome={prediction.lambdaHome}
                lambdaAway={prediction.lambdaAway}
                homeTeam={prediction.homeTeam}
                awayTeam={prediction.awayTeam}
              />
              <TopScoresCard scores={prediction.exactScores} />
            </div>
          </div>

          <p className="text-xs text-ink-soft">Cuota justa = 1 / probabilidad, sin margen de casa de apuestas.</p>

          <div className="print:hidden">
            <div className="mb-3 flex items-center justify-between">
              <p className="label-eyebrow text-xs text-ink-soft">Control de apuestas</p>
              <Link href="/apuestas" className="label-eyebrow text-[0.65rem] text-ink-soft hover:text-gold">
                Ver historial de apuestas →
              </Link>
            </div>
            <BetSlipCard
              competitionCode={competitionCode}
              homeTeamId={homeTeamId as number}
              awayTeamId={awayTeamId as number}
              prediction={prediction}
              fixtures={fixtures}
            />
          </div>

          {mode === "detailed" && (
            <div className="flex flex-col gap-6 border-t border-line pt-6">
              <p className="label-eyebrow -mb-2 text-xs text-ink-soft">Análisis detallado</p>
              <ExactScoreGrid scores={prediction.exactScores} homeTeam={prediction.homeTeam} awayTeam={prediction.awayTeam} />
              <OverUnderTable lines={prediction.overUnder} />
              <DerivedMarketsCard markets={prediction.derivedMarkets} homeTeam={prediction.homeTeam} awayTeam={prediction.awayTeam} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <RecentFormCard form={prediction.recentForm.home} tone="pitch" />
                <RecentFormCard form={prediction.recentForm.away} tone="sky" />
              </div>
              <ComparativeStatsCard home={prediction.comparative.home} away={prediction.comparative.away} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
