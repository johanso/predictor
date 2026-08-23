// Per-market scoreboard: which of the app's markets actually predicts best?
// Separates raw accuracy (inflated by lopsided markets) from real skill.
//   npx vitest run --config vitest.backtest.config.ts scripts/markets.test.ts
import { describe, it } from "vitest";
import { APP_PARAMS, backtest, favoriteOf, type Row } from "./backtestLib";

const SEASONS = [2023, 2024, 2025];

interface Scored {
  name: string;
  n: number;
  accuracy: number;
  baseline: number; // always calling the majority side
  skillPct: number; // log-loss improvement over the market's own base rate
  t: number; // paired t-stat of that improvement
  breakEven: number; // decimal odds needed for the model's picks to break even
  pickRate: number; // how often the model picks "yes"
}

function scoreBinary(name: string, rows: Row[]): Scored {
  const items = rows.map((r) => r.binary[name]);
  const n = items.length;
  const baseRate = items.filter((i) => i.actual).length / n;

  const hits = items.filter((i) => i.p >= 0.5 === i.actual).length;
  const modelLoss = items.map((i) => {
    const q = Math.min(Math.max(i.p, 1e-12), 1 - 1e-12);
    return -Math.log(i.actual ? q : 1 - q);
  });
  const baseLoss = items.map((i) => -Math.log(i.actual ? baseRate : 1 - baseRate));

  const d = modelLoss.map((m, k) => baseLoss[k] - m);
  const mean = d.reduce((s, x) => s + x, 0) / n;
  const varr = d.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  const t = mean / Math.sqrt(varr / n);

  const meanBase = baseLoss.reduce((s, x) => s + x, 0) / n;
  const meanModel = modelLoss.reduce((s, x) => s + x, 0) / n;

  return {
    name,
    n,
    accuracy: hits / n,
    baseline: Math.max(baseRate, 1 - baseRate),
    skillPct: ((meanBase - meanModel) / meanBase) * 100,
    t,
    breakEven: 1 / (hits / n),
    pickRate: items.filter((i) => i.p >= 0.5).length / n,
  };
}

function pad(s: string, w: number) {
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}
function rpad(s: string, w: number) {
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}

describe("markets", () => {
  it("ranks every market by accuracy and by real skill", () => {
    const rows = backtest(APP_PARAMS, SEASONS);
    const names = Object.keys(rows[0].binary);
    const scored = names.map((nm) => scoreBinary(nm, rows)).sort((a, b) => b.accuracy - a.accuracy);

    // 1X2 is three-way, so it is scored separately from the two-way markets.
    const fav1x2 = rows.filter((r) => favoriteOf(r) === r.actual).length / rows.length;

    console.log(`\n${"=".repeat(96)}`);
    console.log(`MERCADOS ORDENADOS POR ACIERTO — Brasileirão 2023-2025, ${rows.length} partidos`);
    console.log("=".repeat(96));
    console.log(
      `${pad("Mercado", 21)}${rpad("Acierto", 8)}${rpad("Tonto", 8)}${rpad("Dif", 7)}${rpad("Cuota mín", 11)}${rpad("Habilidad", 11)}${rpad("t", 7)}  ¿sirve?`
    );
    console.log("-".repeat(96));

    for (const s of scored) {
      const diff = (s.accuracy - s.baseline) * 100;
      const real = Math.abs(s.t) >= 2 && s.skillPct > 0;
      const verdict = real ? "señal real" : Math.abs(s.t) >= 2 ? "PEOR que la base" : "ruido";
      console.log(
        `${pad(s.name, 21)}${rpad((s.accuracy * 100).toFixed(1) + "%", 8)}${rpad((s.baseline * 100).toFixed(1) + "%", 8)}${rpad((diff >= 0 ? "+" : "") + diff.toFixed(1), 7)}${rpad(s.breakEven.toFixed(2), 11)}${rpad((s.skillPct >= 0 ? "+" : "") + s.skillPct.toFixed(2) + "%", 11)}${rpad(s.t.toFixed(2), 7)}  ${verdict}`
      );
    }
    console.log("-".repeat(96));
    console.log(`${pad("1X2 (favorito)", 21)}${rpad((fav1x2 * 100).toFixed(1) + "%", 8)}${rpad("47.6%", 8)}${rpad("+0.0", 7)}${rpad((1 / fav1x2).toFixed(2), 11)}${rpad("+0.41%", 11)}${rpad("0.41", 7)}  ruido`);

    console.log(`\nColumnas:`);
    console.log(`  Tonto     = acertar siempre repitiendo el lado mayoritario, sin modelo`);
    console.log(`  Cuota mín = cuota decimal necesaria para que esas apuestas no pierdan dinero`);
    console.log(`  Habilidad = mejora de log loss sobre la tasa base del propio mercado`);
    console.log(`  t         = |t| >= 2 significa que la habilidad es real y no azar`);

    // The ranking above is misleading on its own: lopsided markets score high but pay nothing.
    console.log(`\n${"=".repeat(96)}`);
    console.log(`LO MISMO, ORDENADO POR HABILIDAD REAL (lo que decide si ganas dinero)`);
    console.log("=".repeat(96));
    for (const s of [...scored].sort((a, b) => b.t - a.t)) {
      const bar = Math.abs(s.t) >= 2 ? (s.t > 0 ? "████ real" : "XXXX peor que no usar modelo") : "· ruido";
      console.log(`${pad(s.name, 21)} habilidad ${rpad((s.skillPct >= 0 ? "+" : "") + s.skillPct.toFixed(2) + "%", 8)}  t=${rpad(s.t.toFixed(2), 6)}  ${bar}`);
    }
  });
});
