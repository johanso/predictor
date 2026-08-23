// Two questions the earlier scripts could not answer:
//   1. Is the Poisson model's edge over league base rates statistically real, or noise?
//   2. Is a different, simple model (Elo + softmax) meaningfully better — i.e. is the
//      ceiling here higher than what the current formula reaches?
//   npx vitest run --config vitest.backtest.config.ts scripts/improve.test.ts
import { describe, it } from "vitest";
import { APP_PARAMS, backtest, loadSeason, type Row } from "./backtestLib";

const TRAIN = [2023, 2024];
const HOLDOUT = [2025];
const ALL = [...TRAIN, ...HOLDOUT];

type Outcome = "home" | "draw" | "away";
const CLASSES: Outcome[] = ["home", "draw", "away"];

function probOf(r: Row, o: Outcome): number {
  return o === "home" ? r.pHome : o === "draw" ? r.pDraw : r.pAway;
}

/**
 * Paired significance test on per-match log loss. Each match contributes
 * d = loss(baseline) - loss(model); if the mean of d is not several standard
 * errors above zero, the model's "edge" is indistinguishable from luck.
 */
function pairedTest(modelLosses: number[], baseLosses: number[]) {
  const n = modelLosses.length;
  const d = modelLosses.map((m, i) => baseLosses[i] - m);
  const mean = d.reduce((s, x) => s + x, 0) / n;
  const variance = d.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const se = Math.sqrt(variance / n);
  return { mean, se, t: mean / se, n };
}

function lossesVsBase(rows: Row[]) {
  const rate: Record<Outcome, number> = {
    home: rows.filter((r) => r.actual === "home").length / rows.length,
    draw: rows.filter((r) => r.actual === "draw").length / rows.length,
    away: rows.filter((r) => r.actual === "away").length / rows.length,
  };
  const model = rows.map((r) => -Math.log(Math.max(probOf(r, r.actual), 1e-15)));
  const base = rows.map((r) => -Math.log(Math.max(rate[r.actual], 1e-15)));
  return { model, base };
}

// ---------- Elo ----------
const ELO_K = 20;
const ELO_HOME_ADV = 60;
const SEASON_REGRESSION = 0.25; // pull ratings toward the mean between seasons

/** Walk-forward Elo: returns the pre-match rating diff for every match, keyed like backtestLib rows. */
function eloDiffs(seasons: number[]): Map<string, number> {
  const ratings = new Map<number, number>();
  const get = (id: number) => ratings.get(id) ?? 1500;
  const out = new Map<string, number>();

  for (const season of seasons) {
    for (const [id, r] of ratings) ratings.set(id, 1500 + (r - 1500) * (1 - SEASON_REGRESSION));

    const matches = loadSeason(season);
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const rh = get(m.homeId);
      const ra = get(m.awayId);
      out.set(`${season}-${i}`, rh + ELO_HOME_ADV - ra);

      const expected = 1 / (1 + Math.pow(10, -(rh + ELO_HOME_ADV - ra) / 400));
      const score = m.homeGoals > m.awayGoals ? 1 : m.homeGoals === m.awayGoals ? 0.5 : 0;
      // Goal-difference multiplier: a 3-0 moves ratings more than a 1-0.
      const gd = Math.abs(m.homeGoals - m.awayGoals);
      const mult = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
      const delta = ELO_K * mult * (score - expected);
      ratings.set(m.homeId, rh + delta);
      ratings.set(m.awayId, ra - delta);
    }
  }
  return out;
}

