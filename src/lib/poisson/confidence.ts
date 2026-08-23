import type { ConfidenceInfo, ConfidenceLevel } from "@/types/domain";

const MS_PER_HOUR = 60 * 60 * 1000;

function sampleTier(sampleSize: number): ConfidenceLevel {
  if (sampleSize >= 10) return "alta";
  if (sampleSize >= 5) return "media";
  return "baja";
}

function freshnessTier(dataAgeHours: number | null): ConfidenceLevel {
  if (dataAgeHours === null) return "baja";
  if (dataAgeHours <= 6) return "alta";
  if (dataAgeHours <= 24) return "media";
  return "baja";
}

const LEVEL_RANK: Record<ConfidenceLevel, number> = { baja: 0, media: 1, alta: 2 };
function worseOf(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return LEVEL_RANK[a] <= LEVEL_RANK[b] ? a : b;
}

/**
 * Compensates in the UI for the model's known lack of shrinkage on small
 * samples (see src/lib/poisson/matchup.ts): flags predictions built on thin
 * home/away splits or stale cached data, rather than fixing the model itself.
 */
export function computeConfidence(
  homeSampleSize: number,
  awaySampleSize: number,
  fetchedAt: Date | null
): ConfidenceInfo {
  const dataAgeHours = fetchedAt ? (Date.now() - fetchedAt.getTime()) / MS_PER_HOUR : null;

  const sampleLevel = sampleTier(Math.min(homeSampleSize, awaySampleSize));
  const freshLevel = freshnessTier(dataAgeHours);
  const level = worseOf(sampleLevel, freshLevel);

  const warnings: string[] = [];
  if (sampleLevel === "baja") {
    warnings.push("La predicción se basa en una muestra limitada y puede ser menos fiable.");
  }
  if (freshLevel === "baja") {
    warnings.push("Los datos de este equipo tienen más de 24 horas de antigüedad.");
  }
  if (level === "media" && warnings.length === 0) {
    warnings.push("La confianza de esta predicción es media: interpreta los porcentajes con cautela.");
  }

  return { level, homeSampleSize, awaySampleSize, dataAgeHours, warnings };
}
