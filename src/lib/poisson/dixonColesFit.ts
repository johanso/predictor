// Maximum-likelihood Dixon-Coles.
//
// The shipped model (teamStats.ts + matchup.ts) estimates each team's strength as
// a ratio of averages: goals scored / league average. That is Maher's 1982 shortcut
// and it has a real weakness — it credits a team for goals scored without asking who
// it played. Beat a bottom side 4-0 and your attack rating rises exactly as much as
// if you had beaten the leader.
//
// This module fits the same generative model properly instead: every team gets an
// attack and a defense parameter, plus a league-wide home advantage and the
// Dixon-Coles low-score correlation rho, all chosen jointly to maximise the
// (time-weighted) likelihood of every result actually observed. Because the fit is
// joint, strength is estimated *relative to the opposition faced* — the schedule is
// accounted for rather than ignored.
//
//   lambda_home = exp(attack[home] + defense[away] + homeAdvantage)
//   lambda_away = exp(attack[away] + defense[home])
//
// Optimised by Adam on the analytic gradient. Parameters are identified by holding
// the mean attack at zero (the model is otherwise invariant to shifting all attacks
// up and all defenses down by the same constant).

import { clampRho, tau } from "./dixonColes";

export interface FitMatch {
  homeTeamId: number;
  awayTeamId: number;
  homeGoals: number;
  awayGoals: number;
  utcDate: Date;
}

export interface DixonColesFit {
  attack: Map<number, number>;
  defense: Map<number, number>;
  homeAdvantage: number;
  rho: number;
  /** Mean weighted log-likelihood per match at the optimum — for comparing fits, not for display. */
  logLikelihood: number;
  iterations: number;
}

