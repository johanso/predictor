"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";

/**
 * Logs a bet the app had nothing to do with — a tipster's pick, another sport, a
 * league the API does not carry. It counts toward the bankroll and the monthly
 * numbers exactly like any other, which is the point: the record is only honest if
 * it holds every bet, not just the ones the model produced.
 *
 * No model probability is asked for and none is invented. The source is free text so
 * that yield can later be read per origin, and it is settled by hand because nothing
 * upstream knows the result.
 */
export function ManualBetForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [market, setMarket] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [odds, setOdds] = useState("");
  const [stake, setStake] = useState("");

  const oddsValue = Number(odds);
  const stakeValue = Number(stake);
  const valid =
    source.trim() && home.trim() && away.trim() && market.trim() && date && oddsValue > 1 && stakeValue >= 0;

  async function handleSubmit() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isManual: true,
          source: source.trim(),
          homeTeamName: home.trim(),
          awayTeamName: away.trim(),
          marketLabel: market.trim(),
          matchUtcDate: new Date(`${date}T12:00:00Z`).toISOString(),
          odds: oddsValue,
          stake: stakeValue,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar.");
      setHome("");
      setAway("");
      setMarket("");
      setOdds("");
      setStake("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="label-eyebrow w-fit border border-line px-3 py-2 text-xs text-ink-soft transition-colors hover:border-pitch hover:text-pitch print:hidden"
      >
        + Apuesta manual
      </button>
    );
  }

  const field = "border border-line bg-paper-raised px-3 py-2 text-sm text-ink outline-none focus:border-pitch";

  return (
    <Card title="Apuesta manual">
      <p className="mb-4 text-xs text-ink-soft">
        Para apuestas que no salieron del modelo — otro deporte, otra liga, o el pick de alguien más.
        Suma a la banca y a las estadísticas igual que el resto, y la cierras tú a mano.
      </p>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1.5">
            <span className="label-eyebrow text-xs text-ink-soft">Fuente</span>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="ej. Tipster X, propia…" className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-eyebrow text-xs text-ink-soft">Fecha del evento</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`font-numeric ${field}`} />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1.5">
            <span className="label-eyebrow text-xs text-ink-soft">Local / jugador 1</span>
            <input value={home} onChange={(e) => setHome(e.target.value)} placeholder="ej. Lakers" className={field} />
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1.5">
            <span className="label-eyebrow text-xs text-ink-soft">Visitante / jugador 2</span>
            <input value={away} onChange={(e) => setAway(e.target.value)} placeholder="ej. Celtics" className={field} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="label-eyebrow text-xs text-ink-soft">Apuesta</span>
          <input value={market} onChange={(e) => setMarket(e.target.value)} placeholder="ej. Hándicap -4.5 Lakers" className={field} />
        </label>

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="label-eyebrow text-xs text-ink-soft">Cuota</span>
            <input type="number" step="0.01" min="1.01" value={odds} onChange={(e) => setOdds(e.target.value)} placeholder="1.90" className={`font-numeric w-28 ${field}`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-eyebrow text-xs text-ink-soft">Stake</span>
            <input type="number" step="0.01" min="0" value={stake} onChange={(e) => setStake(e.target.value)} placeholder="10" className={`font-numeric w-28 ${field}`} />
          </label>
        </div>

        {error && <p className="text-[0.65rem] text-red">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={!valid || saving}
            className="label-eyebrow bg-ink px-4 py-2 text-xs text-paper transition-colors hover:bg-pitch disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Guardando…" : "Registrar apuesta"}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="label-eyebrow border border-line px-4 py-2 text-xs text-ink-soft transition-colors hover:border-line hover:text-ink"
          >
            Cancelar
          </button>
        </div>
      </div>
    </Card>
  );
}
