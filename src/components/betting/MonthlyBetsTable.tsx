"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatPercent } from "@/lib/format";
import type { BetModel } from "@/generated/prisma/models";

const STATUS_TONE = { pending: "gold", won: "pitch", lost: "red", void: "neutral" } as const;
const SELECT = "border border-line bg-paper-raised px-2 py-1.5 text-xs text-ink-soft outline-none focus:border-pitch";
const STATUS_LABEL = { pending: "Pendiente", won: "Ganada", lost: "Perdida", void: "Anulada" } as const;

type SortKey = "date" | "odds" | "stake" | "profit";

export function MonthlyBetsTable({ bets }: { bets: BetModel[] }) {
  const router = useRouter();
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");

  // Only the sources actually present this month — an empty option would just be a
  // dead end.
  const sources = useMemo(() => [...new Set(bets.map((b) => b.source))].sort(), [bets]);

  const visible = useMemo(() => {
    const filtered = bets.filter(
      (b) => (sourceFilter === "all" || b.source === sourceFilter) && (statusFilter === "all" || b.status === statusFilter)
    );
    // Descending on every key: the interesting end of each is the top one — biggest
    // stake, longest price, best and worst results.
    return filtered.sort((a, b) => {
      if (sortKey === "odds") return b.odds - a.odds;
      if (sortKey === "stake") return b.stake - a.stake;
      if (sortKey === "profit") return (b.profit ?? 0) - (a.profit ?? 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [bets, sourceFilter, statusFilter, sortKey]);

  // Totals reflect what is on screen, so a filtered view answers "how is this
  // tipster doing this month" without mental arithmetic.
  const shown = useMemo(() => {
    const resolved = visible.filter((b) => b.status === "won" || b.status === "lost");
    const staked = resolved.reduce((s, b) => s + b.stake, 0);
    const profit = resolved.reduce((s, b) => s + (b.profit ?? 0), 0);
    return { count: visible.length, resolved: resolved.length, staked, profit, yieldPct: staked > 0 ? profit / staked : null };
  }, [visible]);

  async function handleDelete(id: number) {
    await fetch(`/api/bets/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function settle(id: number, action: "void" | "won" | "lost") {
    await fetch(`/api/bets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    router.refresh();
  }

  return (
    <Card title="Apuestas del mes" className="overflow-x-auto">
      {bets.length === 0 ? (
        <p className="text-sm text-ink-soft">Sin apuestas registradas este mes.</p>
      ) : (
        <>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="label-eyebrow text-[0.65rem] text-ink-soft">Fuente</span>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className={SELECT}>
              <option value="all">Todas</option>
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-eyebrow text-[0.65rem] text-ink-soft">Estado</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={SELECT}>
              <option value="all">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="won">Ganadas</option>
              <option value="lost">Perdidas</option>
              <option value="void">Anuladas</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label-eyebrow text-[0.65rem] text-ink-soft">Ordenar por</span>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={SELECT}>
              <option value="date">Fecha</option>
              <option value="odds">Cuota</option>
              <option value="stake">Stake</option>
              <option value="profit">Beneficio</option>
            </select>
          </label>

          <p className="font-numeric ml-auto pb-2 text-[0.65rem] text-ink-soft">
            {shown.count} de {bets.length}
            {shown.resolved > 0 && (
              <>
                {" · "}
                <span className={shown.profit >= 0 ? "text-pitch" : "text-red"}>
                  {shown.profit >= 0 ? "+" : ""}
                  {shown.profit.toFixed(2)}
                </span>
                {shown.yieldPct !== null && ` (${formatPercent(shown.yieldPct)} yield)`}
              </>
            )}
          </p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="label-eyebrow border-b border-line text-left text-xs text-ink-soft">
              <th className="px-2 py-2 font-normal">Fecha</th>
              <th className="px-2 py-2 font-normal">Partido</th>
              <th className="px-2 py-2 font-normal">Fuente</th>
              <th className="px-2 py-2 font-normal">Mercado</th>
              <th className="font-numeric px-2 py-2 text-right font-normal">Prob.</th>
              <th className="font-numeric px-2 py-2 text-right font-normal">Cuota</th>
              <th className="font-numeric px-2 py-2 text-right font-normal">Stake</th>
              <th className="px-2 py-2 text-center font-normal">Estado</th>
              <th className="font-numeric px-2 py-2 text-right font-normal">Profit</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr key={b.id} className="border-b border-line last:border-0">
                <td className="px-2 py-2 text-xs text-ink-soft">{new Date(b.createdAt).toLocaleDateString("es")}</td>
                <td className="px-2 py-2">
                  <span className="text-pitch">{b.homeTeamName}</span> <span className="text-ink-soft">vs</span>{" "}
                  <span className="text-sky">{b.awayTeamName}</span>
                </td>
                <td className="px-2 py-2">
                  <Pill tone={b.isManual ? "sky" : "pitch"}>{b.source}</Pill>
                </td>
                <td className="px-2 py-2 text-xs text-ink-soft">{b.marketLabel}</td>
                <td className="font-numeric px-2 py-2 text-right text-ink-soft">
                  {b.modelProbability !== null ? formatPercent(b.modelProbability) : <span className="opacity-40">—</span>}
                </td>
                <td className="font-numeric px-2 py-2 text-right">{b.odds.toFixed(2)}</td>
                <td className="font-numeric px-2 py-2 text-right">{b.stake.toFixed(2)}</td>
                <td className="px-2 py-2 text-center">
                  <Pill tone={STATUS_TONE[b.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                    {STATUS_LABEL[b.status as keyof typeof STATUS_LABEL] ?? b.status}
                  </Pill>
                </td>
                <td className={`font-numeric px-2 py-2 text-right font-semibold ${(b.profit ?? 0) >= 0 ? "text-pitch" : "text-red"}`}>
                  {b.profit !== null ? b.profit.toFixed(2) : "—"}
                </td>
                <td className="px-2 py-2 text-right">
                  {b.status === "pending" && (
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      {/* Closing by hand is offered only for manual bets: a model bet is
                          settled against the real result, and letting it be marked by
                          hand would make the yield describe something other than what
                          actually happened. */}
                      {b.isManual && (
                        <>
                          <button
                            onClick={() => settle(b.id, "won")}
                            className="label-eyebrow text-[0.6rem] text-ink-soft hover:text-pitch"
                            title="Marcar como ganada"
                          >
                            Ganada
                          </button>
                          <button
                            onClick={() => settle(b.id, "lost")}
                            className="label-eyebrow text-[0.6rem] text-ink-soft hover:text-red"
                            title="Marcar como perdida"
                          >
                            Perdida
                          </button>
                        </>
                      )}
                      <button onClick={() => settle(b.id, "void")} className="label-eyebrow text-[0.6rem] text-ink-soft hover:text-gold" title="El partido se pospuso o canceló — no cuenta para profit/yield">
                        Anular
                      </button>
                      <button onClick={() => handleDelete(b.id)} className="label-eyebrow text-[0.6rem] text-ink-soft hover:text-red" title="Borrar por error de carga">
                        Borrar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="py-4 text-center text-xs text-ink-soft">Ninguna apuesta coincide con el filtro.</p>
        )}
        </>
      )}
    </Card>
  );
}
