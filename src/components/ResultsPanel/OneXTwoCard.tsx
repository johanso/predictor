import type { MarketOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";

function Row({ outcome }: { outcome: MarketOutcome }) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 py-2 last:border-0 dark:border-neutral-800">
      <span>{outcome.label}</span>
      <div className="flex gap-4 text-right tabular-nums">
        <span className="text-neutral-500">{(outcome.probability * 100).toFixed(1)}%</span>
        <span className="w-16 font-semibold">{outcome.odds ? outcome.odds.toFixed(2) : "—"}</span>
      </div>
    </div>
  );
}

export function OneXTwoCard({
  homeWin,
  draw,
  awayWin,
}: {
  homeWin: MarketOutcome;
  draw: MarketOutcome;
  awayWin: MarketOutcome;
}) {
  return (
    <Card title="Ganador del partido">
      <Row outcome={homeWin} />
      <Row outcome={draw} />
      <Row outcome={awayWin} />
    </Card>
  );
}
