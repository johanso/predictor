import { describe, it, expect } from "vitest";
import { fitDixonColes, fittedLambdas, type FitMatch } from "@/lib/poisson/dixonColesFit";

// Deterministic RNG so a failure is always reproducible.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function samplePoisson(lambda: number, rand: () => number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > limit);
  return k - 1;
}

/**
 * Builds a full double round-robin from known attack/defense parameters, so the fit
 * can be checked against the truth that generated the data. This is the test that
 * actually exercises the gradient — if the analytic derivatives were wrong, the
 * recovered ratings would not correlate with the ones used to simulate.
 */
function simulateLeague(
  trueAttack: number[],
  trueDefense: number[],
  homeAdvantage: number,
  repeats = 1,
  seed = 42
): { matches: FitMatch[]; teamIds: number[] } {
  const rand = mulberry32(seed);
  const teamIds = trueAttack.map((_, i) => 100 + i);
  const matches: FitMatch[] = [];
  const start = new Date("2025-04-01T00:00:00Z");
  let day = 0;

  for (let rep = 0; rep < repeats; rep++) {
    for (let h = 0; h < teamIds.length; h++) {
      for (let a = 0; a < teamIds.length; a++) {
        if (h === a) continue;
        const lambda = Math.exp(trueAttack[h] + trueDefense[a] + homeAdvantage);
        const mu = Math.exp(trueAttack[a] + trueDefense[h]);
        matches.push({
          homeTeamId: teamIds[h],
          awayTeamId: teamIds[a],
          homeGoals: samplePoisson(lambda, rand),
          awayGoals: samplePoisson(mu, rand),
          utcDate: new Date(start.getTime() + day++ * 24 * 60 * 60 * 1000),
        });
      }
    }
  }

  return { matches, teamIds };
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

describe("fitDixonColes", () => {
  const trueAttack = [0.45, 0.3, 0.15, 0.05, -0.05, -0.15, -0.3, -0.45];
  const trueDefense = [-0.4, -0.25, -0.1, 0.0, 0.05, 0.15, 0.25, 0.4];
  const trueHomeAdvantage = 0.28;

  // Low regularization throughout these three: they ask whether the optimiser finds
  // the truth, not whether the shrinkage the app ships with is well chosen.
  const RECOVERY_OPTS = { halfLifeDays: 1e6, regularization: 0.001, maxIterations: 800 };

  it("recovers the attack ratings that generated the data", () => {
    const { matches, teamIds } = simulateLeague(trueAttack, trueDefense, trueHomeAdvantage, 4);
    const fit = fitDixonColes(matches, RECOVERY_OPTS);

    const recovered = teamIds.map((id) => fit.attack.get(id)!);
    expect(pearson(trueAttack, recovered)).toBeGreaterThan(0.8);
  });

  it("recovers the defense ratings that generated the data", () => {
    const { matches, teamIds } = simulateLeague(trueAttack, trueDefense, trueHomeAdvantage, 4);
    const fit = fitDixonColes(matches, RECOVERY_OPTS);

    const recovered = teamIds.map((id) => fit.defense.get(id)!);
    expect(pearson(trueDefense, recovered)).toBeGreaterThan(0.8);
  });

  /**
   * The property that distinguishes a correct estimator from a broken one: given more
   * data it must converge on the truth. A wrong gradient would plateau instead.
   * (At one round-robin the correlation is only ~0.6 — that is genuine sampling noise
   * with 16 team parameters and 56 matches, not a defect, and it is why the app's
   * ratings are soft early in a season.)
   */
  it("converges on the true ratings as the sample grows", () => {
    const small = simulateLeague(trueAttack, trueDefense, trueHomeAdvantage, 1);
    const large = simulateLeague(trueAttack, trueDefense, trueHomeAdvantage, 16);

    const fitSmall = fitDixonColes(small.matches, RECOVERY_OPTS);
    const fitLarge = fitDixonColes(large.matches, RECOVERY_OPTS);

    const corrSmall = pearson(trueAttack, small.teamIds.map((id) => fitSmall.attack.get(id)!));
    const corrLarge = pearson(trueAttack, large.teamIds.map((id) => fitLarge.attack.get(id)!));

    expect(corrLarge).toBeGreaterThan(corrSmall);
    expect(corrLarge).toBeGreaterThan(0.95);
  });

  it("recovers home advantage once the sample is big enough to identify it", () => {
    const { matches } = simulateLeague(trueAttack, trueDefense, trueHomeAdvantage, 4);
    const fit = fitDixonColes(matches, RECOVERY_OPTS);

    expect(fit.homeAdvantage).toBeGreaterThan(0.15);
    expect(fit.homeAdvantage).toBeLessThan(0.45);
  });

  it("holds the mean attack at zero so the parameters stay identified", () => {
    const { matches, teamIds } = simulateLeague(trueAttack, trueDefense, trueHomeAdvantage);
    const fit = fitDixonColes(matches);

    const mean = teamIds.reduce((s, id) => s + fit.attack.get(id)!, 0) / teamIds.length;
    expect(Math.abs(mean)).toBeLessThan(1e-9);
  });

  it("keeps rho in the region where the low-score correction stays positive", () => {
    const { matches } = simulateLeague(trueAttack, trueDefense, trueHomeAdvantage);
    const fit = fitDixonColes(matches);

    expect(fit.rho).toBeGreaterThan(-1);
    expect(fit.rho).toBeLessThan(1);
    // tau(1,1) = 1 - rho must stay positive, as must tau(0,0) at the fitted rates.
    expect(1 - fit.rho).toBeGreaterThan(0);
  });

  it("gives the stronger team the higher expected goals", () => {
    const { matches, teamIds } = simulateLeague(trueAttack, trueDefense, trueHomeAdvantage);
    const fit = fitDixonColes(matches);

    const best = teamIds[0];
    const worst = teamIds[teamIds.length - 1];
    const strongAtHome = fittedLambdas(fit, best, worst);
    const weakAtHome = fittedLambdas(fit, worst, best);

    expect(strongAtHome.lambdaHome).toBeGreaterThan(weakAtHome.lambdaHome);
    expect(strongAtHome.lambdaAway).toBeLessThan(weakAtHome.lambdaAway);
  });

  it("treats an unknown team as league average rather than throwing", () => {
    const { matches, teamIds } = simulateLeague(trueAttack, trueDefense, trueHomeAdvantage);
    const fit = fitDixonColes(matches);

    const { lambdaHome, lambdaAway } = fittedLambdas(fit, 999999, teamIds[0]);
    expect(Number.isFinite(lambdaHome)).toBe(true);
    expect(Number.isFinite(lambdaAway)).toBe(true);
    expect(lambdaHome).toBeGreaterThan(0);
  });

  it("weights recent matches more when a short half-life is set", () => {
    const teamIds = [1, 2];
    const start = new Date("2025-01-01T00:00:00Z");
    // Team 1 thrashed team 2 long ago, then lost heavily to them recently.
    const matches: FitMatch[] = [
      { homeTeamId: 1, awayTeamId: 2, homeGoals: 5, awayGoals: 0, utcDate: start },
      { homeTeamId: 1, awayTeamId: 2, homeGoals: 5, awayGoals: 0, utcDate: new Date(start.getTime() + 86400000) },
      { homeTeamId: 1, awayTeamId: 2, homeGoals: 0, awayGoals: 5, utcDate: new Date(start.getTime() + 300 * 86400000) },
      { homeTeamId: 1, awayTeamId: 2, homeGoals: 0, awayGoals: 5, utcDate: new Date(start.getTime() + 301 * 86400000) },
    ];

    const longMemory = fitDixonColes(matches, { halfLifeDays: 1e6, regularization: 0.001 });
    const shortMemory = fitDixonColes(matches, { halfLifeDays: 15, regularization: 0.001 });

    // With a short memory only the recent thrashings count, so team 2 must rate higher.
    const gapShort = shortMemory.attack.get(2)! - shortMemory.attack.get(1)!;
    const gapLong = longMemory.attack.get(2)! - longMemory.attack.get(1)!;
    expect(gapShort).toBeGreaterThan(gapLong);
  });

  it("rejects an empty match list instead of returning a meaningless fit", () => {
    expect(() => fitDixonColes([])).toThrow(/no matches/i);
  });
});