export interface FitOptions {
  /** Exponential decay applied to each match's contribution. Older results count less. */
  halfLifeDays?: number;
  /** Date the decay is measured from. Defaults to the most recent match in the sample. */
  referenceDate?: Date;
  /** L2 pull of attack/defense toward zero — the small-sample guard that replaces ad-hoc shrinkage. */
  regularization?: number;
  maxIterations?: number;
  learningRate?: number;
  /** Stop once the mean log-likelihood improves by less than this between iterations. */
  tolerance?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Chosen by grid search on Brasileirão 2023-2024 and confirmed on an untouched 2025
// (scripts/compare.test.ts). Regularization 0.12 was a clear optimum; the half-life
// barely mattered above ~150 days, so this is effectively "weight the whole season
// evenly" while still degrading gracefully if a cache ever spans more than one.
export const DEFAULT_FIT_OPTIONS: Required<Omit<FitOptions, "referenceDate">> = {
  halfLifeDays: 365,
  regularization: 0.12,
  maxIterations: 400,
  learningRate: 0.08,
  tolerance: 1e-7,
};

/** Partial derivative of log(tau) with respect to lambda and mu, for the four corrected cells. */
function tauGradient(x: number, y: number, lambda: number, mu: number, rho: number) {
  const t = tau(x, y, lambda, mu, rho);
  if (t <= 0) return { dLambda: 0, dMu: 0, value: t };

  let dTauDLambda = 0;
  let dTauDMu = 0;
  if (x === 0 && y === 0) {
    dTauDLambda = -mu * rho;
    dTauDMu = -lambda * rho;
  } else if (x === 0 && y === 1) {
    dTauDLambda = rho;
  } else if (x === 1 && y === 0) {
    dTauDMu = rho;
  }
  // (1,1) has no lambda/mu dependence: tau = 1 - rho.

  return { dLambda: dTauDLambda / t, dMu: dTauDMu / t, value: t };
}

/** d log(tau) / d rho, for the four corrected cells. */
function tauRhoGradient(x: number, y: number, lambda: number, mu: number, rho: number): number {
  const t = tau(x, y, lambda, mu, rho);
  if (t <= 0) return 0;
  if (x === 0 && y === 0) return (-lambda * mu) / t;
  if (x === 0 && y === 1) return lambda / t;
  if (x === 1 && y === 0) return mu / t;
  if (x === 1 && y === 1) return -1 / t;
  return 0;
}


export function fitDixonColes(matches: FitMatch[], options: FitOptions = {}): DixonColesFit {
  const opts = { ...DEFAULT_FIT_OPTIONS, ...options };
  if (matches.length === 0) throw new Error("fitDixonColes: no matches supplied");

  const referenceDate =
    options.referenceDate ?? matches.reduce((max, m) => (m.utcDate > max ? m.utcDate : max), matches[0].utcDate);

  const teamIds = [...new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))].sort((a, b) => a - b);
  const index = new Map(teamIds.map((id, i) => [id, i]));
  const n = teamIds.length;

  // Time weights, normalized so `regularization` and `learningRate` mean the same
  // thing regardless of sample size or half-life.
  const weights = matches.map((m) => {
    const ageDays = Math.max(0, (referenceDate.getTime() - m.utcDate.getTime()) / MS_PER_DAY);
    return Math.pow(0.5, ageDays / opts.halfLifeDays);
  });
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  const attack = new Array<number>(n).fill(0);
  const defense = new Array<number>(n).fill(0);
  let homeAdvantage = 0.25; // ~1.28x, a sane starting point for league football
  let rho = -0.05;

  // Adam moments for [attack..., defense..., homeAdvantage, rho].
  const size = 2 * n + 2;
  const m1 = new Array<number>(size).fill(0);
  const m2 = new Array<number>(size).fill(0);
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 1e-8;

  let previousLL = -Infinity;
  let iterations = 0;
  let meanLL = -Infinity;

  for (let iter = 1; iter <= opts.maxIterations; iter++) {
    iterations = iter;
    const grad = new Array<number>(size).fill(0);
    let ll = 0;
    let maxLambda = 0;
    let maxMu = 0;

    for (let k = 0; k < matches.length; k++) {
      const match = matches[k];
      const w = weights[k];
      if (w <= 0) continue;

      const h = index.get(match.homeTeamId)!;
      const a = index.get(match.awayTeamId)!;
      const x = match.homeGoals;
      const y = match.awayGoals;

      const lambda = Math.exp(attack[h] + defense[a] + homeAdvantage);
      const mu = Math.exp(attack[a] + defense[h]);
      if (lambda > maxLambda) maxLambda = lambda;
      if (mu > maxMu) maxMu = mu;

      const tg = tauGradient(x, y, lambda, mu, rho);
      // Poisson log-likelihood without the constant log(x!) term, plus the DC correction.
      ll += w * (Math.log(Math.max(tg.value, 1e-12)) + x * Math.log(lambda) - lambda + y * Math.log(mu) - mu);

      // d/d(linear predictor) = (observed - expected) + lambda * dlog(tau)/dlambda
      const dHome = w * (x - lambda + lambda * tg.dLambda);
      const dAway = w * (y - mu + mu * tg.dMu);

      grad[h] += dHome; // attack[home]
      grad[n + a] += dHome; // defense[away]
      grad[2 * n] += dHome; // homeAdvantage
      grad[a] += dAway; // attack[away]
      grad[n + h] += dAway; // defense[home]
      grad[2 * n + 1] += w * tauRhoGradient(x, y, lambda, mu, rho);
    }

    // Normalize to per-unit-weight, then apply L2 shrinkage toward zero.
    for (let i = 0; i < size; i++) grad[i] /= totalWeight;
    ll /= totalWeight;
    for (let i = 0; i < n; i++) {
      grad[i] -= opts.regularization * attack[i];
      grad[n + i] -= opts.regularization * defense[i];
      ll -= 0.5 * opts.regularization * (attack[i] ** 2 + defense[i] ** 2);
    }
    meanLL = ll;

    // Adam ascent (gradient of a likelihood we are maximising).
    const params = [...attack, ...defense, homeAdvantage, rho];
    for (let i = 0; i < size; i++) {
      m1[i] = beta1 * m1[i] + (1 - beta1) * grad[i];
      m2[i] = beta2 * m2[i] + (1 - beta2) * grad[i] * grad[i];
      const mHat = m1[i] / (1 - Math.pow(beta1, iter));
      const vHat = m2[i] / (1 - Math.pow(beta2, iter));
      params[i] += (opts.learningRate * mHat) / (Math.sqrt(vHat) + eps);
    }

    for (let i = 0; i < n; i++) {
      attack[i] = params[i];
      defense[i] = params[n + i];
    }
    homeAdvantage = params[2 * n];
    rho = clampRho(params[2 * n + 1], maxLambda, maxMu);

    // Identifiability: the likelihood is unchanged by adding c to every attack and
    // subtracting c from every defense, so pin the attack mean at zero each step.
    const attackMean = attack.reduce((s, v) => s + v, 0) / n;
    for (let i = 0; i < n; i++) {
      attack[i] -= attackMean;
      defense[i] += attackMean;
    }

    if (iter > 20 && Math.abs(ll - previousLL) < opts.tolerance) break;
    previousLL = ll;
  }

  return {
    attack: new Map(teamIds.map((id, i) => [id, attack[i]])),
    defense: new Map(teamIds.map((id, i) => [id, defense[i]])),
    homeAdvantage,
    rho,
    logLikelihood: meanLL,
    iterations,
  };
}

/**
 * Expected goals for a matchup under a fitted model. Teams absent from the fit
 * (newly promoted, no matches yet) fall back to league-average strength, which is
 * exactly what attack = defense = 0 encodes.
 */
export function fittedLambdas(fit: DixonColesFit, homeTeamId: number, awayTeamId: number) {
  const atkH = fit.attack.get(homeTeamId) ?? 0;
  const defH = fit.defense.get(homeTeamId) ?? 0;
  const atkA = fit.attack.get(awayTeamId) ?? 0;
  const defA = fit.defense.get(awayTeamId) ?? 0;

  return {
    lambdaHome: Math.exp(atkH + defA + fit.homeAdvantage),
    lambdaAway: Math.exp(atkA + defH),
  };
}
