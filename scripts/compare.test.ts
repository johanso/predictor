// Does the maximum-likelihood Dixon-Coles fit actually beat the shipped
// ratio-of-averages model? Same matches, same walk-forward rules, no lookahead.
//   npx vitest run --config vitest.backtest.config.ts scripts/compare.test.ts
import { describe, it } from "vitest";
import { APP_PARAMS, backtest, loadSeason, type Row } from "./backtestLib";
import { fitDixonColes, fittedLambdas, type DixonColesFit } from "@/lib/poisson/dixonColesFit";
import { applyDixonColesAdjustment } from "@/lib/poisson/dixonColes";
import { buildProbabilityMatrix, oneXTwoProbabilities, bttsProbabilities, overUnderProbabilities } from "@/lib/poisson/markets";

const SEASONS = [2023, 2024, 2025];
const MIN_PRIOR = 5;
const REFIT_EVERY = 5; // consecutive matches share almost the same history; refitting per match is wasted work

type Outcome = "home" | "draw" | "away";

interface FitRow {
  key: string;
  pHome: number;
  pDraw: number;
  pAway: number;
  pBtts: number;
  pOver: number;
  actual: Outcome;
  actualBtts: boolean;
  actualOver: boolean;
}

function runFittedBacktest(halfLifeDays: number, regularization: number, seasons: number[] = SEASONS): FitRow[] {
  const rows: FitRow[] = [];

  for (const season of seasons) {
    const matches = loadSeason(season);
    let fit: DixonColesFit | null = null;
    let fittedAt = -Infinity;

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const prior = matches.slice(0, i);

      const homeGames = prior.filter((p) => p.homeId === m.homeId).length;
      const awayGames = prior.filter((p) => p.awayId === m.awayId).length;
      if (homeGames < MIN_PRIOR || awayGames < MIN_PRIOR) continue;

      if (fit === null || prior.length - fittedAt >= REFIT_EVERY) {
        fit = fitDixonColes(
          prior.map((p) => ({
            homeTeamId: p.homeId,
            awayTeamId: p.awayId,
            homeGoals: p.homeGoals,
            awayGoals: p.awayGoals,
            utcDate: p.date,
          })),
          { halfLifeDays, regularization, referenceDate: m.date }
        );
        fittedAt = prior.length;
      }

      const { lambdaHome, lambdaAway } = fittedLambdas(fit, m.homeId, m.awayId);
      if (!Number.isFinite(lambdaHome) || !Number.isFinite(lambdaAway)) continue;

      const matrix = applyDixonColesAdjustment(buildProbabilityMatrix(lambdaHome, lambdaAway), lambdaHome, lambdaAway, fit.rho);
      const { homeWin, draw, awayWin } = oneXTwoProbabilities(matrix);
      const sum = homeWin + draw + awayWin;

      rows.push({
        key: `${season}-${i}`,
        pHome: homeWin / sum,
        pDraw: draw / sum,
        pAway: awayWin / sum,
        pBtts: bttsProbabilities(matrix).yes,
        pOver: overUnderProbabilities(matrix).find((o) => o.line === 2.5)!.over,
        actual: m.homeGoals > m.awayGoals ? "home" : m.homeGoals < m.awayGoals ? "away" : "draw",
        actualBtts: m.homeGoals > 0 && m.awayGoals > 0,
        actualOver: m.homeGoals + m.awayGoals > 2,
      });
    }
  }

  return rows;
}

function logLoss(rows: { pHome: number; pDraw: number; pAway: number; actual: Outcome }[]): number {
  return (
    rows.reduce((s, r) => {
      const p = r.actual === "home" ? r.pHome : r.actual === "draw" ? r.pDraw : r.pAway;
      return s - Math.log(Math.max(p, 1e-15));
    }, 0) / rows.length
  );
}

