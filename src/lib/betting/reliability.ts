import type { BetMarket } from "./settle";

/**
 * How well the model actually predicts each market, measured by walk-forward
 * backtest over three full Brasileirão seasons (825 matches) — see
 * scripts/markets.test.ts, which prints this table and can regenerate it.
 *
 * `skillPct` is the log-loss improvement over that market's own base rate:
 * positive means the model beats "just bet the historically more common side",
 * negative means it does worse than that. `t` is the paired t-statistic; the
 * convention is that |t| < 2 cannot be distinguished from luck.
 *
 * Every market currently lands in the noise band. That is the point of showing
 * it: a positive expected value computed here means the model disagrees with the
 * bookmaker, and nothing in this table supports the model being the one that is
 * right. Kept next to the value calculation so the two are read together.
 */
export interface MarketReliability {
  skillPct: number;
  t: number;
}

const RELIABILITY: Record<BetMarket, MarketReliability> = {
  home: { skillPct: 0.41, t: 0.41 },
  draw: { skillPct: 0.41, t: 0.41 },
  away: { skillPct: 0.41, t: 0.41 },
  btts_yes: { skillPct: -0.96, t: -1.1 },
  btts_no: { skillPct: -0.96, t: -1.1 },
  over_1_5: { skillPct: -0.92, t: -0.88 },
  under_1_5: { skillPct: -0.92, t: -0.88 },
  over_2_5: { skillPct: -1.79, t: -1.56 },
  under_2_5: { skillPct: -1.79, t: -1.56 },
  double_1x: { skillPct: 0.92, t: 0.64 },
  double_12: { skillPct: -0.67, t: -0.92 },
  double_x2: { skillPct: 1.13, t: 0.84 },
  home_scores: { skillPct: 0.18, t: 0.14 },
  away_scores: { skillPct: -0.94, t: -0.81 },
};

export type ReliabilityVerdict = "señal" | "ruido" | "peor";

export function marketReliability(market: BetMarket): MarketReliability {
  return RELIABILITY[market];
}

export function reliabilityVerdict(market: BetMarket): ReliabilityVerdict {
  const { t } = RELIABILITY[market];
  if (t >= 2) return "señal";
  if (t <= -2) return "peor";
  return "ruido";
}

export const RELIABILITY_VERDICT_LABEL: Record<ReliabilityVerdict, string> = {
  señal: "señal medida",
  ruido: "sin señal medida",
  peor: "peor que la tasa base",
};
