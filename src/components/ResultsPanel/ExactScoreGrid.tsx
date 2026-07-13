import type { ExactScoreOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";

// Matches --pitch in globals.css. Computed directly in JS (rather than the CSS
// color-mix() function) so the heatmap tint renders the same everywhere,
// independent of color-mix browser support or custom-property timing.
const PITCH_RGB = "31, 109, 69";

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
  const maxProbability = Math.max(...scores.map((s) => s.probability));

  return (
    <Card title="Marcador exacto" className="overflow-x-auto">
      <p className="mb-3 text-xs text-ink-soft">
        Filas: goles de <span className="font-medium text-pitch">{homeTeam}</span> (local) · Columnas: goles de{" "}
        <span className="font-medium text-sky">{awayTeam}</span> (visitante)
      </p>
      <table className="font-numeric w-full table-fixed border-collapse text-xs">
        <colgroup>
          <col className="w-10" />
          {goals.map((g) => (
            <col key={g} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th />
            {goals.map((g) => (
              <th key={g} className="pb-1.5 font-normal text-sky">
                {g}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {goals.map((h) => (
            <tr key={h}>
              <th className="pr-2 font-normal text-pitch">{h}</th>
              {goals.map((a) => {
                const cell = byKey.get(`${h}-${a}`);
                const intensity = cell ? Math.sqrt(cell.probability / maxProbability) : 0;
                const strong = intensity > 0.55;
                return (
                  <td
                    key={a}
                    className={`border border-line px-1 py-2 text-center ${strong ? "text-paper" : "text-ink"}`}
                    style={{ backgroundColor: cell ? `rgba(${PITCH_RGB}, ${intensity.toFixed(3)})` : undefined }}
                  >
                    {cell ? `${(cell.probability * 100).toFixed(1)}%` : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex items-center gap-2 text-xs text-ink-soft">
        <span className="label-eyebrow text-[0.65rem]">Menos probable</span>
        <span
          className="h-2 flex-1 border border-line"
          style={{ background: `linear-gradient(to right, rgba(${PITCH_RGB}, 0), rgba(${PITCH_RGB}, 1))` }}
          aria-hidden
        />
        <span className="label-eyebrow text-[0.65rem]">Más probable</span>
      </div>
    </Card>
  );
}