function binaryLogLoss(rows: { p: number; actual: boolean }[]): number {
  return (
    rows.reduce((s, r) => {
      const q = Math.min(Math.max(r.p, 1e-12), 1 - 1e-12);
      return s - Math.log(r.actual ? q : 1 - q);
    }, 0) / rows.length
  );
}

function paired(a: number[], b: number[]) {
  const n = a.length;
  const d = a.map((v, i) => b[i] - v); // positive => a is better (lower loss)
  const mean = d.reduce((s, x) => s + x, 0) / n;
  const varr = d.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  return { mean, t: mean / Math.sqrt(varr / n) };
}

describe("compare", () => {
  it("puts the fitted Dixon-Coles head to head with the shipped model", () => {
    const appRows = backtest(APP_PARAMS, SEASONS);
    const appByKey = new Map(appRows.map((r) => [r.key, r]));

    console.log(`\n${"=".repeat(76)}`);
    console.log(`FÓRMULA ACTUAL  vs  DIXON-COLES AJUSTADO POR MÁXIMA VEROSIMILITUD`);
    console.log(`Brasileirão 2023-2025, walk-forward, sin mirar el futuro`);
    console.log("=".repeat(76));

    let best: { halfLife: number; reg: number; ll: number; rows: FitRow[] } | null = null;

    console.log(`\nBarrido de hiperparámetros:`);
    console.log(`vida media   regularización   log loss`);
    for (const halfLife of [60, 90, 150]) {
      for (const reg of [0.02, 0.05, 0.12]) {
        const rows = runFittedBacktest(halfLife, reg);
        const paired_ = rows.filter((r) => appByKey.has(r.key));
        const ll = logLoss(paired_);
        console.log(`${String(halfLife).padStart(8)}d   ${String(reg).padStart(12)}   ${ll.toFixed(4)}`);
        if (!best || ll < best.ll) best = { halfLife, reg, ll, rows };
      }
    }

    const fitRows = best!.rows.filter((r) => appByKey.has(r.key));
    const appAligned: Row[] = fitRows.map((r) => appByKey.get(r.key)!);
    const n = fitRows.length;

    console.log(`\nMejor configuración: vida media ${best!.halfLife} días, regularización ${best!.reg}`);
    console.log(`Partidos comparados: ${n}`);

    // --- 1X2 ---
    const baseH = appAligned.filter((r) => r.actual === "home").length / n;
    const baseD = appAligned.filter((r) => r.actual === "draw").length / n;
    const baseA = 1 - baseH - baseD;
    const baseLL =
      appAligned.reduce((s, r) => {
        const p = r.actual === "home" ? baseH : r.actual === "draw" ? baseD : baseA;
        return s - Math.log(p);
      }, 0) / n;

    const appLL = logLoss(appAligned);
    const fitLL = logLoss(fitRows);

    console.log(`\n${"-".repeat(76)}`);
    console.log(`RESULTADO 1X2 (log loss: más bajo es mejor)`);
    console.log("-".repeat(76));
    console.log(`Tasas base de la liga     ${baseLL.toFixed(4)}`);
    console.log(`Fórmula actual            ${appLL.toFixed(4)}   ventaja ${(((baseLL - appLL) / baseLL) * 100).toFixed(2)}%`);
    console.log(`Dixon-Coles ajustado      ${fitLL.toFixed(4)}   ventaja ${(((baseLL - fitLL) / baseLL) * 100).toFixed(2)}%`);

    const cmp = paired(
      fitRows.map((r) => -Math.log(Math.max(r.actual === "home" ? r.pHome : r.actual === "draw" ? r.pDraw : r.pAway, 1e-15))),
      appAligned.map((r) => -Math.log(Math.max(r.actual === "home" ? r.pHome : r.actual === "draw" ? r.pDraw : r.pAway, 1e-15)))
    );
    console.log(`\nPrueba pareada (ajustado vs actual): t = ${cmp.t.toFixed(2)}`);
    console.log(
      Math.abs(cmp.t) < 2
        ? `→ mejora no concluyente con esta muestra`
        : cmp.t > 0
          ? `→ el ajustado es MEJOR de forma estadísticamente sólida`
          : `→ el ajustado es PEOR de forma estadísticamente sólida`
    );

    // --- goal markets ---
    const bttsBase = appAligned.filter((r) => r.actualBtts).length / n;
    const overBase = appAligned.filter((r) => r.actualOver).length / n;
    console.log(`\n${"-".repeat(76)}`);
    console.log(`MERCADOS DE GOLES`);
    console.log("-".repeat(76));
    const bttsApp = binaryLogLoss(appAligned.map((r) => ({ p: r.pBtts, actual: r.actualBtts })));
    const bttsFit = binaryLogLoss(fitRows.map((r) => ({ p: r.pBtts, actual: r.actualBtts })));
    const bttsBaseLL = binaryLogLoss(appAligned.map((r) => ({ p: bttsBase, actual: r.actualBtts })));
    console.log(`Ambos marcan  — base ${bttsBaseLL.toFixed(4)} | actual ${bttsApp.toFixed(4)} (${(((bttsBaseLL - bttsApp) / bttsBaseLL) * 100).toFixed(2)}%) | ajustado ${bttsFit.toFixed(4)} (${(((bttsBaseLL - bttsFit) / bttsBaseLL) * 100).toFixed(2)}%)`);

    const overApp = binaryLogLoss(appAligned.map((r) => ({ p: r.pOver, actual: r.actualOver })));
    const overFit = binaryLogLoss(fitRows.map((r) => ({ p: r.pOver, actual: r.actualOver })));
    const overBaseLL = binaryLogLoss(appAligned.map((r) => ({ p: overBase, actual: r.actualOver })));
    console.log(`Over 2.5      — base ${overBaseLL.toFixed(4)} | actual ${overApp.toFixed(4)} (${(((overBaseLL - overApp) / overBaseLL) * 100).toFixed(2)}%) | ajustado ${overFit.toFixed(4)} (${(((overBaseLL - overFit) / overBaseLL) * 100).toFixed(2)}%)`);

    // --- draw bias, the shipped model's known flaw ---
    const drawReal = baseD;
    const drawApp = appAligned.reduce((s, r) => s + r.pDraw, 0) / n;
    const drawFit = fitRows.reduce((s, r) => s + r.pDraw, 0) / n;
    console.log(`\n${"-".repeat(76)}`);
    console.log(`SESGO DE EMPATES (empates reales: ${(drawReal * 100).toFixed(1)}%)`);
    console.log("-".repeat(76));
    console.log(`Fórmula actual predice   ${(drawApp * 100).toFixed(1)}%   desvío ${((drawApp - drawReal) * 100).toFixed(1)} pp`);
    console.log(`Dixon-Coles ajustado     ${(drawFit * 100).toFixed(1)}%   desvío ${((drawFit - drawReal) * 100).toFixed(1)} pp`);

    // --- calibration of the favourite, the number the bettor reads ---
    console.log(`\n${"-".repeat(76)}`);
    console.log(`CALIBRACIÓN DEL FAVORITO — ajustado`);
    console.log("-".repeat(76));
    console.log(`Rango dicho    n     acierto real   desvío`);
    for (const start of [35, 40, 45, 50, 55, 60, 65, 70]) {
      const end = start + 5;
      const bucket = fitRows.filter((r) => {
        const f = Math.max(r.pHome, r.pDraw, r.pAway) * 100;
        return f >= start && f < end;
      });
      if (bucket.length < 10) continue;
      const hits = bucket.filter((r) => {
        const fav = r.pHome >= r.pDraw && r.pHome >= r.pAway ? "home" : r.pAway >= r.pDraw ? "away" : "draw";
        return fav === r.actual;
      }).length;
      const real = hits / bucket.length;
      const said = (start + end) / 2 / 100;
      console.log(
        `${String(start).padStart(3)}-${end}%     ${String(bucket.length).padStart(4)}      ${(real * 100).toFixed(1).padStart(5)}%      ${real - said >= 0 ? "+" : ""}${((real - said) * 100).toFixed(1)} pp`
      );
    }
  });

  // The sweep above chose its hyperparameters on the same seasons it reported on, and
  // both optima sat on the edge of the grid. Widen the grid, choose on 2023-24 only,
  // and report on a 2025 the search never saw.
  it("widens the grid and validates on an untouched season", () => {
    const TRAIN = [2023, 2024];
    const HOLDOUT = [2025];

    console.log(`\n${"=".repeat(76)}`);
    console.log(`REJILLA AMPLIADA — elegida en ${TRAIN.join("+")}, verificada en ${HOLDOUT}`);
    console.log("=".repeat(76));

    let best: { halfLife: number; reg: number; ll: number } | null = null;
    console.log(`\nvida media   regularización   log loss (entreno)`);
    for (const halfLife of [90, 150, 250, 400, 99999]) {
      for (const reg of [0.05, 0.12, 0.25, 0.45]) {
        const rows = runFittedBacktest(halfLife, reg, TRAIN);
        const ll = logLoss(rows);
        const flag = !best || ll < best.ll ? "  ←" : "";
        console.log(`${halfLife === 99999 ? "  sin decaer" : String(halfLife).padStart(8) + "d"}   ${String(reg).padStart(12)}   ${ll.toFixed(4)}${flag}`);
        if (!best || ll < best.ll) best = { halfLife, reg, ll };
      }
    }

    console.log(`\nElegido: vida media ${best!.halfLife === 99999 ? "sin decaimiento" : best!.halfLife + " días"}, regularización ${best!.reg}`);

    const holdFit = runFittedBacktest(best!.halfLife, best!.reg, HOLDOUT);
    const appHold = backtest(APP_PARAMS, HOLDOUT);
    const appHoldByKey = new Map(appHold.map((r) => [r.key, r]));
    const aligned = holdFit.filter((r) => appHoldByKey.has(r.key));
    const appAligned = aligned.map((r) => appHoldByKey.get(r.key)!);
    const n = aligned.length;

    const bH = appAligned.filter((r) => r.actual === "home").length / n;
    const bD = appAligned.filter((r) => r.actual === "draw").length / n;
    const bA = 1 - bH - bD;
    const baseLL =
      appAligned.reduce((s, r) => s - Math.log(r.actual === "home" ? bH : r.actual === "draw" ? bD : bA), 0) / n;

    const appLL = logLoss(appAligned);
    const fitLL = logLoss(aligned);

    console.log(`\n${"-".repeat(76)}`);
    console.log(`VALIDACIÓN CIEGA EN 2025 — ${n} partidos que la búsqueda nunca vio`);
    console.log("-".repeat(76));
    console.log(`Tasas base            ${baseLL.toFixed(4)}`);
    console.log(`Fórmula actual        ${appLL.toFixed(4)}   ventaja ${(((baseLL - appLL) / baseLL) * 100).toFixed(2)}%`);
    console.log(`Dixon-Coles ajustado  ${fitLL.toFixed(4)}   ventaja ${(((baseLL - fitLL) / baseLL) * 100).toFixed(2)}%`);

    const cmp = paired(
      aligned.map((r) => -Math.log(Math.max(r.actual === "home" ? r.pHome : r.actual === "draw" ? r.pDraw : r.pAway, 1e-15))),
      appAligned.map((r) => -Math.log(Math.max(r.actual === "home" ? r.pHome : r.actual === "draw" ? r.pDraw : r.pAway, 1e-15)))
    );
    console.log(`\nPrueba pareada en la temporada ciega: t = ${cmp.t.toFixed(2)}`);
    console.log(
      Math.abs(cmp.t) < 2
        ? `→ la mejora no se confirma fuera de muestra`
        : cmp.t > 0
          ? `→ la mejora SE SOSTIENE fuera de muestra`
          : `→ fuera de muestra resulta peor`
    );
  });
});
