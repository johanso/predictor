// How much of the fixture list survives each tracking threshold, and whether
// raising the bar actually buys accuracy.
//   npx vitest run --config vitest.backtest.config.ts scripts/threshold.test.ts
import { describe, it } from "vitest";
import { APP_PARAMS, backtest, favoriteOf } from "./backtestLib";

const MATCHES_PER_ROUND = 10; // Brasileirão: 20 teams

describe("threshold", () => {
  it("shows what each tracking threshold lets through", () => {
    const rows = backtest(APP_PARAMS, [2023, 2024, 2025]);
    const n = rows.length;
    const favProbs = rows.map((r) => Math.max(r.pHome, r.pDraw, r.pAway));

    console.log(`\nDISTRIBUCIÓN DE LA PROBABILIDAD DEL FAVORITO (${n} partidos, 2023-2025)`);
    console.log(`mínima ${(Math.min(...favProbs) * 100).toFixed(1)}%  ·  mediana ${(favProbs.slice().sort((a, b) => a - b)[Math.floor(n / 2)] * 100).toFixed(1)}%  ·  máxima ${(Math.max(...favProbs) * 100).toFixed(1)}%`);

    console.log(`\nUmbral   pasan    % fixtures   partidos/fecha   acierto   ¿mejora?`);
    console.log("-".repeat(70));
    let prev: number | null = null;
    for (const t of [0.45, 0.5, 0.52, 0.54, 0.56, 0.58, 0.6, 0.62, 0.65, 0.7]) {
      const sel = rows.filter((r, i) => favProbs[i] >= t);
      if (sel.length === 0) {
        console.log(`>=${(t * 100).toFixed(0)}%      0        0.0%         0.0              —         —`);
        continue;
      }
      const hits = sel.filter((r) => favoriteOf(r) === r.actual).length;
      const rate = hits / sel.length;
      const share = sel.length / n;
      const arrow = prev === null ? "" : rate > prev ? "sube" : rate < prev ? "BAJA" : "igual";
      console.log(
        `>=${(t * 100).toFixed(0)}%    ${String(sel.length).padStart(5)}    ${(share * 100).toFixed(1).padStart(5)}%      ${(share * MATCHES_PER_ROUND).toFixed(1).padStart(5)}           ${(rate * 100).toFixed(1)}%     ${arrow}`
      );
      prev = rate;
    }

    // The calibration chart on /rendimiento buckets at 50/60/70/80/90 — check which can ever fill.
    console.log(`\nBUCKETS DEL GRÁFICO DE CALIBRACIÓN — ¿cuáles pueden llenarse alguna vez?`);
    for (const [lo, hi] of [
      [50, 60],
      [60, 70],
      [70, 80],
      [80, 90],
      [90, 100],
    ]) {
      const c = favProbs.filter((p) => p * 100 >= lo && p * 100 < hi).length;
      console.log(`  ${lo}-${hi - 1}%  ${String(c).padStart(4)} partidos (${((c / n) * 100).toFixed(1)}%)${c === 0 ? "   ← nunca se llena" : ""}`);
    }
  });
});
