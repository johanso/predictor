import type { MarketOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";

export function BttsCard({ yes, no }: { yes: MarketOutcome; no: MarketOutcome }) {
  return (
    <Card title="AEM">
      <div className="flex flex-col gap-3">
        <ProbabilityBar label={yes.label} probability={yes.probability} odds={yes.odds} tone="pitch" />
        <ProbabilityBar label={no.label} probability={no.probability} odds={no.odds} tone="neutral" />
      </div>
    </Card>
  );
}
