import type { MarketOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";

export function BttsCard({ yes, no }: { yes: MarketOutcome; no: MarketOutcome }) {
  return (
    <Card title="Ambos marcan">
      {[yes, no].map((o) => (
        <div key={o.label} className="flex items-center justify-between border-b border-neutral-100 py-2 last:border-0 dark:border-neutral-800">
          <span>{o.label}</span>
          <div className="flex gap-4 text-right tabular-nums">
            <span className="text-neutral-500">{(o.probability * 100).toFixed(1)}%</span>
            <span className="w-16 font-semibold">{o.odds ? o.odds.toFixed(2) : "—"}</span>
          </div>
        </div>
      ))}
    </Card>
  );
}
