import type { MarketOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";

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
      <div className="flex flex-col gap-3">
        <ProbabilityBar label={homeWin.label} probability={homeWin.probability} odds={homeWin.odds} tone="pitch" />
        <ProbabilityBar label={draw.label} probability={draw.probability} odds={draw.odds} tone="gold" />
        <ProbabilityBar label={awayWin.label} probability={awayWin.probability} odds={awayWin.odds} tone="sky" />
      </div>
    </Card>
  );
}
