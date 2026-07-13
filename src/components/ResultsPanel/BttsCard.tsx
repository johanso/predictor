import type { MarketOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";

export function BttsCard({ yes, no }: { yes: MarketOutcome; no: MarketOutcome }) {
  return (
    <Card title="Ambos marcan">
      {[yes, no].map((o) => (
        <div key={o.label} className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
          <span className="text-sm text-ink">{o.label}</span>
          <div className="flex items-baseline gap-3">
            <span className="font-numeric text-xs text-ink-soft">{(o.probability * 100).toFixed(1)}%</span>
            <span className="font-numeric w-14 text-right text-base font-semibold text-ink">
              {o.odds ? o.odds.toFixed(2) : "—"}
            </span>
          </div>
        </div>
      ))}
    </Card>
  );
}