/** 3-class softmax regression on [1, eloDiff/100], fitted by gradient descent. */
function fitSoftmax(x: number[], y: Outcome[], iters = 4000, lr = 0.05) {
  const w = [
    [0, 0],
    [0, 0],
    [0, 0],
  ]; // [class][bias, slope]
  const n = x.length;

  const predict = (xi: number) => {
    const logits = w.map(([b, s]) => b + s * xi);
    const max = Math.max(...logits);
    const exp = logits.map((l) => Math.exp(l - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map((e) => e / sum);
  };

  for (let it = 0; it < iters; it++) {
    const grad = [
      [0, 0],
      [0, 0],
      [0, 0],
    ];
    for (let i = 0; i < n; i++) {
      const p = predict(x[i]);
      for (let c = 0; c < 3; c++) {
        const err = p[c] - (CLASSES[c] === y[i] ? 1 : 0);
        grad[c][0] += err;
        grad[c][1] += err * x[i];
      }
    }
    for (let c = 0; c < 3; c++) {
      w[c][0] -= (lr * grad[c][0]) / n;
      w[c][1] -= (lr * grad[c][1]) / n;
    }
  }
  return predict;
}

function meanLogLoss(probs: number[][], y: Outcome[]): number {
  return (
    y.reduce((s, actual, i) => {
      const p = probs[i][CLASSES.indexOf(actual)];
      return s - Math.log(Math.max(p, 1e-15));
    }, 0) / y.length
  );
}

describe("improve", () => {
  it("tests whether the edge is real, and whether a better model exists", () => {
    const all = backtest(APP_PARAMS, ALL);

    // ---------- 1. Is the Poisson edge statistically real? ----------
    console.log(`\n${"=".repeat(78)}`);
    console.log(`1. ¿LA VENTAJA DE LA FÓRMULA ES REAL O ES SUERTE?`);
    console.log("=".repeat(78));
    const { model, base } = lossesVsBase(all);
    const t = pairedTest(model, base);
    console.log(`Partidos: ${t.n}`);
    console.log(`Ventaja media por partido: ${t.mean >= 0 ? "+" : ""}${t.mean.toFixed(5)} nats`);
    console.log(`Error estándar:            ${t.se.toFixed(5)}`);
    console.log(`Estadístico t:             ${t.t.toFixed(2)}`);
    console.log(
      `\nVeredicto: ${Math.abs(t.t) < 2 ? "NO se distingue de cero. La 'ventaja' es ruido estadístico." : t.t > 0 ? "ventaja real (t>2)" : "el modelo es PEOR que las tasas base, y significativamente"}`
    );
    console.log(`(regla: |t| > 2 para poder afirmar que existe. Con t=${t.t.toFixed(2)} ${Math.abs(t.t) < 2 ? "no llegamos" : "sí llegamos"})`);

    // ---------- 2. Does a different model do better on the same matches? ----------
    console.log(`\n${"=".repeat(78)}`);
    console.log(`2. ¿EXISTE UN MODELO MEJOR? (Elo entrenado en ${TRAIN.join("+")}, probado en ${HOLDOUT})`);
    console.log("=".repeat(78));

    const diffs = eloDiffs(ALL);
    const trainRows = all.filter((r) => TRAIN.includes(r.season));
    const testRows = all.filter((r) => HOLDOUT.includes(r.season));

    const fit = fitSoftmax(
      trainRows.map((r) => diffs.get(r.key)! / 100),
      trainRows.map((r) => r.actual)
    );

    const testY = testRows.map((r) => r.actual);
    const eloProbs = testRows.map((r) => fit(diffs.get(r.key)! / 100));
    const poissonProbs = testRows.map((r) => [r.pHome, r.pDraw, r.pAway]);

    const trainRate: Record<Outcome, number> = {
      home: trainRows.filter((r) => r.actual === "home").length / trainRows.length,
      draw: trainRows.filter((r) => r.actual === "draw").length / trainRows.length,
      away: trainRows.filter((r) => r.actual === "away").length / trainRows.length,
    };
    const baseProbs = testRows.map(() => [trainRate.home, trainRate.draw, trainRate.away]);

    const llBase = meanLogLoss(baseProbs, testY);
    const llPoisson = meanLogLoss(poissonProbs, testY);
    const llElo = meanLogLoss(eloProbs, testY);

    console.log(`Partidos de prueba: ${testRows.length}\n`);
    console.log(`                        log loss    ventaja vs tasas base`);
    console.log(`Tasas base fijas         ${llBase.toFixed(4)}         —`);
    console.log(`Poisson (la app)         ${llPoisson.toFixed(4)}      ${(((llBase - llPoisson) / llBase) * 100).toFixed(2)}%`);
    console.log(`Elo + regresión          ${llElo.toFixed(4)}      ${(((llBase - llElo) / llBase) * 100).toFixed(2)}%`);

    const eloVsPoisson = pairedTest(
      testRows.map((_, i) => -Math.log(Math.max(eloProbs[i][CLASSES.indexOf(testY[i])], 1e-15))),
      testRows.map((_, i) => -Math.log(Math.max(poissonProbs[i][CLASSES.indexOf(testY[i])], 1e-15)))
    );
    console.log(`\nElo vs Poisson, prueba pareada: t = ${eloVsPoisson.t.toFixed(2)}`);
    console.log(
      Math.abs(eloVsPoisson.t) < 2
        ? `→ empatan. Ningún modelo simple saca ventaja clara sobre el otro.`
        : eloVsPoisson.t > 0
          ? `→ Elo es significativamente MEJOR que el Poisson actual.`
          : `→ el Poisson actual es significativamente mejor que Elo.`
    );

    // ---------- 3. What would it take to actually profit? ----------
    console.log(`\n${"=".repeat(78)}`);
    console.log(`3. CONTABILIDAD DE LO QUE HARÍA FALTA PARA GANAR DINERO`);
    console.log("=".repeat(78));
    const skill = ((llBase - llPoisson) / llBase) * 100;
    console.log(`Habilidad medida de la fórmula (sobre tasas base):  ${skill >= 0 ? "+" : ""}${skill.toFixed(2)}%`);
    console.log(`Margen típico de una casa real en 1X2:              5-7%`);
    console.log(`Habilidad típica de una casa real (literatura):     ~8-12% sobre tasas base`);
    console.log(`\nPara ganar necesitas: habilidad > habilidad_de_la_casa + su margen`);
    console.log(`Es decir, superar ~13-19% de habilidad. La fórmula llega a ${skill.toFixed(1)}%.`);
  });
});
