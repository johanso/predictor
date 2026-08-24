import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { formatPercent } from "@/lib/format";
import type { SourcePerformance } from "@/lib/betting/stats";

/**
 * How few settled bets can still be read as a result. Below this a yield is mostly
 * the luck of a handful of outcomes, so the row is shown but flagged rather than
 * presented as a verdict on the tipster.
 */
const RELIABLE_SAMPLE = 20;

export function SourcePerformanceCard({ sources }: { sources: SourcePerformance[] }) {
  if (sources.length === 0) return null;

  const thin = sources.filter((s) => s.resolvedBets > 0 && s.resolvedBets < RELIABLE_SAMPLE).length;

  return (
    <Card title="Rendimiento por fuente" className="overflow-x-auto">
      <p className="mb-4 text-xs text-ink-soft">
        Qué está pagando y qué no, desde el principio. Ordenado por beneficio, no por yield: un
        yield sobre 3 apuestas es casi todo suerte y encabezaría la tabla sin merecerlo.
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="label-eyebrow border-b border-line text-left text-xs text-ink-soft">
            <th className="px-2 py-2 font-normal">Fuente</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">Apuestas</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">Cuota media</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">Acierto</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">Apostado</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">Beneficio</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">Yield</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const thinSample = s.resolvedBets > 0 && s.resolvedBets < RELIABLE_SAMPLE;
            return (
              <tr key={s.source} className="border-b border-line last:border-0">
                <td className="px-2 py-2">
                  <Pill tone={s.isManual ? "sky" : "pitch"}>{s.source}</Pill>
                </td>
                <td className="font-numeric px-2 py-2 text-right text-ink-soft">
                  {s.resolvedBets}
                  {s.pendingBets > 0 && <span className="opacity-60"> +{s.pendingBets} pend.</span>}
                </td>
                <td className="font-numeric px-2 py-2 text-right text-ink-soft">
                  {s.avgOdds !== null ? s.avgOdds.toFixed(2) : "—"}
                </td>
                <td className="font-numeric px-2 py-2 text-right text-ink-soft">
                  {s.winRate !== null ? formatPercent(s.winRate) : "—"}
                </td>
                <td className="font-numeric px-2 py-2 text-right text-ink-soft">{s.totalStaked.toFixed(2)}</td>
                <td className={`font-numeric px-2 py-2 text-right font-semibold ${s.totalProfit >= 0 ? "text-pitch" : "text-red"}`}>
                  {s.totalProfit >= 0 ? "+" : ""}
                  {s.totalProfit.toFixed(2)}
                </td>
                <td className={`font-numeric px-2 py-2 text-right ${(s.yieldPct ?? 0) >= 0 ? "text-pitch" : "text-red"}`}>
                  {s.yieldPct !== null ? (
                    <span title={thinSample ? `Solo ${s.resolvedBets} apuestas resueltas — todavía no significa mucho.` : undefined}>
                      {s.yieldPct >= 0 ? "+" : ""}
                      {formatPercent(s.yieldPct)}
                      {thinSample && <span className="ml-1 text-gold">*</span>}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {thin > 0 && (
        <p className="mt-3 text-[0.65rem] text-ink-soft">
          <span className="text-gold">*</span> Menos de {RELIABLE_SAMPLE} apuestas resueltas. Un yield con
          tan pocas depende más del azar que de la fuente — hacen falta cientos para distinguir una
          buena racha de una ventaja real.
        </p>
      )}
    </Card>
  );
}
