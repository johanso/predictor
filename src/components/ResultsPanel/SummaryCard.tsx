import type { PredictionSummary } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { formatPercent } from "@/lib/format";

const FAVORITE_COLOR = { home: "text-pitch", away: "text-sky", draw: "text-ink" } as const;

export function SummaryCard({ summary }: { summary: PredictionSummary }) {
  return (
    <Card title="Resumen del pronóstico">
      <div className="flex flex-col gap-3">
        <p className="text-base leading-relaxed">
          <span className={`font-semibold ${FAVORITE_COLOR[summary.favorite]}`}>{summary.favoriteLabel}</span>{" "}
          {summary.favorite === "draw" ? "es el resultado más probable" : "es favorito"}, con una probabilidad
          estimada del <span className="font-numeric font-semibold">{formatPercent(summary.favoriteProbability)}</span>.
        </p>
        <p className="label-eyebrow text-xs text-ink-soft">
          Marcador más probable:{" "}
          <span className="font-numeric text-sm font-semibold text-ink">
            {summary.likelyScore.home}-{summary.likelyScore.away}
          </span>{" "}
          ({formatPercent(summary.likelyScore.probability)})
        </p>
      </div>
    </Card>
  );
}
