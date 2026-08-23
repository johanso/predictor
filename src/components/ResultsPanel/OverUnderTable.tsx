import type { OverUnderOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";

export function OverUnderTable({ lines }: { lines: OverUnderOutcome[] }) {
  return (
    <Card title="Goles (Over/Under)">
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
        {lines.map((l) => (
          <div key={l.line} className="flex flex-col gap-3">
            <p className="label-eyebrow text-xs text-ink-soft">Línea {l.line}</p>
            <ProbabilityBar label={l.over.label} probability={l.over.probability} odds={l.over.odds} tone="pitch" />
            <ProbabilityBar label={l.under.label} probability={l.under.probability} odds={l.under.odds} tone="neutral" />
          </div>
        ))}
      </div>
    </Card>
  );
}
