import type { ExactScoreOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";

export function ExactScoreGrid({
  scores,
  homeTeam,
  awayTeam,
}: {
  scores: ExactScoreOutcome[];
  homeTeam: string;
  awayTeam: string;
}) {
  const maxGoals = Math.max(...scores.map((s) => s.home), ...scores.map((s) => s.away));
  const goals = Array.from({ length: maxGoals + 1 }, (_, i) => i);
  const byKey = new Map(scores.map((s) => [`${s.home}-${s.away}`, s]));

  const best = scores.reduce((a, b) => (b.probability > a.probability ? b : a), scores[0]);

  return (
    <Card title="Marcador exacto" className="overflow-x-auto">
      <p className="mb-2 text-xs text-neutral-500">
        Filas: goles de <span className="font-medium">{homeTeam}</span> (local) · Columnas: goles de{" "}
        <span className="font-medium">{awayTeam}</span> (visitante)
      </p>
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-8" />
            {goals.map((g) => (
              <th key={g} className="w-14 pb-1 font-normal text-neutral-500">
                {g}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {goals.map((h) => (
            <tr key={h}>
              <th className="pr-2 font-normal text-neutral-500">{h}</th>
              {goals.map((a) => {
                const cell = byKey.get(`${h}-${a}`);
                const isBest = cell === best;
                return (
                  <td
                    key={a}
                    className={`rounded border border-neutral-100 px-1 py-1 text-center tabular-nums dark:border-neutral-800 ${
                      isBest ? "bg-emerald-100 font-semibold dark:bg-emerald-900/40" : ""
                    }`}
                  >
                    {cell ? `${(cell.probability * 100).toFixed(1)}%` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
