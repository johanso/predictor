import type { OverUnderOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";

export function OverUnderTable({ lines }: { lines: OverUnderOutcome[] }) {
  return (
    <Card title="Goles (Over/Under)">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <th className="pb-2 font-normal">Línea</th>
            <th className="pb-2 font-normal text-right">Over %</th>
            <th className="pb-2 font-normal text-right">Cuota</th>
            <th className="pb-2 font-normal text-right">Under %</th>
            <th className="pb-2 font-normal text-right">Cuota</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.line} className="border-t border-neutral-100 tabular-nums dark:border-neutral-800">
              <td className="py-1.5">{l.line}</td>
              <td className="py-1.5 text-right">{(l.over.probability * 100).toFixed(1)}%</td>
              <td className="py-1.5 text-right font-semibold">{l.over.odds ? l.over.odds.toFixed(2) : "—"}</td>
              <td className="py-1.5 text-right">{(l.under.probability * 100).toFixed(1)}%</td>
              <td className="py-1.5 text-right font-semibold">{l.under.odds ? l.under.odds.toFixed(2) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
