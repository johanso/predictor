import { formatOdds, formatPercent } from "@/lib/format";

const FILL_CLASSES = {
  pitch: "bg-pitch",
  sky: "bg-sky",
  gold: "bg-gold",
  neutral: "bg-ink-soft",
} as const;

export function ProbabilityBar({
  label,
  probability,
  tone,
  odds,
}: {
  label: string;
  probability: number;
  tone: keyof typeof FILL_CLASSES;
  odds?: number | null;
}) {
  const widthPct = Math.max(0, Math.min(100, probability * 100));
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm text-ink">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="font-numeric text-xs font-semibold text-ink">{formatPercent(probability)}</span>
          {odds !== undefined && <span className="font-numeric text-xs text-ink-soft">{formatOdds(odds)}</span>}
        </div>
      </div>
      <div className="h-1.5 w-full bg-line">
        <div className={`h-full ${FILL_CLASSES[tone]}`} style={{ width: `${widthPct}%` }} />
      </div>
    </div>
  );
}
