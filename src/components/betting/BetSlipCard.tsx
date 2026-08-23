"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatPercent } from "@/lib/format";
import { computeKellyStake } from "@/lib/betting/kelly";
import { BET_MARKETS, type BetMarket } from "@/lib/betting/settle";
import { marketReliability, reliabilityVerdict, RELIABILITY_VERDICT_LABEL } from "@/lib/betting/reliability";
import type { FixtureOption } from "@/components/FixturesList";
import type { EnrichedMatchPrediction } from "@/types/domain";

// Visual grouping only — the order the odds appear on a typical bookmaker's coupon,
// so entering a whole match's prices is a top-to-bottom pass.
const GROUPS: { title: string; markets: BetMarket[] }[] = [
  { title: "Resultado", markets: ["home", "draw", "away"] },
  { title: "Doble oportunidad", markets: ["double_1x", "double_12", "double_x2"] },
  { title: "Ambos equipos marcan", markets: ["btts_yes", "btts_no"] },
  { title: "Total de goles", markets: ["over_1_5", "under_1_5", "over_2_5", "under_2_5"] },
];

const LABELS = Object.fromEntries(BET_MARKETS.map((m) => [m.value, m.label])) as Record<BetMarket, string>;

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

  const [oddsInputs, setOddsInputs] = useState<Partial<Record<BetMarket, string>>>({});
  const [selected, setSelected] = useState<BetMarket | null>(null);
  const [stakeInput, setStakeInput] = useState("");
  const [stakeTouched, setStakeTouched] = useState(false);
  const [lastSelected, setLastSelected] = useState<BetMarket | null>(null);
  const [bankroll, setBankroll] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<BetMarket[]>([]);

  useEffect(() => {
    fetch("/api/bankroll")
      .then((r) => r.json())
      .then((d) => setBankroll(d.currentBalance))
      .catch(() => setBankroll(null));
  }, []);

  const oddsOf = (m: BetMarket) => Number(oddsInputs[m] ?? "");
  /** Expected value per unit staked: p x odds - 1. Positive means the model prices it higher than the book. */
  const edgeOf = (m: BetMarket) => {
    const o = oddsOf(m);
    return o > 1 ? marketProbabilities[m] * o - 1 : null;
  };

  const valueCount = BET_MARKETS.filter((m) => (edgeOf(m.value) ?? 0) > 0).length;
  const filledCount = BET_MARKETS.filter((m) => oddsOf(m.value) > 1).length;

  const selectedKelly =
    selected !== null && oddsOf(selected) > 1 && bankroll !== null
      ? computeKellyStake(marketProbabilities[selected], oddsOf(selected), bankroll)
      : null;

  // Derived-state-during-render: changing the selected market puts the stake field
  // back under the fresh Kelly suggestion without a setState-in-effect cascade.
  if (selected !== lastSelected) {
    setLastSelected(selected);
    setStakeTouched(false);
  }
  const suggestedStakeText = selectedKelly ? selectedKelly.suggestedStake.toFixed(2) : "";
  if (!stakeTouched && stakeInput !== suggestedStakeText) {
    setStakeInput(suggestedStakeText);
  }

  if (!fixture) {
    return (
      <Card title="Control de apuestas">
        <p className="text-xs text-ink-soft">
          Solo puedes registrar apuestas sobre partidos programados. Elige el enfrentamiento desde la lista de
          próximos partidos en vez de armarlo manualmente con los selectores.
        </p>
      </Card>
    );
  }

  async function handleSubmit() {
    if (!fixture || selected === null) return;
    const stakeValue = Number(stakeInput);
    const odds = oddsOf(selected);
    if (!(odds > 1) || !(stakeValue >= 0)) return;
    setStatus("saving");
    setError(null);
    try {
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
          market: selected,
          marketLabel: LABELS[selected],
          modelProbability: marketProbabilities[selected],
          odds,
          stake: stakeValue,
          suggestedStake: selectedKelly?.suggestedStake ?? 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo registrar la apuesta.");
      setRegistered((r) => [...r, selected]);
      setSelected(null);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Error desconocido.");
    }
  }

  return (
    <Card title="Control de apuestas">
      <p className="mb-3 text-xs text-ink-soft">
        Introduce las cuotas reales de tu casa. Se marca en verde donde el modelo las considera altas —
        recuerda que eso solo significa que <strong className="text-ink">el modelo discrepa del mercado</strong>,
        no que tenga razón.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="label-eyebrow border-b border-line text-left text-xs text-ink-soft">
              <th className="px-2 py-2 font-normal">Mercado</th>
              <th className="px-2 py-2 text-right font-normal">Modelo</th>
              <th className="px-2 py-2 text-right font-normal">Cuota justa</th>
              <th className="px-2 py-2 text-right font-normal">Tu cuota</th>
              <th className="px-2 py-2 text-right font-normal">Valor</th>
              <th className="px-2 py-2 font-normal" />
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => (
              <Fragment key={group.title}>
                <tr>
                  <td colSpan={6} className="label-eyebrow px-2 pt-3 pb-1 text-[0.6rem] text-ink-soft">
                    {group.title}
                  </td>
                </tr>
                {group.markets.map((m) => {
                  const p = marketProbabilities[m];
                  const edge = edgeOf(m);
                  const isValue = edge !== null && edge > 0;
                  const done = registered.includes(m);
                  return (
                    <tr key={m} className={`border-b border-line last:border-0 ${selected === m ? "bg-paper-raised" : ""}`}>
                      <td className="px-2 py-1.5 whitespace-nowrap">{LABELS[m]}</td>
                      <td className="font-numeric px-2 py-1.5 text-right text-ink-soft">{formatPercent(p)}</td>
                      <td className="font-numeric px-2 py-1.5 text-right text-ink-soft">{p > 0 ? (1 / p).toFixed(2) : "—"}</td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="1.01"
                          value={oddsInputs[m] ?? ""}
                          onChange={(e) => setOddsInputs((prev) => ({ ...prev, [m]: e.target.value }))}
                          placeholder="—"
                          className="font-numeric w-20 border border-line bg-paper-raised px-2 py-1 text-right text-sm text-ink outline-none focus:border-pitch"
                        />
                      </td>
                      <td
                        className={`font-numeric px-2 py-1.5 text-right ${
                          edge === null ? "text-ink-soft" : isValue ? "text-result-win" : "text-result-loss"
                        }`}
                      >
                        {edge === null ? "·" : `${edge > 0 ? "+" : ""}${(edge * 100).toFixed(1)}%`}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {done ? (
                          <Pill tone="pitch">✓</Pill>
                        ) : (
                          <button
                            onClick={() => setSelected(selected === m ? null : m)}
                            disabled={!(oddsOf(m) > 1)}
                            className="label-eyebrow border border-line px-2 py-1 text-[0.6rem] text-ink-soft transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            {selected === m ? "Cancelar" : "Elegir"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {filledCount > 0 && (
        <p className="mt-3 text-[0.65rem] text-ink-soft">
          {filledCount} cuota{filledCount === 1 ? "" : "s"} introducida{filledCount === 1 ? "" : "s"} ·{" "}
          {valueCount === 0 ? (
            "ninguna por encima de la cuota justa del modelo."
          ) : (
            <span className="text-result-win">
              {valueCount} por encima de la cuota justa del modelo.
            </span>
          )}
        </p>
      )}

      {selected !== null && (
        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="label-eyebrow text-xs text-ink-soft">Seleccionado</span>
              <span className="text-sm text-ink">
                {LABELS[selected]} @ {oddsOf(selected).toFixed(2)}
              </span>
            </div>
            <label className="flex flex-col gap-1">
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
                className="font-numeric w-28 border border-line bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus:border-pitch"
              />
            </label>
            <button
              onClick={handleSubmit}
              disabled={status === "saving"}
              className="label-eyebrow bg-ink px-4 py-2 text-xs text-paper transition-colors hover:bg-pitch disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "saving" ? "Guardando…" : "Registrar apuesta"}
            </button>
          </div>

          <p className="text-[0.65rem] text-ink-soft">
            Fiabilidad medida de este mercado: {RELIABILITY_VERDICT_LABEL[reliabilityVerdict(selected)]} (
            {marketReliability(selected).skillPct >= 0 ? "+" : ""}
            {marketReliability(selected).skillPct.toFixed(2)}% sobre la tasa base, t={marketReliability(selected).t.toFixed(2)}).
          </p>

          {bankroll !== null && bankroll <= 0 && (
            <p className="text-[0.65rem] text-gold">
              Tu banca actual es {bankroll.toFixed(2)} — configúrala en{" "}
              <Link href="/apuestas" className="underline hover:text-pitch">
                /apuestas
              </Link>{" "}
              para que se sugiera un stake.
            </p>
          )}
          {selectedKelly && bankroll !== null && bankroll > 0 && (
            <p className="text-[0.65rem] text-ink-soft">
              {selectedKelly.hasEdge
                ? `Sugerido (Kelly/4): ${selectedKelly.suggestedStake.toFixed(2)} (${(selectedKelly.fraction * 100).toFixed(1)}% de la banca).`
                : "La cuota no supera la cuota justa del modelo — sin ventaja, stake sugerido 0."}
            </p>
          )}
          {status === "error" && error && <p className="text-[0.65rem] text-red">{error}</p>}
        </div>
      )}

      <p className="mt-4 border-t border-line pt-3 text-[0.65rem] text-ink-soft">
        Medido sobre 825 partidos del Brasileirão (2023-2025), ningún mercado mostró señal
        estadísticamente distinguible del azar. Un valor positivo aquí es una discrepancia con la casa,
        no una ventaja demostrada.
      </p>
    </Card>
  );
}
