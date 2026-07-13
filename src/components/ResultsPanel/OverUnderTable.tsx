import type { OverUnderOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";

export function OverUnderTable({ lines }: { lines: OverUnderOutcome[] }) {
  return (
    <Card title="Goles (Over/Under)" className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="label-eyebrow text-left text-xs text-ink-soft">
            <th className="pb-2 font-normal">Línea</th>
            <th className="pb-2 text-right font-normal">Over %</th>
            <th className="pb-2 text-right font-normal">Cuota</th>
            <th className="pb-2 text-right font-normal">Under %</th>
            <th className="pb-2 text-right font-normal">Cuota</th>
          </tr>
        </thead>
        <tbody className="font-numeric">
          {lines.map((l) => (
            <tr key={l.line} className="border-t border-line">
              <td className="py-2">{l.line}</td>
              <td className="py-2 text-right text-ink-soft">{(l.over.probability * 100).toFixed(1)}%</td>
              <td className="py-2 text-right font-semibold text-ink">{l.over.odds ? l.over.odds.toFixed(2) : "—"}</td>
              <td className="py-2 text-right text-ink-soft">{(l.under.probability * 100).toFixed(1)}%</td>
              <td className="py-2 text-right font-semibold text-ink">{l.under.odds ? l.under.odds.toFixed(2) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
