// Shared heatmap tinting — was inline in ExactScoreGrid, now reused by OverUnderTable too.
export const PITCH_RGB = "31, 109, 69";
export const SKY_RGB = "42, 110, 143";

/** sqrt curve so mid-range values are still visually distinguishable, clamped to [0, 1]. */
export function intensity(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, Math.sqrt(value / max)));
}

export function tint(rgb: string, value: number): string {
  return `rgba(${rgb}, ${value.toFixed(3)})`;
}
