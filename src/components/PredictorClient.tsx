"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TeamSelector } from "@/components/TeamSelector";
import { OneXTwoCard } from "@/components/ResultsPanel/OneXTwoCard";
import { ExactScoreGrid } from "@/components/ResultsPanel/ExactScoreGrid";
import { BttsCard } from "@/components/ResultsPanel/BttsCard";
import { DoubleChanceCard } from "@/components/ResultsPanel/DoubleChanceCard";
import { OverUnderTable } from "@/components/ResultsPanel/OverUnderTable";
import type { MatchPrediction } from "@/types/domain";

interface TeamOption {
  teamId: number;
  teamName: string;
}

export function PredictorClient({
  competitionCode,
  teams,
  fetchedAt,
}: {
  competitionCode: string;
  teams: TeamOption[];
  fetchedAt: string | null;
}) {
  const router = useRouter();
  const [homeTeamId, setHomeTeamId] = useState<number | null>(null);
  const [awayTeamId, setAwayTeamId] = useState<number | null>(null);
  const [prediction, setPrediction] = useState<MatchPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCalculate = homeTeamId !== null && awayTeamId !== null && homeTeamId !== awayTeamId;

  async function handleCalculate() {
    if (!canCalculate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitionCode, homeTeamId, awayTeamId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo calcular la predicción.");
      setPrediction(data as MatchPrediction);
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
      await fetch(`/api/leagues/${competitionCode}/standings?refresh=1`);
      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4 border border-line bg-paper-raised p-4">
        <TeamSelector label="Local" tone="pitch" teams={teams} value={homeTeamId} onChange={setHomeTeamId} disabledTeamId={awayTeamId} />
        <span className="label-eyebrow pb-2 text-xs text-ink-soft">vs</span>
        <TeamSelector label="Visitante" tone="sky" teams={teams} value={awayTeamId} onChange={setAwayTeamId} disabledTeamId={homeTeamId} />
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
        <div className="flex flex-col gap-6">
          <h2 className="flex items-baseline gap-3 text-2xl font-semibold uppercase tracking-tight">
            <span className="text-pitch">{prediction.homeTeam}</span>
            <span className="label-eyebrow text-sm text-ink-soft">vs</span>
            <span className="text-sky">{prediction.awayTeam}</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <OneXTwoCard homeWin={prediction.oneXTwo.homeWin} draw={prediction.oneXTwo.draw} awayWin={prediction.oneXTwo.awayWin} />
            <BttsCard yes={prediction.btts.yes} no={prediction.btts.no} />
            <DoubleChanceCard oneX={prediction.doubleChance.oneX} oneTwo={prediction.doubleChance.oneTwo} xTwo={prediction.doubleChance.xTwo} />
          </div>
          <ExactScoreGrid scores={prediction.exactScores} homeTeam={prediction.homeTeam} awayTeam={prediction.awayTeam} />
          <OverUnderTable lines={prediction.overUnder} />
        </div>
      )}
    </div>
  );
}
