"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatPercent } from "@/lib/format";
import { computeKellyStake } from "@/lib/betting/kelly";
import { marketProbabilities } from "@/lib/betting/marketProbabilities";
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
  { title: "Marca cada equipo", markets: ["home_scores", "away_scores"] },
];

const LABELS = Object.fromEntries(BET_MARKETS.map((m) => [m.value, m.label])) as Record<BetMarket, string>;

interface BookOdds {
  bookmaker: string;
  markets: Partial<Record<BetMarket, number>>;
  fetchedAt: string;
}

interface FeedState {
  /** Which fixture these odds belong to; anything else means we're still loading. */
  loadedFor: string | null;
  supported: boolean;
  books: BookOdds[];
  selected: string | null;
  fetchedAt: string | null;
  error: string | null;
}

/** Markets whose prices should sum to just over 1 at a fairly priced book. */
const MARGIN_GROUPS: { label: string; markets: BetMarket[] }[] = [
  { label: "1X2", markets: ["home", "draw", "away"] },
  { label: "Ambos marcan", markets: ["btts_yes", "btts_no"] },
  { label: "Over/Under 1.5", markets: ["over_1_5", "under_1_5"] },
  { label: "Over/Under 2.5", markets: ["over_2_5", "under_2_5"] },
];

function minutesAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  return `hace ${hours} h`;
}

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

  const marketProbs = useMemo(
    () => marketProbabilities(prediction, prediction.derivedMarkets),
    [prediction]
  );

  const [oddsInputs, setOddsInputs] = useState<Partial<Record<BetMarket, string>>>({});
  const [feed, setFeed] = useState<FeedState>({
    loadedFor: null,
    supported: true,
    books: [],
    selected: null,
    fetchedAt: null,
    error: null,
  });
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

  // Real bookmaker prices, fetched once per fixture. The server caches them and
  // batches a whole matchday into one upstream request, so this is cheap to call.
  const fixtureDate = fixture?.utcDate;
  const fixtureKey = fixtureDate ? `${competitionCode}|${prediction.homeTeam}|${prediction.awayTeam}|${fixtureDate}` : null;
  // Derived rather than stored: if the loaded odds don't belong to the fixture on
  // screen, we are still fetching. Avoids a setState purely to flag "loading".
  const oddsLoading = fixtureKey !== null && feed.loadedFor !== fixtureKey;

  useEffect(() => {
    if (!fixtureDate || !fixtureKey) return;
    let cancelled = false;

    const params = new URLSearchParams({
      competitionCode,
      homeTeamName: prediction.homeTeam,
      awayTeamName: prediction.awayTeam,
      utcDate: fixtureDate,
    });
    fetch(`/api/odds?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const books: BookOdds[] = d.odds ?? [];
        setFeed({
          loadedFor: fixtureKey,
          supported: Boolean(d.configured && d.supported),
          books,
          selected: books[0]?.bookmaker ?? null,
          fetchedAt: books[0]?.fetchedAt ?? null,
          error: d.error ?? null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFeed({
          loadedFor: fixtureKey,
          supported: false,
          books: [],
          selected: null,
          fetchedAt: null,
          error: "No se pudieron cargar las cuotas.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [competitionCode, prediction.homeTeam, prediction.awayTeam, fixtureDate, fixtureKey]);

  function applyBook(bookmaker: string) {
    const book = feed.books.find((b) => b.bookmaker === bookmaker);
    if (!book) return;
    setFeed((f) => ({ ...f, selected: bookmaker, fetchedAt: book.fetchedAt }));
    setOddsInputs((prev) => {
      const next = { ...prev };
      for (const [market, price] of Object.entries(book.markets)) {
        if (typeof price === "number" && price > 1) next[market as BetMarket] = price.toFixed(2);
      }
      return next;
    });
  }

  const oddsOf = (m: BetMarket) => Number(oddsInputs[m] ?? "");
  /** Expected value per unit staked: p x odds - 1. Positive means the model prices it higher than the book. */
  const edgeOf = (m: BetMarket) => {
    const o = oddsOf(m);
    return o > 1 ? marketProbs[m] * o - 1 : null;
  };

  /**
   * The edge in percentage points: how far the model's probability sits above the
   * one the price implies. This, not the EV percentage, is what ranks the rows.
   *
   * EV% divides by the stake, so the same disagreement looks far bigger at long
   * odds — 4 points of edge reads as +17% at 3.90 but +9% at 2.20. Ranking by EV%
   * therefore steers you toward longshots, where a small error in the model's
   * probability moves the result most. Percentage points compare like with like.
   */
  const pointsOf = (m: BetMarket) => {
    const o = oddsOf(m);
    return o > 1 ? marketProbs[m] - 1 / o : null;
  };

  // The two strongest positive edges, best first. Highlighted in the table so the
  // candidates stand out without having to read every row.
  const topPicks = BET_MARKETS.map((m) => ({ market: m.value, points: pointsOf(m.value) }))
    .filter((r): r is { market: BetMarket; points: number } => r.points !== null && r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 2);
  const rankOf = new Map<BetMarket, number>(topPicks.map((p, i) => [p.market, i + 1]));

  const valueCount = BET_MARKETS.filter((m) => (edgeOf(m.value) ?? 0) > 0).length;
  const filledCount = BET_MARKETS.filter((m) => oddsOf(m.value) > 1).length;

  // A complete two- or three-way market should imply just over 100%. Much more than
  // that is a mistyped price far more often than a real margin, and both sides of the
  // pair then read as nonsense — worth catching before it drives a bet.
  const marginWarnings = MARGIN_GROUPS.flatMap((group) => {
    const prices = group.markets.map(oddsOf);
    if (prices.some((p) => !(p > 1))) return [];
    const implied = prices.reduce((s, p) => s + 1 / p, 0);
    if (implied < 1) {
      return [`${group.label}: las cuotas suman ${(implied * 100).toFixed(1)}% — por debajo de 100%, revisa que sean de la misma casa.`];
    }
    if (implied > 1.12) {
      return [`${group.label}: margen del ${((implied - 1) * 100).toFixed(1)}%, demasiado alto para un mercado principal. Revisa si te equivocaste al teclear.`];
    }
    return [];
  });

  const selectedKelly =
    selected !== null && oddsOf(selected) > 1 && bankroll !== null
      ? computeKellyStake(marketProbs[selected], oddsOf(selected), bankroll)
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
          modelProbability: marketProbs[selected],
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
    <Card title="">
      <p className="mb-3 text-xs text-ink-soft">
        Introduce las cuotas reales de tu casa. Se marca en verde donde el modelo las considera altas —
        recuerda que eso solo significa que <strong className="text-ink">el modelo discrepa del mercado</strong>,
        no que tenga razón.
      </p>

      {!oddsLoading && feed.books.length > 0 && (
        <div className="mb-4 flex flex-wrap items-end gap-3 border border-line bg-paper-raised p-3">
          <label className="flex flex-col gap-1.5">
            <span className="label-eyebrow text-xs text-ink-soft">Casa de apuestas</span>
            <select
              value={feed.selected ?? ""}
              onChange={(e) => applyBook(e.target.value)}
              className="border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-pitch"
            >
              {feed.books.map((b) => (
                <option key={b.bookmaker} value={b.bookmaker}>
                  {b.bookmaker} ({Object.keys(b.markets).length} mercados)
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => feed.selected && applyBook(feed.selected)}
            className="label-eyebrow border border-line px-3 py-2 text-xs text-ink-soft transition-colors hover:border-gold hover:text-gold"
          >
            Rellenar cuotas
          </button>
          {feed.fetchedAt && <span className="pb-2 text-[0.65rem] text-ink-soft">Actualizado {minutesAgo(feed.fetchedAt)}</span>}
        </div>
      )}

      {!oddsLoading && feed.supported && feed.books.length === 0 && (
        <p className="mb-4 text-[0.65rem] text-gold">
          No se encontraron cuotas para este partido. Puedes escribirlas a mano igualmente.
        </p>
      )}
      {feed.error && <p className="mb-4 text-[0.65rem] text-gold">{feed.error}</p>}

      {marginWarnings.length > 0 && (
        <div className="mb-4 border-l-4 border-red bg-red-dim px-3 py-2">
          {marginWarnings.map((w) => (
            <p key={w} className="text-[0.65rem] text-red">
              {w}
            </p>
          ))}
        </div>
      )}

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
                  const p = marketProbs[m];
                  const edge = edgeOf(m);
                  const isValue = edge !== null && edge > 0;
                  const done = registered.includes(m);
                  const rank = rankOf.get(m);
                  const points = pointsOf(m);
                  return (
                    <tr
                      key={m}
                      className={`border-b border-line last:border-0 ${
                        selected === m ? "bg-paper-raised" : rank === 1 ? "bg-pitch-dim" : rank === 2 ? "bg-pitch-dim/50" : ""
                      }`}
                      title={rank ? `${rank === 1 ? "Mejor" : "Segunda mejor"} relación: el modelo la da ${(points! * 100).toFixed(1)} puntos por encima del ${((1 / oddsOf(m)) * 100).toFixed(1)}% que implica la cuota.` : undefined}
                    >
                      <td
                        className={`px-2 py-1.5 whitespace-nowrap ${
                          rank === 1 ? "border-l-4 border-pitch font-medium" : rank === 2 ? "border-l-4 border-pitch/40" : "border-l-4 border-transparent"
                        }`}
                      >
                        {LABELS[m]}
                        {rank && (
                          <span className={`font-numeric ml-2 text-[0.6rem] ${rank === 1 ? "text-pitch" : "text-ink-soft"}`}>
                            +{(points! * 100).toFixed(1)} pp
                          </span>
                        )}
                      </td>
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
            <span className="text-result-win">{valueCount} por encima de la cuota justa del modelo.</span>
          )}
          {topPicks.length > 0 && (
            <>
              {" "}
              Resaltadas las {topPicks.length === 1 ? "mejor" : "dos mejores"} por{" "}
              <strong className="text-ink">puntos de probabilidad</strong> (lo que el modelo da por encima de lo que implica
              la cuota), no por porcentaje de valor — ese último premia las cuotas largas, que son las más frágiles.
            </>
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
