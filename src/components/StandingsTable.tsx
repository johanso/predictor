import type { StandingsRow } from "@/lib/cache/standingsCache";
import { Card } from "@/components/ui/Card";

export function StandingsTable({ rows }: { rows: StandingsRow[] }) {
  return (
    <Card title="Tabla de posiciones" className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="label-eyebrow border-b border-line text-xs text-ink-soft">
            <th className="px-2 py-2 text-left font-normal">#</th>
            <th className="px-2 py-2 text-left font-normal">Equipo</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">PJ</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">G</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">E</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">P</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">GF</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">GC</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">DG</th>
            <th className="font-numeric px-2 py-2 text-right font-normal">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.teamId} className="border-b border-line last:border-0">
              <td className="font-numeric px-2 py-1.5 text-ink-soft">{i + 1}</td>
              <td className="px-2 py-1.5">{r.teamName}</td>
              <td className="font-numeric px-2 py-1.5 text-right">{r.played}</td>
              <td className="font-numeric px-2 py-1.5 text-right">{r.won}</td>
              <td className="font-numeric px-2 py-1.5 text-right">{r.draw}</td>
              <td className="font-numeric px-2 py-1.5 text-right">{r.lost}</td>
              <td className="font-numeric px-2 py-1.5 text-right">{r.goalsFor}</td>
              <td className="font-numeric px-2 py-1.5 text-right">{r.goalsAgainst}</td>
              <td className="font-numeric px-2 py-1.5 text-right">
                {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
              </td>
              <td className="font-numeric px-2 py-1.5 text-right font-semibold text-ink">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
