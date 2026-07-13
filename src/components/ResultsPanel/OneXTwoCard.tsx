import type { MarketOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";

const TONES = {
  pitch: "bg-pitch",
  sky: "bg-sky",
  neutral: "bg-ink-soft",
} as const;

function Row({ outcome, tone }: { outcome: MarketOutcome; tone: keyof typeof TONES }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <span className="flex items-center gap-2 text-sm text-ink">
        <span className={`h-2.5 w-2.5 ${TONES[tone]}`} aria-hidden />
        {outcome.label}
      </span>
      <div className="flex items-baseline gap-3">
        <span className="font-numeric text-xs text-ink-soft">{(outcome.probability * 100).toFixed(1)}%</span>
        <span className="font-numeric w-14 text-right text-base font-semibold text-ink">
          {outcome.odds ? outcome.odds.toFixed(2) : "—"}
        </span>
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
      <Row outcome={homeWin} tone="pitch" />
      <Row outcome={draw} tone="neutral" />
      <Row outcome={awayWin} tone="sky" />
    </Card>
  );
}
