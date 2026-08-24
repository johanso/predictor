import type { ReactNode } from "react";
import Link from "next/link";
import { getPerformanceSummary, getCalibrationBuckets, getTrackedPredictions } from "@/lib/predictions/stats";
import { bttsPick, overUnderPick } from "@/lib/predictions/evaluate";
import { Card } from "@/components/ui/Card";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { Pill } from "@/components/ui/Pill";
import { APP_TIME_ZONE, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * One market's pick shown next to its outcome. The probability is the model's
 * confidence in the side it actually backed, so a "No" pick never displays the
 * "yes" percentage — see bttsPick/overUnderPick.
 */
function MarketCell({ pick, probability, correct }: { pick: ReactNode; probability: number | null; correct: boolean | null }) {
  const tone = correct === null ? "text-ink-soft" : correct ? "text-result-win" : "text-result-loss";
  return (
    <td className="px-2 py-2">
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className={`w-3 text-sm ${tone}`}>{correct === null ? "·" : correct ? "✓" : "✗"}</span>
        <span>{pick}</span>
        {probability !== null && <span className="font-numeric text-xs text-ink-soft">{formatPercent(probability)}</span>}
      </div>
    </td>
  );
}

function favoriteLabel(favorite: string): ReactNode {
  if (favorite === "home") return <span className="text-pitch">Local</span>;
  if (favorite === "away") return <span className="text-sky">Visitante</span>;
  return <span className="text-ink">Empate</span>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border border-line bg-paper-raised p-4 text-center">
      <span className="font-numeric text-2xl font-semibold text-ink">{value}</span>
      <span className="label-eyebrow text-xs text-ink-soft">{label}</span>
    </div>
  );
}

export default async function RendimientoPage() {
  const [summary, buckets, tracked] = await Promise.all([
    getPerformanceSummary(),
    getCalibrationBuckets(),
    getTrackedPredictions(),
  ]);

  return (
    <>
      <header className="border-b-2 border-gold bg-chrome text-chrome-ink">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Link href="/" className="label-eyebrow text-xs text-chrome-ink/60 hover:text-gold">
            ← Ligas
          </Link>
          <h1 className="mt-2 text-3xl font-semibold uppercase tracking-tight">Rendimiento del modelo</h1>
          <p className="mt-2 max-w-lg text-sm text-chrome-ink/70">
            Solo se evalúan los pronósticos que enviaste a autoevaluación — no todo lo que hayas
            calculado. Envía también los partidos parejos: medir la calibración exige ver todo el rango
            de probabilidades, no solo aquellos en los que el modelo se muestra seguro.
          </p>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-10">
        {summary.totalTracked === 0 ? (
          <Card>
            <p className="text-sm text-ink-soft">
              Todavía no has enviado ningún pronóstico a autoevaluación. Calcula cualquier partido con
              datos suficientes y usa el botón &quot;Enviar a autoevaluación&quot; para empezar a construir
              este historial.
            </p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatTile label="Pronósticos evaluados" value={String(summary.totalEvaluated)} />
              <StatTile label="Pendientes" value={String(summary.pending)} />
              <StatTile label="Error medio de goles" value={summary.meanGoalError !== null ? summary.meanGoalError.toFixed(2) : "—"} />
              <StatTile label="Acierto 1X2" value={summary.oneXTwoAccuracy !== null ? formatPercent(summary.oneXTwoAccuracy) : "—"} />
              <StatTile label="Acierto ambos marcan" value={summary.bttsAccuracy !== null ? formatPercent(summary.bttsAccuracy) : "—"} />
              <StatTile label="Acierto over/under 2.5" value={summary.overUnderAccuracy !== null ? formatPercent(summary.overUnderAccuracy) : "—"} />
            </div>

            <Card title="Calibración">
              <p className="mb-4 text-xs text-ink-soft">
                Por cada rango de probabilidad que el modelo le dio al favorito, qué porcentaje de esas
                veces realmente ganó. Si el modelo está bien calibrado, la barra debería acercarse al
                rango indicado.
              </p>
              {buckets.length === 0 ? (
                <p className="text-sm text-ink-soft">Aún no hay suficientes pronósticos evaluados para calibrar.</p>
              ) : (
                <div className="flex flex-col gap-4">
                  {buckets.map((b) => (
                    <ProbabilityBar
                      key={b.rangeLabel}
                      label={`Dijimos ${b.rangeLabel} (n=${b.count})`}
                      probability={b.hitRate ?? 0}
                      tone="gold"
                    />
                  ))}
                </div>
              )}
            </Card>

            <Card title="Historial de pronósticos enviados" className="overflow-x-auto">
              <p className="mb-4 text-xs text-ink-soft">
                Cada columna muestra <strong className="text-ink">qué eligió el modelo</strong> y con cuánta confianza en
                esa elección concreta. ✓ acertó · ✗ falló · · todavía sin jugar.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="label-eyebrow border-b border-line text-left text-xs text-ink-soft">
                    <th className="px-2 py-2 font-normal text-center">Fecha</th>
                    <th className="px-2 py-2 font-normal text-center">Partido</th>
                    <th className="px-2 py-2 font-normal text-center">Ganador (1X2)</th>
                    <th className="px-2 py-2 font-normal text-center">AEM</th>
                    <th className="px-2 py-2 font-normal text-center">Total goles</th>
                    <th className="px-2 py-2 font-normal text-center">Marcador</th>
                    <th className="font-numeric px-2 py-2 text-right font-normal">Real</th>
                  </tr>
                </thead>
                <tbody>
                  {tracked.map((p) => {
                    const btts = bttsPick(p.bttsYesProbability);
                    const ou = overUnderPick(p.over25Probability);
                    return (
                      <tr key={p.id} className="border-b border-line last:border-0">
                        <td className="px-2 py-2 text-xs whitespace-nowrap text-ink-soft">
                          {new Date(p.createdAt).toLocaleDateString("es", { timeZone: APP_TIME_ZONE })}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <span className="text-pitch">{p.homeTeamName}</span> <span className="text-ink-soft">vs</span>{" "}
                          <span className="text-sky">{p.awayTeamName}</span>
                        </td>
                        <MarketCell
                          pick={favoriteLabel(p.favorite)}
                          probability={p.favoriteProbability}
                          correct={p.correctOneXTwo}
                        />
                        <MarketCell pick={btts.yes ? "Sí" : "No"} probability={btts.probability} correct={p.correctBtts} />
                        <MarketCell
                          pick={ou.over ? <code>+2.5</code> : <code>-2.5</code>}
                          probability={ou.probability}
                          correct={p.correctOverUnder25}
                        />
                        <MarketCell
                          pick={<span className="font-numeric">{p.predictedHomeGoals}-{p.predictedAwayGoals}</span>}
                          probability={null}
                          correct={p.correctExactScore}
                        />
                        <td className="font-numeric px-2 py-2 text-right whitespace-nowrap">
                          {p.evaluatedAt ? (
                            `${p.actualHomeGoals}-${p.actualAwayGoals}`
                          ) : (
                            <Pill tone="gold">Pendiente</Pill>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
