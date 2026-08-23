import { Card } from "@/components/ui/Card";

function GoalBadge({ value, team, tone }: { value: number; team: string; tone: "pitch" | "sky" }) {
  const borderClass = tone === "pitch" ? "border-pitch text-pitch" : "border-sky text-sky";
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <div className={`flex h-16 w-16 items-center justify-center rounded-full border-2 ${borderClass}`}>
        <span className="font-numeric text-xl font-semibold">{value.toFixed(2)}</span>
      </div>
      <span className="text-center text-xs text-ink-soft">{team}</span>
    </div>
  );
}

export function ExpectedGoalsCard({
  lambdaHome,
  lambdaAway,
  homeTeam,
  awayTeam,
}: {
  lambdaHome: number;
  lambdaAway: number;
  homeTeam: string;
  awayTeam: string;
}) {
  return (
    <Card title="Goles esperados (λ)">
      <div className="flex items-start justify-center gap-4">
        <GoalBadge value={lambdaHome} team={homeTeam} tone="pitch" />
        <span className="label-eyebrow pt-5 text-xs text-ink-soft">vs</span>
        <GoalBadge value={lambdaAway} team={awayTeam} tone="sky" />
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-line pt-3">
        <span className="label-eyebrow text-xs text-ink-soft">Total esperado</span>
        <span className="font-numeric text-base font-semibold text-ink">{(lambdaHome + lambdaAway).toFixed(2)}</span>
      </div>
    </Card>
  );
}
