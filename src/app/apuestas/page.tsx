import Link from "next/link";
import { getBankrollStatus, getMonthlySummaries, getBetsForMonth, getBankrollHistory } from "@/lib/betting/stats";
import { BankrollCard } from "@/components/betting/BankrollCard";
import { BankrollChart } from "@/components/betting/BankrollChart";
import { MonthlyBetsTable } from "@/components/betting/MonthlyBetsTable";
import { SettleButton } from "@/components/betting/SettleButton";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { formatPercent } from "@/lib/format";

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "pitch" | "red" }) {
  const toneClass = tone === "pitch" ? "text-pitch" : tone === "red" ? "text-red" : "text-ink";
  return (
    <div className="flex flex-col gap-1 border border-line bg-paper-raised p-4 text-center">
      <span className={`font-numeric text-2xl font-semibold ${toneClass}`}>{value}</span>
      <span className="label-eyebrow text-xs text-ink-soft">{label}</span>
    </div>
  );
}

export default async function ApuestasPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month: monthParam } = await searchParams;
  const [bankroll, summaries, history, pendingCount, lastFetched] = await Promise.all([
    getBankrollStatus(),
    getMonthlySummaries(),
    getBankrollHistory(),
    prisma.bet.count({ where: { status: "pending" } }),
    // Most recent results fetch across the competitions in play — what "up to date"
    // actually means for settlement.
    prisma.competition.findFirst({ where: { fetchedAt: { not: null } }, orderBy: { fetchedAt: "desc" }, select: { fetchedAt: true } }),
  ]);

  const activeMonth = monthParam && summaries.some((s) => s.month === monthParam) ? monthParam : (summaries[0]?.month ?? null);
  const activeSummary = summaries.find((s) => s.month === activeMonth) ?? null;
  const bets = activeMonth ? await getBetsForMonth(activeMonth) : [];

  return (
    <>
      <header className="border-b-2 border-gold bg-chrome text-chrome-ink">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Link href="/" className="label-eyebrow text-xs text-chrome-ink/60 hover:text-gold">
            ← Ligas
          </Link>
          <h1 className="mt-2 text-3xl font-semibold uppercase tracking-tight">Control de apuestas</h1>
          <p className="mt-2 max-w-lg text-sm text-chrome-ink/70">
            Registro real de tus apuestas — cuotas y stakes que ingresaste a mano, liquidado
            contra los resultados reales. Se actualiza solo al refrescar una liga; usa
            &quot;Actualizar resultados&quot; para forzarlo cuando un partido ya terminó.
          </p>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        <SettleButton pendingCount={pendingCount} lastCheckedAt={lastFetched?.fetchedAt?.toISOString() ?? null} />
        <BankrollCard status={bankroll} />
        <BankrollChart points={history} startingBalance={bankroll.startingBalance} />

        {summaries.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-soft">
              Todavía no has registrado ninguna apuesta. Calcula un partido en el predictor y usa
              la tarjeta &quot;Registrar apuesta&quot; sobre un fixture programado.
            </p>
          </Card>
        ) : (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {summaries.map((s) => (
                <Link
                  key={s.month}
                  href={`/apuestas?month=${s.month}`}
                  className={`label-eyebrow shrink-0 border px-3 py-1.5 text-xs transition-colors ${
                    s.month === activeMonth
                      ? "border-pitch bg-pitch-dim text-pitch"
                      : "border-line text-ink-soft hover:border-pitch hover:text-pitch"
                  }`}
                >
                  {s.month}
                </Link>
              ))}
            </div>

            {activeSummary && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <StatTile label="Apostado" value={activeSummary.totalStaked.toFixed(2)} />
                <StatTile
                  label="Profit"
                  value={activeSummary.totalProfit.toFixed(2)}
                  tone={activeSummary.totalProfit >= 0 ? "pitch" : "red"}
                />
                <StatTile label="Yield" value={activeSummary.yieldPct !== null ? formatPercent(activeSummary.yieldPct) : "—"} />
                <StatTile label="% Acierto" value={activeSummary.winRate !== null ? formatPercent(activeSummary.winRate) : "—"} />
                <StatTile label="Pendientes" value={String(activeSummary.pendingBets)} />
                <StatTile label="Anuladas" value={String(activeSummary.voidBets)} />
              </div>
            )}

            <MonthlyBetsTable bets={bets} />
          </>
        )}
      </main>
    </>
  );
}
