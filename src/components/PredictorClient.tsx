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
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <TeamSelector label="Equipo local" teams={teams} value={homeTeamId} onChange={setHomeTeamId} disabledTeamId={awayTeamId} />
        <TeamSelector label="Equipo visitante" teams={teams} value={awayTeamId} onChange={setAwayTeamId} disabledTeamId={homeTeamId} />
        <button
          onClick={handleCalculate}
          disabled={!canCalculate || loading}
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Calculando…" : "Calcular"}
        </button>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="ml-auto rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {refreshing ? "Actualizando…" : "Refrescar standings"}
        </button>
      </div>

      {fetchedAt && (
        <p className="text-xs text-neutral-400">Datos actualizados: {new Date(fetchedAt).toLocaleString()}</p>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {prediction && (
        <div className="flex flex-col gap-6">
          <h2 className="text-lg font-semibold">
            {prediction.homeTeam} vs {prediction.awayTeam}
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
