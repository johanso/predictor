"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatPercent } from "@/lib/format";
import { computeKellyStake } from "@/lib/betting/kelly";
import { BET_MARKETS, type BetMarket } from "@/lib/betting/settle";
import type { FixtureOption } from "@/components/FixturesList";
import type { EnrichedMatchPrediction } from "@/types/domain";

export function BetSlipCard({
  competitionCode,
  homeTeamId,
  awayTeamId,
  prediction,
  fixtures,
}: {
  competitionCode: string;
  homeTeamId: number;
  awayTeamId: number;
  prediction: EnrichedMatchPrediction;
  fixtures: FixtureOption[];
}) {
  const fixture = useMemo(
    () => fixtures.find((f) => f.homeTeamId === homeTeamId && f.awayTeamId === awayTeamId),
    [fixtures, homeTeamId, awayTeamId]
  );

  const marketProbabilities = useMemo<Record<BetMarket, number>>(() => {
    const line15 = prediction.overUnder.find((ou) => ou.line === 1.5);
    const line25 = prediction.overUnder.find((ou) => ou.line === 2.5);
    return {
      home: prediction.oneXTwo.homeWin.probability,
      draw: prediction.oneXTwo.draw.probability,
      away: prediction.oneXTwo.awayWin.probability,
      btts_yes: prediction.btts.yes.probability,
      btts_no: prediction.btts.no.probability,
      over_1_5: line15?.over.probability ?? 0,
      under_1_5: line15?.under.probability ?? 0,
      over_2_5: line25?.over.probability ?? 0,
      under_2_5: line25?.under.probability ?? 0,
      double_1x: prediction.doubleChance.oneX.probability,
      double_12: prediction.doubleChance.oneTwo.probability,
      double_x2: prediction.doubleChance.xTwo.probability,
    };
  }, [prediction]);

  const [market, setMarket] = useState<BetMarket>("home");
  const [oddsInput, setOddsInput] = useState("");
  const [stakeInput, setStakeInput] = useState("");
  const [bankroll, setBankroll] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [stakeTouched, setStakeTouched] = useState(false);
  const [lastMarket, setLastMarket] = useState(market);

  useEffect(() => {
    fetch("/api/bankroll")
      .then((r) => r.json())
      .then((d) => setBankroll(d.currentBalance))
      .catch(() => setBankroll(null));
  }, []);

  const odds = Number(oddsInput);
  const kelly = odds > 1 && bankroll !== null ? computeKellyStake(marketProbabilities[market], odds, bankroll) : null;

  // Derived-state-during-render (React's recommended alternative to an effect
  // here): switching markets resets the "touched" flag so the field goes back
  // to tracking the fresh suggestion, without a setState-in-effect cascade.
  if (market !== lastMarket) {
    setLastMarket(market);
    setStakeTouched(false);
  }
  const suggestedStakeText = kelly ? kelly.suggestedStake.toFixed(2) : "";
  if (!stakeTouched && stakeInput !== suggestedStakeText) {
    setStakeInput(suggestedStakeText);
  }

  if (!fixture) {
    return (
      <Card title="Registrar apuesta">
        <p className="text-xs text-ink-soft">
          Solo puedes registrar apuestas sobre partidos programados. Elige el enfrentamiento desde la lista de
          próximos partidos en vez de armarlo manualmente con los selectores.
        </p>
      </Card>
    );
  }

  async function handleSubmit() {
    if (!fixture) return;
    const stakeValue = Number(stakeInput);
    if (!(odds > 1) || !(stakeValue >= 0)) return;
    setStatus("saving");
    setError(null);
    try {
      const marketOption = BET_MARKETS.find((m) => m.value === market)!;
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitionCode,
          homeTeamId,
          homeTeamName: prediction.homeTeam,
          awayTeamId,
          awayTeamName: prediction.awayTeam,
          matchUtcDate: fixture.utcDate,
          market,
          marketLabel: marketOption.label,
          modelProbability: marketProbabilities[market],
          odds,
          stake: stakeValue,
          suggestedStake: kelly?.suggestedStake ?? 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo registrar la apuesta.");
      setStatus("saved");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Error desconocido.");
    }
  }

  if (status === "saved") {
    return (
      <Card title="Registrar apuesta">
        <Pill tone="pitch">Apuesta registrada ✓</Pill>
        <button
          onClick={() => {
            setStatus("idle");
            setOddsInput("");
            setStakeTouched(false);
          }}
          className="label-eyebrow mt-2 block text-[0.65rem] text-ink-soft hover:text-pitch"
        >
          Registrar otra
        </button>
      </Card>
    );
  }

  return (
    <Card title="Registrar apuesta">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="label-eyebrow text-xs text-ink-soft">Mercado</span>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value as BetMarket)}
            className="border border-line bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus:border-pitch"
          >
            {BET_MARKETS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label} — {formatPercent(marketProbabilities[m.value])} (cuota justa {(1 / marketProbabilities[m.value]).toFixed(2)})
              </option>
            ))}
          </select>
        </label>

        <div className="flex gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="label-eyebrow text-xs text-ink-soft">Cuota real</span>
            <input
              type="number"
              step="0.01"
              min="1.01"
              value={oddsInput}
              onChange={(e) => setOddsInput(e.target.value)}
              placeholder="ej. 2.10"
              className="w-full min-w-0 border border-line bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus:border-pitch"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="label-eyebrow text-xs text-ink-soft">Stake</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={stakeInput}
              onChange={(e) => {
                setStakeInput(e.target.value);
                setStakeTouched(true);
              }}
              className="w-full min-w-0 border border-line bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus:border-pitch"
            />
          </label>
        </div>

        {odds > 1 && bankroll !== null && bankroll <= 0 && (
          <p className="text-[0.65rem] text-gold">
            Tu banca actual es {bankroll.toFixed(2)} — configura una banca inicial en{" "}
            <Link href="/apuestas" className="underline hover:text-pitch">
              /apuestas
            </Link>{" "}
            para que se pueda sugerir un stake.
          </p>
        )}
        {kelly && bankroll !== null && bankroll > 0 && (
          <p className="text-[0.65rem] text-ink-soft">
            {kelly.hasEdge
              ? `Sugerido (Kelly/4): ${kelly.suggestedStake.toFixed(2)} (${(kelly.fraction * 100).toFixed(1)}% de la banca).`
              : "La cuota ingresada no supera la cuota justa del modelo — no hay ventaja, el stake sugerido es 0."}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!(odds > 1) || status === "saving"}
          className="label-eyebrow bg-ink px-4 py-2 text-xs text-paper transition-colors hover:bg-pitch disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "saving" ? "Guardando…" : "Registrar apuesta"}
        </button>
        {status === "error" && error && <p className="text-[0.65rem] text-red">{error}</p>}
      </div>
    </Card>
  );
}
