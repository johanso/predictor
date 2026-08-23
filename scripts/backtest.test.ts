import { describe, it } from "vitest";
import { prisma } from "@/lib/db";
import { computeWeightedTeamGoalStats, DEFAULT_HALF_LIFE_DAYS } from "@/lib/poisson/weighting";
import { predictMatchWithMatrix } from "@/lib/poisson";
import { qualifiesForTracking } from "@/lib/predictions/gate";
import type { TeamGoalStats } from "@/types/domain";

// Only BSA (Brasileirão) has enough played matches right now to backtest —
// the other leagues in the free football-data.org tier are early in their
// season or haven't started, so there isn't enough history to walk forward over.
const COMPETITION_CODE = "BSA";
const MIN_MATCHES_BEFORE_PREDICTING = 5; // per team, unweighted count, before we trust a prediction at all

type Outcome = "home" | "draw" | "away";

function favoriteOf(homeWin: number, draw: number, awayWin: number): Outcome {
  if (homeWin >= draw && homeWin >= awayWin) return "home";
  if (awayWin >= draw && awayWin >= homeWin) return "away";
  return "draw";
}

function sampleTier(n: number): "alta" | "media" | "baja" {
  if (n >= 10) return "alta";
  if (n >= 5) return "media";
  return "baja";
}

function actualOutcome(h: number, a: number): Outcome {
  if (h > a) return "home";
  if (h < a) return "away";
  return "draw";
}

function pct(hits: number, n: number): string {
  return n === 0 ? "  —  " : `${((hits / n) * 100).toFixed(1).padStart(5)}%`;
}

/** Break-even decimal odds for a given hit rate: bet is profitable only above this. */
function breakEvenOdds(hitRate: number): string {
  return hitRate === 0 ? "—" : (1 / hitRate).toFixed(2);
}

interface Row {
  pHome: number;
  pDraw: number;
  pAway: number;
  pBttsYes: number;
  pOver25: number;
  favorite: Outcome;
  favoriteProbability: number;
  qualifies: boolean;
  actual: Outcome;
  actualBtts: boolean;
  actualOver25: boolean;
}

