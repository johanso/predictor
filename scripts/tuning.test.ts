// Can the formula be tuned into a profitable one? Coordinate-descent parameter
// search on 2023-2024, validated on an untouched 2025 holdout, then a betting
// simulation against a synthetic bookmaker.
//   npx vitest run --config vitest.backtest.config.ts scripts/tuning.test.ts
import { describe, it } from "vitest";
import { APP_PARAMS, backtest, baseRateLogLoss1x2, favoriteOf, logLoss1x2, type Params, type Row } from "./backtestLib";

const TRAIN = [2023, 2024];
const HOLDOUT = [2025];

function skillPct(rows: Row[]): number {
  const base = baseRateLogLoss1x2(rows);
  return ((base - logLoss1x2(rows)) / base) * 100;
}

/**
 * Flat-stake betting simulation. The synthetic book is deliberately WEAK: its
 * fair prices are the league base rates, so it knows nothing about which teams
 * are playing. A real bookmaker is far sharper than this — treat any profit here
 * as a generous upper bound, not a forecast.
 */
function simulate(rows: Row[], margin: number, edgeThreshold: number) {
  const h = rows.filter((r) => r.actual === "home").length / rows.length;
  const d = rows.filter((r) => r.actual === "draw").length / rows.length;
  const a = 1 - h - d;
  const odds = { home: 1 / (h * (1 + margin)), draw: 1 / (d * (1 + margin)), away: 1 / (a * (1 + margin)) };

  let bets = 0;
  let profit = 0;
  for (const r of rows) {
    const p = { home: r.pHome, draw: r.pDraw, away: r.pAway };
    for (const side of ["home", "draw", "away"] as const) {
      if (p[side] * odds[side] > 1 + edgeThreshold) {
        bets++;
        profit += r.actual === side ? odds[side] - 1 : -1;
      }
    }
  }
  return { bets, profit, roi: bets === 0 ? 0 : (profit / bets) * 100, odds };
}

describe("tuning", () => {
  it("searches for a profitable configuration and validates it out of sample", () => {
    const trainRows = backtest(APP_PARAMS, TRAIN);
    console.log(`\n${"=".repeat(78)}`);
    console.log(`BÚSQUEDA DE CONFIGURACIÓN RENTABLE`);
    console.log(`Entreno: ${TRAIN.join("+")} (${trainRows.length} partidos)   Validación ciega: ${HOLDOUT.join("+")}`);
    console.log("=".repeat(78));

    // ---- Coordinate descent over each knob the formula exposes ----
    const grids: Array<[keyof Params, number[]]> = [
      ["halfLifeDays", [15, 25, 40, 60, 90, 150, 99999]],
      ["pseudoMatches", [1, 2, 4, 8, 16, 32]],
      ["rho", [-0.25, -0.18, -0.13, -0.06, 0]],
      ["drawBoost", [0.85, 1.0, 1.15, 1.3, 1.5]],
      ["shrinkToBase", [0, 0.15, 0.3, 0.5, 0.7]],
    ];

    let best: Params = { ...APP_PARAMS };
    let bestSkill = skillPct(trainRows);
    console.log(`\nPunto de partida (fórmula actual de la app): ventaja ${bestSkill >= 0 ? "+" : ""}${bestSkill.toFixed(3)}%`);

    for (let pass = 1; pass <= 2; pass++) {
      for (const [key, values] of grids) {
        let localBest = best[key] as number;
        let localSkill = bestSkill;
        for (const v of values) {
          if (v === best[key]) continue;
          const skill = skillPct(backtest({ ...best, [key]: v }, TRAIN));
          if (skill > localSkill) {
            localSkill = skill;
            localBest = v;
          }
        }
        if (localSkill > bestSkill) {
          best = { ...best, [key]: localBest };
          bestSkill = localSkill;
          console.log(`  pasada ${pass}: ${String(key).padEnd(14)} → ${String(localBest).padEnd(7)} ventaja ${bestSkill >= 0 ? "+" : ""}${bestSkill.toFixed(3)}%`);
        }
      }
    }

    console.log(`\nMEJOR CONFIGURACIÓN HALLADA (optimizada sobre ${TRAIN.join("+")}):`);
    console.log(`  vida media    ${best.halfLifeDays === 99999 ? "sin decaimiento" : best.halfLifeDays + " días"}`);
    console.log(`  shrinkage     ${best.pseudoMatches} partidos ficticios`);
    console.log(`  rho (D-C)     ${best.rho}`);
    console.log(`  boost empate  ${best.drawBoost}`);
    console.log(`  mezcla c/base ${best.shrinkToBase}`);
    console.log(`  ventaja en entreno: +${bestSkill.toFixed(3)}%`);

    // ---- The honest test: does the tuning survive on data it never saw? ----
    const holdoutApp = backtest(APP_PARAMS, HOLDOUT);
    const holdoutBest = backtest(best, HOLDOUT);
    console.log(`\n${"-".repeat(78)}`);
    console.log(`VALIDACIÓN CIEGA EN ${HOLDOUT.join("+")} (${holdoutApp.length} partidos que la optimización nunca vio)`);
    console.log("-".repeat(78));
    const sApp = skillPct(holdoutApp);
    const sBest = skillPct(holdoutBest);
    console.log(`Fórmula actual de la app:  ventaja ${sApp >= 0 ? "+" : ""}${sApp.toFixed(3)}%`);
    console.log(`Fórmula "optimizada":      ventaja ${sBest >= 0 ? "+" : ""}${sBest.toFixed(3)}%`);
    console.log(sBest > sApp ? `→ la mejora SÍ se sostiene fuera de muestra` : `→ la mejora NO se sostiene: era ruido del entreno (sobreajuste)`);

    // ---- What edge do you actually need? ----
    console.log(`\n${"-".repeat(78)}`);
    console.log(`SIMULACIÓN DE APUESTAS — casa de apuestas SINTÉTICA Y DÉBIL`);
    console.log(`(sus cuotas solo conocen las tasas base de la liga, no sabe qué equipos juegan.`);
    console.log(` Una casa real es MUCHO más precisa: esto es un techo optimista, no un pronóstico)`);
    console.log("-".repeat(78));
    const all = backtest(best, [...TRAIN, ...HOLDOUT]);
    console.log(`Margen casa   apuestas   ROI       resultado`);
    for (const margin of [0, 0.03, 0.06]) {
      const s = simulate(all, margin, 0.02);
      console.log(
        `${(margin * 100).toFixed(0).padStart(6)}%      ${String(s.bets).padStart(5)}     ${s.roi >= 0 ? "+" : ""}${s.roi.toFixed(2).padStart(6)}%   ${s.roi > 0 ? "gana" : "PIERDE"}`
      );
    }
    console.log(`\n(margen 0% = casa sin comisión, imposible en la vida real)`);
    console.log(`(margen 5-7% = lo que cobra una casa real en 1X2)`);

    // ---- Where the model actually bleeds ----
    console.log(`\n${"-".repeat(78)}`);
    console.log(`DÓNDE PIERDE: acierto por tipo de favorito (2023-2025, ${all.length} partidos)`);
    console.log("-".repeat(78));
    for (const side of ["home", "draw", "away"] as const) {
      const sel = all.filter((r) => favoriteOf(r) === side);
      if (sel.length === 0) continue;
      const w = sel.filter((r) => r.actual === side).length;
      const rate = w / sel.length;
      console.log(`favorito=${side.padEnd(5)} ${String(sel.length).padStart(4)} apuestas   acierta ${(rate * 100).toFixed(1)}%   necesita cuota ${(1 / rate).toFixed(2)} para no perder`);
    }
  });
});
