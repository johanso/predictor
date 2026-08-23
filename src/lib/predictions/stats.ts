import { prisma } from "@/lib/db";
import type { PredictionModel } from "@/generated/prisma/models";

export interface PerformanceSummary {
  totalTracked: number;
  totalEvaluated: number;
  pending: number;
  oneXTwoAccuracy: number | null;
  bttsAccuracy: number | null;
  overUnderAccuracy: number | null;
  exactScoreAccuracy: number | null;
  meanGoalError: number | null;
}

export async function getPerformanceSummary(): Promise<PerformanceSummary> {
  const [totalTracked, evaluated] = await Promise.all([
    prisma.prediction.count(),
    prisma.prediction.findMany({ where: { evaluatedAt: { not: null } } }),
  ]);

  const totalEvaluated = evaluated.length;
  if (totalEvaluated === 0) {
    return {
      totalTracked,
      totalEvaluated: 0,
      pending: totalTracked,
      oneXTwoAccuracy: null,
      bttsAccuracy: null,
      overUnderAccuracy: null,
      exactScoreAccuracy: null,
      meanGoalError: null,
    };
  }

  const count = (key: "correctOneXTwo" | "correctBtts" | "correctOverUnder25" | "correctExactScore") =>
    evaluated.filter((p) => p[key]).length;

  return {
    totalTracked,
    totalEvaluated,
    pending: totalTracked - totalEvaluated,
    oneXTwoAccuracy: count("correctOneXTwo") / totalEvaluated,
    bttsAccuracy: count("correctBtts") / totalEvaluated,
    overUnderAccuracy: count("correctOverUnder25") / totalEvaluated,
    exactScoreAccuracy: count("correctExactScore") / totalEvaluated,
    meanGoalError: evaluated.reduce((s, p) => s + (p.goalError ?? 0), 0) / totalEvaluated,
  };
}

export interface CalibrationBucket {
  rangeLabel: string;
  count: number;
  hitRate: number | null;
}

// Sized to the range this model actually emits. Measured over three Brasileirão
// seasons the favourite's probability runs 33%-81% with a median of 46%, so the
// old 50/60/70/80/90 deciles put nearly every prediction in one bucket and left
// the top two permanently empty. Tighter bands below 60% is where the resolution
// is needed; above 70% there are too few predictions to split further.
const BUCKETS: Array<[number, number]> = [
  [0, 45],
  [45, 50],
  [50, 55],
  [55, 60],
  [60, 70],
  [70, 101],
];

function bucketLabel(lo: number, hi: number): string {
  if (lo === 0) return `<${hi}%`;
  if (hi > 100) return `${lo}%+`;
  return `${lo}-${hi - 1}%`;
}

export async function getCalibrationBuckets(): Promise<CalibrationBucket[]> {
  const evaluated = await prisma.prediction.findMany({ where: { evaluatedAt: { not: null } } });

  return BUCKETS.map(([lo, hi]) => {
    const inBucket = evaluated.filter((p) => {
      const pct = p.favoriteProbability * 100;
      return pct >= lo && pct < hi;
    });
    const count = inBucket.length;
    const hits = inBucket.filter((p) => p.correctOneXTwo).length;
    return {
      rangeLabel: bucketLabel(lo, hi),
      count,
      hitRate: count > 0 ? hits / count : null,
    };
  }).filter((b) => b.count > 0);
}

/** Every tracked prediction (pending and evaluated), most recent first — the "which matches did I send?" list. */
export async function getTrackedPredictions(limit = 50): Promise<PredictionModel[]> {
  return prisma.prediction.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