describe("backtest", () => {
  it(`walk-forward backtests the Poisson formula on ${COMPETITION_CODE} history`, async () => {
    const matches = await prisma.match.findMany({
      where: { competitionCode: COMPETITION_CODE },
      orderBy: { utcDate: "asc" },
    });

    const rows: Row[] = [];
    let skipped = 0;

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const priorMatches = matches.slice(0, i); // strictly before this match — no lookahead

      const homePriorCount = priorMatches.filter((m) => m.homeTeamId === match.homeTeamId).length;
      const awayPriorCount = priorMatches.filter((m) => m.awayTeamId === match.awayTeamId).length;
      if (homePriorCount < MIN_MATCHES_BEFORE_PREDICTING || awayPriorCount < MIN_MATCHES_BEFORE_PREDICTING) {
        skipped++;
        continue;
      }

      const weighted = computeWeightedTeamGoalStats(
        priorMatches.map((m) => ({
          homeTeamId: m.homeTeamId,
          awayTeamId: m.awayTeamId,
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals,
          utcDate: m.utcDate,
        })),
        match.utcDate,
        DEFAULT_HALF_LIFE_DAYS
      );

      const teamIds = new Set<number>();
      for (const m of priorMatches) {
        teamIds.add(m.homeTeamId);
        teamIds.add(m.awayTeamId);
      }
      const allTeamStats: TeamGoalStats[] = [...teamIds].map((id) => {
        const w = weighted.get(id);
        return {
          teamId: id,
          teamName: String(id),
          playedHome: w?.playedHome ?? 0,
          goalsForHome: w?.goalsForHome ?? 0,
          goalsAgainstHome: w?.goalsAgainstHome ?? 0,
          playedAway: w?.playedAway ?? 0,
          goalsForAway: w?.goalsForAway ?? 0,
          goalsAgainstAway: w?.goalsAgainstAway ?? 0,
        };
      });

      let prediction;
      try {
        ({ prediction } = predictMatchWithMatrix(match.homeTeamId, match.awayTeamId, allTeamStats));
      } catch {
        skipped++;
        continue;
      }

      const pHome = prediction.oneXTwo.homeWin.probability;
      const pDraw = prediction.oneXTwo.draw.probability;
      const pAway = prediction.oneXTwo.awayWin.probability;
      const favorite = favoriteOf(pHome, pDraw, pAway);
      const favoriteProbability = Math.max(pHome, pDraw, pAway);

      rows.push({
        pHome,
        pDraw,
        pAway,
        pBttsYes: prediction.btts.yes.probability,
        pOver25: prediction.overUnder.find((ou) => ou.line === 2.5)?.over.probability ?? 0.5,
        favorite,
        favoriteProbability,
        qualifies: qualifiesForTracking(sampleTier(Math.min(homePriorCount, awayPriorCount))),
        actual: actualOutcome(match.homeGoals, match.awayGoals),
        actualBtts: match.homeGoals > 0 && match.awayGoals > 0,
        actualOver25: match.homeGoals + match.awayGoals > 2,
      });
    }

    const n = rows.length;
    console.log(`\n=== Backtest ${COMPETITION_CODE} — ${matches.length} partidos en caché, ${n} evaluados (${skipped} descartados por historial corto) ===`);

    // --- 1. What the league itself does, independent of any model. ---
    const baseHome = rows.filter((r) => r.actual === "home").length;
    const baseDraw = rows.filter((r) => r.actual === "draw").length;
    const baseAway = rows.filter((r) => r.actual === "away").length;
    const baseBtts = rows.filter((r) => r.actualBtts).length;
    const baseOver = rows.filter((r) => r.actualOver25).length;
    console.log(`\n--- TASAS BASE DE LA LIGA (lo que pasa sin modelo) ---`);
    console.log(`Gana local:        ${pct(baseHome, n)}   (${baseHome}/${n})`);
    console.log(`Empate:            ${pct(baseDraw, n)}   (${baseDraw}/${n})`);
    console.log(`Gana visitante:    ${pct(baseAway, n)}   (${baseAway}/${n})`);
    console.log(`Ambos marcan (sí): ${pct(baseBtts, n)}   (${baseBtts}/${n})`);
    console.log(`Over 2.5:          ${pct(baseOver, n)}   (${baseOver}/${n})`);

    // --- 2. Model vs. the dumbest possible strategy for each market. ---
    const model1x2 = rows.filter((r) => r.favorite === r.actual).length;
    const alwaysHome = baseHome;
    const modelBtts = rows.filter((r) => (r.pBttsYes >= 0.5) === r.actualBtts).length;
    const alwaysBttsYes = Math.max(baseBtts, n - baseBtts);
    const modelOver = rows.filter((r) => (r.pOver25 >= 0.5) === r.actualOver25).length;
    const alwaysOverBest = Math.max(baseOver, n - baseOver);

    console.log(`\n--- MODELO vs. ESTRATEGIA TONTA (misma muestra, n=${n}) ---`);
    console.log(`                        MODELO    BASELINE   ¿gana el modelo?`);
    console.log(`1X2 (favorito)          ${pct(model1x2, n)}    ${pct(alwaysHome, n)}    ${model1x2 > alwaysHome ? "SÍ" : "NO"}  (baseline = apostar siempre al local)`);
    console.log(`Ambos marcan            ${pct(modelBtts, n)}    ${pct(alwaysBttsYes, n)}    ${modelBtts > alwaysBttsYes ? "SÍ" : "NO"}  (baseline = repetir siempre el lado mayoritario)`);
    console.log(`Over/Under 2.5          ${pct(modelOver, n)}    ${pct(alwaysOverBest, n)}    ${modelOver > alwaysOverBest ? "SÍ" : "NO"}  (baseline = repetir siempre el lado mayoritario)`);

    // --- 3. Calibration: when the model says X%, does it happen X% of the time? ---
    console.log(`\n--- CALIBRACIÓN DEL FAVORITO (¿el % que dice es real?) ---`);
    console.log(`Rango dicho     n     acierto real   cuota mínima para ganar dinero`);
    for (const start of [40, 45, 50, 55, 60, 65, 70]) {
      const end = start + 5;
      const bucket = rows.filter((r) => r.favoriteProbability * 100 >= start && r.favoriteProbability * 100 < end);
      if (bucket.length === 0) continue;
      const hits = bucket.filter((r) => r.favorite === r.actual).length;
      console.log(
        `${String(start).padStart(3)}-${end}%      ${String(bucket.length).padStart(3)}    ${pct(hits, bucket.length)}         ${breakEvenOdds(hits / bucket.length).padStart(5)}`
      );
    }

    // --- 4. Same question for the two goal markets, by confidence band. ---
    console.log(`\n--- CALIBRACIÓN "AMBOS MARCAN — SÍ" ---`);
    console.log(`Rango dicho     n     ocurrió real   cuota mínima`);
    for (const start of [45, 50, 55, 60, 65]) {
      const end = start + 5;
      const bucket = rows.filter((r) => r.pBttsYes * 100 >= start && r.pBttsYes * 100 < end);
      if (bucket.length === 0) continue;
      const hits = bucket.filter((r) => r.actualBtts).length;
      console.log(
        `${String(start).padStart(3)}-${end}%      ${String(bucket.length).padStart(3)}    ${pct(hits, bucket.length)}         ${breakEvenOdds(hits / bucket.length).padStart(5)}`
      );
    }

    console.log(`\n--- CALIBRACIÓN "OVER 2.5" ---`);
    console.log(`Rango dicho     n     ocurrió real   cuota mínima`);
    for (const start of [40, 45, 50, 55, 60, 65]) {
      const end = start + 5;
      const bucket = rows.filter((r) => r.pOver25 * 100 >= start && r.pOver25 * 100 < end);
      if (bucket.length === 0) continue;
      const hits = bucket.filter((r) => r.actualOver25).length;
      console.log(
        `${String(start).padStart(3)}-${end}%      ${String(bucket.length).padStart(3)}    ${pct(hits, bucket.length)}         ${breakEvenOdds(hits / bucket.length).padStart(5)}`
      );
    }

    // --- 5. The gate as currently configured, plus what other thresholds would do. ---
    console.log(`\n--- FILTRO ACTUAL DE LA APP (favorito >=58%, confianza no baja) ---`);
    const q = rows.filter((r) => r.qualifies);
    const qWins = q.filter((r) => r.favorite === r.actual).length;
    console.log(`Señales: ${q.length}   Ganadas: ${qWins}   Perdidas: ${q.length - qWins}   Acierto: ${pct(qWins, q.length)}   Cuota mínima: ${breakEvenOdds(qWins / Math.max(q.length, 1))}`);

    console.log(`\n--- ¿Y SI BAJARA/SUBIERA EL UMBRAL? (solo favorito local, sin filtro de confianza) ---`);
    console.log(`Umbral    señales   acierto   cuota mínima`);
    for (const t of [0.45, 0.5, 0.55, 0.58, 0.6, 0.65]) {
      const sel = rows.filter((r) => r.favoriteProbability >= t);
      if (sel.length === 0) continue;
      const w = sel.filter((r) => r.favorite === r.actual).length;
      console.log(`>=${(t * 100).toFixed(0)}%       ${String(sel.length).padStart(3)}      ${pct(w, sel.length)}      ${breakEvenOdds(w / sel.length).padStart(5)}`);
    }

    // --- 6. Does the model add anything over "always bet the home team"? ---
    console.log(`\n--- DESGLOSE: ¿a quién señala el modelo como favorito? ---`);
    for (const side of ["home", "draw", "away"] as Outcome[]) {
      const sel = rows.filter((r) => r.favorite === side);
      if (sel.length === 0) continue;
      const w = sel.filter((r) => r.actual === side).length;
      console.log(`Favorito = ${side.padEnd(5)}  ${String(sel.length).padStart(3)} veces   acierto ${pct(w, sel.length)}   cuota mínima ${breakEvenOdds(w / sel.length)}`);
    }
  });
});
