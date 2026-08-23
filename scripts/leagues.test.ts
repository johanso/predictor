// Does the fitted model generalise, or was it tuned into working on Brazil?
// Runs the same head-to-head in every downloaded league, with the SAME shipped
// hyperparameters everywhere — nothing is re-tuned per league.
//   npx vitest run --config vitest.backtest.config.ts scripts/leagues.test.ts
import { describe, it } from "vitest";
import { APP_PARAMS, availableLeagues, availableSeasons, backtest, loadSeason } from "./backtestLib";
import { DEFAULT_FIT_OPTIONS, fitDixonColes, fittedLambdas, type DixonColesFit } from "@/lib/poisson/dixonColesFit";
import { applyDixonColesAdjustment } from "@/lib/poisson/dixonColes";
import { buildProbabilityMatrix, oneXTwoProbabilities } from "@/lib/poisson/markets";

const MIN_PRIOR = 5;
const REFIT_EVERY = 5;

type Outcome = "home" | "draw" | "away";

interface FitRow {
  key: string;
  pHome: number;
  pDraw: number;
  pAway: number;
  actual: Outcome;
}

/** Walk-forward with the shipped defaults. No per-league tuning of any kind. */
function fittedBacktest(league: string, seasons: number[]): FitRow[] {
  const rows: FitRow[] = [];

  for (const season of seasons) {
    const matches = loadSeason(season, league);
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
          { ...DEFAULT_FIT_OPTIONS, referenceDate: m.date }
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
        actual: m.homeGoals > m.awayGoals ? "home" : m.homeGoals < m.awayGoals ? "away" : "draw",
      });
    }
  }
  return rows;
}

const pick = (r: { pHome: number; pDraw: number; pAway: number }, o: Outcome) =>
  o === "home" ? r.pHome : o === "draw" ? r.pDraw : r.pAway;

const losses = (rows: { pHome: number; pDraw: number; pAway: number; actual: Outcome }[]) =>
  rows.map((r) => -Math.log(Math.max(pick(r, r.actual), 1e-15)));

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function paired(a: number[], b: number[]) {
  const n = a.length;
  const d = a.map((v, i) => b[i] - v); // positive => a has the lower loss
  const m = mean(d);
  const varr = d.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1);
  return m / Math.sqrt(varr / n);
}

describe("leagues", () => {
  it("runs the same head-to-head in every league with identical settings", () => {
    const leagues = availableLeagues();

    console.log(`\n${"=".repeat(84)}`);
    console.log(`¿LA FÓRMULA GENERALIZA? — mismos ajustes en todas las ligas, sin retocar nada`);
    console.log("=".repeat(84));
    console.log(`\nLiga   temporadas  partidos   ventaja ANTES   ventaja AHORA        t   veredicto`);
    console.log("-".repeat(84));

    const summary: { league: string; before: number; after: number; t: number; n: number }[] = [];
    const pooledFit: number[] = [];
    const pooledApp: number[] = [];

    for (const league of leagues) {
      const seasons = availableSeasons(league);
      const appRows = backtest(APP_PARAMS, seasons, league);
      const appByKey = new Map(appRows.map((r) => [r.key, r]));
      const fitRows = fittedBacktest(league, seasons).filter((r) => appByKey.has(r.key));
      const appAligned = fitRows.map((r) => appByKey.get(r.key)!);
      const n = fitRows.length;
      if (n < 50) continue;

      const bH = appAligned.filter((r) => r.actual === "home").length / n;
      const bD = appAligned.filter((r) => r.actual === "draw").length / n;
      const bA = 1 - bH - bD;
      const baseLL = mean(appAligned.map((r) => -Math.log(r.actual === "home" ? bH : r.actual === "draw" ? bD : bA)));

      const before = ((baseLL - mean(losses(appAligned))) / baseLL) * 100;
      const after = ((baseLL - mean(losses(fitRows))) / baseLL) * 100;
      const t = paired(losses(fitRows), losses(appAligned));

      const verdict = t >= 2 ? "MEJOR (sólido)" : t <= -2 ? "PEOR" : "mejor, no concluyente";
      console.log(
        `${league.padEnd(6)} ${String(seasons.length).padStart(6)}  ${String(n).padStart(8)}   ${(before >= 0 ? "+" : "") + before.toFixed(2)}%`.padEnd(52) +
          `${(after >= 0 ? "+" : "") + after.toFixed(2)}%`.padStart(8) +
          `${t.toFixed(2)}`.padStart(9) +
          `   ${verdict}`
      );
      summary.push({ league, before, after, t, n });
      pooledFit.push(...losses(fitRows));
      pooledApp.push(...losses(appAligned));
    }

    // Pooling every league is the strongest single test: many more matches, and any
    // one league's luck is diluted.
    const totalN = summary.reduce((s, x) => s + x.n, 0);
    const wBefore = summary.reduce((s, x) => s + x.before * x.n, 0) / totalN;
    const wAfter = summary.reduce((s, x) => s + x.after * x.n, 0) / totalN;
    console.log("-".repeat(84));
    console.log(`TODAS  ${String(summary.length).padStart(6)} ligas ${String(totalN).padStart(6)} partidos   ${(wBefore >= 0 ? "+" : "") + wBefore.toFixed(2)}% → ${(wAfter >= 0 ? "+" : "") + wAfter.toFixed(2)}%`);
    console.log(`Ligas donde mejora: ${summary.filter((s) => s.after > s.before).length}/${summary.length}`);

    const pooledT = paired(pooledFit, pooledApp);
    console.log(`\nPrueba pareada agrupada sobre los ${totalN} partidos: t = ${pooledT.toFixed(2)}`);
    console.log(
      Math.abs(pooledT) < 2
        ? `→ no concluyente ni siquiera agrupando`
        : pooledT > 0
          ? `→ la mejora es estadísticamente sólida en el conjunto`
          : `→ agrupando resulta peor`
    );
    // Independently of the t-statistic: if the change were neutral, each league would
    // be a coin flip, so k-of-k improvements has probability 1/2^k.
    const improved = summary.filter((s) => s.after > s.before).length;
    if (improved === summary.length) {
      console.log(`Además, mejorar en las ${improved} ligas por azar tendría probabilidad 1/${2 ** improved} = ${(100 / 2 ** improved).toFixed(1)}%`);
    }

    // Home advantage is fitted per league, so it should reproduce each league's own
    // reputation rather than a single hardcoded constant.
    console.log(`\n${"-".repeat(84)}`);
    console.log(`VENTAJA DE LOCAL AJUSTADA POR LIGA (multiplicador sobre los goles esperados)`);
    console.log("-".repeat(84));
    for (const league of leagues) {
      const seasons = availableSeasons(league);
      const all = seasons.flatMap((s) => loadSeason(s, league));
      if (all.length < 100) continue;
      const fit = fitDixonColes(
        all.map((p) => ({
          homeTeamId: p.homeId,
          awayTeamId: p.awayId,
          homeGoals: p.homeGoals,
          awayGoals: p.awayGoals,
          utcDate: p.date,
        })),
        { ...DEFAULT_FIT_OPTIONS, halfLifeDays: 1e9 }
      );
      const homeWinRate = all.filter((m) => m.homeGoals > m.awayGoals).length / all.length;
      console.log(
        `${league.padEnd(6)} ventaja local ${Math.exp(fit.homeAdvantage).toFixed(3)}x   rho ${fit.rho.toFixed(3).padStart(6)}   (gana local en el ${(homeWinRate * 100).toFixed(1)}% de los partidos)`
      );
    }
  });
});
