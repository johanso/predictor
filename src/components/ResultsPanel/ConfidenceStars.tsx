import type { ConfidenceInfo, ConfidenceLevel } from "@/types/domain";

const FILLED: Record<ConfidenceLevel, number> = { alta: 3, media: 2, baja: 1 };
const LABEL: Record<ConfidenceLevel, string> = { alta: "Confianza alta", media: "Confianza media", baja: "Confianza baja" };
const TONE: Record<ConfidenceLevel, string> = { alta: "text-pitch", media: "text-gold", baja: "text-red" };

/**
 * Confidence as three stars rather than a separate badge card.
 *
 * The level is about how much data is behind the prediction — matches played by
 * both sides, and how fresh the cached table is — not about how likely the
 * favourite is. The reasons ride along in the tooltip so the common case stays a
 * glance and the detail is still one hover away.
 */
export function ConfidenceStars({ confidence }: { confidence: ConfidenceInfo }) {
  const filled = FILLED[confidence.level];
  const detail = [
    `${LABEL[confidence.level]}.`,
    `Muestra: ${confidence.homeSampleSize} partidos del local, ${confidence.awaySampleSize} del visitante.`,
    confidence.dataAgeHours !== null ? `Datos de hace ${Math.round(confidence.dataAgeHours)} h.` : null,
    ...confidence.warnings,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={detail}>
      <span className={`text-sm leading-none ${TONE[confidence.level]}`} aria-hidden="true">
        {"★".repeat(filled)}
        <span className="text-ink-soft opacity-40">{"★".repeat(3 - filled)}</span>
      </span>
      <span className="label-eyebrow text-[0.6rem] text-ink-soft">{LABEL[confidence.level]}</span>
    </span>
  );
}
