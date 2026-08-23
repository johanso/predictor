import type { MarketOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";

export function DoubleChanceCard({
  oneX,
  oneTwo,
  xTwo,
}: {
  oneX: MarketOutcome;
  oneTwo: MarketOutcome;
  xTwo: MarketOutcome;
}) {
  return (
    <Card title="Doble oportunidad">
      <div className="flex flex-col gap-3">
        <ProbabilityBar label={oneX.label} probability={oneX.probability} odds={oneX.odds} tone="neutral" />
        <ProbabilityBar label={oneTwo.label} probability={oneTwo.probability} odds={oneTwo.odds} tone="neutral" />
        <ProbabilityBar label={xTwo.label} probability={xTwo.probability} odds={xTwo.odds} tone="neutral" />
      </div>
    </Card>
  );
}
