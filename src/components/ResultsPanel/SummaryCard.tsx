import type { ReactNode } from "react";
import type { ConfidenceInfo, PredictionSummary } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { formatPercent } from "@/lib/format";
import { ConfidenceStars } from "./ConfidenceStars";

const FAVORITE_COLOR = { home: "text-pitch", away: "text-sky", draw: "text-ink" } as const;

/**
 * The prediction in one card: what it says, how much data is behind it, and the
 * single action available. Confidence and the tracking control used to sit in a
 * separate column of badges and buttons beside this card; folding them in keeps
 * the whole summary readable in one pass.
 */
export function SummaryCard({
  summary,
  confidence,
  action,
}: {
  summary: PredictionSummary;
  confidence?: ConfidenceInfo;
  action?: ReactNode;
}) {
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

        {(confidence || action) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            {confidence ? <ConfidenceStars confidence={confidence} /> : <span />}
            {action}
          </div>
        )}
      </div>
    </Card>
  );
}
