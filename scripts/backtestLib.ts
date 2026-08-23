// Shared machinery for the offline formula evaluation scripts. Not a test file
// and not part of the app — reads raw football-data.org season dumps so the
// sample is far larger than the app's local cache.
import fs from "node:fs";
import path from "node:path";
import { computeWeightedTeamGoalStats } from "@/lib/poisson/weighting";
import { computeLambdas } from "@/lib/poisson/matchup";
import {
  buildProbabilityMatrix,
  oneXTwoProbabilities,
  bttsProbabilities,
  overUnderProbabilities,
  overZeroFiveProbabilities,
  cleanSheetProbabilities,
  winToNilProbabilities,
} from "@/lib/poisson/markets";
import { applyDixonColesAdjustment } from "@/lib/poisson/dixonColes";
import type { LeagueAverages, TeamFactors, TeamGoalStats } from "@/types/domain";

/**
 * Where the season dumps live, one directory per competition code. They are not
 * committed (a few MB of raw API JSON each); fetch them first — the free tier does
 * serve past seasons, but only ~10 requests a minute:
 *
 *   for L in BSA PD PL SA BL1; do
 *     mkdir -p "data/$L"
 *     for S in 2023 2024 2025; do
 *       curl -s -H "X-Auth-Token: $FOOTBALL_DATA_API_KEY" \
 *         "https://api.football-data.org/v4/competitions/$L/matches?status=FINISHED&season=$S" \
 *         -o "data/$L/$S.json"
 *     done
 *   done
 */
export const DATA_DIR = process.env.FOOTBALL_DATA_DIR ?? "data";

export interface Match {
  date: Date;
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
}

const seasonCache = new Map<string, Match[]>();

/** Competition codes with at least one downloaded season, in directory order. */
export function availableLeagues(): string[] {
  return fs
    .readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.readdirSync(path.join(DATA_DIR, d.name)).some((f) => f.endsWith(".json")))
    .map((d) => d.name);
}

export function availableSeasons(league: string): number[] {
  return fs
    .readdirSync(path.join(DATA_DIR, league))
    .filter((f) => f.endsWith(".json"))
    .map((f) => Number(f.replace(".json", "")))
    .sort((a, b) => a - b);
}

export function loadSeason(year: number, league = "BSA"): Match[] {
  const key = `${league}-${year}`;
  const cached = seasonCache.get(key);
  if (cached) return cached;

  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, league, `${year}.json`), "utf8"));
  const matches: Match[] = raw.matches
    .filter((m: any) => m.score?.fullTime?.home !== null && m.score?.fullTime?.away !== null)
    .map((m: any) => ({
      date: new Date(m.utcDate),
      homeId: m.homeTeam.id,
      awayId: m.awayTeam.id,
      homeGoals: m.score.fullTime.home,
      awayGoals: m.score.fullTime.away,
    }))
    .sort((a: Match, b: Match) => a.date.getTime() - b.date.getTime());

  seasonCache.set(key, matches);
  return matches;
}

export interface Params {
  halfLifeDays: number;
  rho: number;
  pseudoMatches: number;
  /** Post-hoc draw inflation: multiplies P(draw) then renormalizes. 1 = off. */
  drawBoost: number;
  /** Pulls every 1X2 probability toward the league base rate. 0 = model as-is, 1 = pure base rate. */
  shrinkToBase: number;
  minPriorGames: number;
}

/** The formula exactly as the app ships it today. */
export const APP_PARAMS: Params = {
  halfLifeDays: 60, // DEFAULT_HALF_LIFE_DAYS
  rho: -0.13, // DEFAULT_RHO
  pseudoMatches: 4, // SHRINKAGE_PSEUDO_MATCHES
  drawBoost: 1,
  shrinkToBase: 0,
  minPriorGames: 5,
};

function leagueAveragesOf(teams: TeamGoalStats[]): LeagueAverages {
  const t = teams.reduce(
    (a, x) => ({
      ph: a.ph + x.playedHome,
      gfh: a.gfh + x.goalsForHome,
      gah: a.gah + x.goalsAgainstHome,
      pa: a.pa + x.playedAway,
      gfa: a.gfa + x.goalsForAway,
      gaa: a.gaa + x.goalsAgainstAway,
    }),
    { ph: 0, gfh: 0, gah: 0, pa: 0, gfa: 0, gaa: 0 }
  );
  return {
    avgGoalsScoredHome: t.gfh / t.ph,
    avgGoalsConcededHome: t.gah / t.ph,
    avgGoalsScoredAway: t.gfa / t.pa,
    avgGoalsConcededAway: t.gaa / t.pa,
  };
}

// Mirrors computeTeamFactors but with tunable shrinkage so it can be swept.
function factorsOf(team: TeamGoalStats, avg: LeagueAverages, pseudo: number): TeamFactors {
  const s = (goals: number, played: number, leagueRate: number) => (goals + pseudo * leagueRate) / (played + pseudo);
  const sh = s(team.goalsForHome, team.playedHome, avg.avgGoalsScoredHome);
  const ch = s(team.goalsAgainstHome, team.playedHome, avg.avgGoalsConcededHome);
  const sa = s(team.goalsForAway, team.playedAway, avg.avgGoalsScoredAway);
  const ca = s(team.goalsAgainstAway, team.playedAway, avg.avgGoalsConcededAway);
  return {
    teamId: team.teamId,
    teamName: team.teamName,
    avgGoalsScoredHome: sh,
    avgGoalsConcededHome: ch,
    avgGoalsScoredAway: sa,
    avgGoalsConcededAway: ca,
    attackFactorHome: sh / avg.avgGoalsScoredHome,
    attackFactorAway: sa / avg.avgGoalsScoredAway,
    defenseFactorHome: ch / avg.avgGoalsConcededHome,
    defenseFactorAway: ca / avg.avgGoalsConcededAway,
  };
}

export interface Row {
  season: number;
  key: string; // `${season}-${indexInSeason}` — lets other models align on the exact same match set
  homeId: number;
  awayId: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  pBtts: number;
  pOver: number;
  actual: "home" | "draw" | "away";
  actualBtts: boolean;
  actualOver: boolean;
  /** Every two-way market the app offers: predicted probability + what really happened. */
  binary: Record<string, { p: number; actual: boolean }>;
}

/** League base rates observed strictly BEFORE each match, used for the shrink-to-base blend. */
function runningBaseRates(prior: Match[]): { home: number; draw: number; away: number } {
  if (prior.length === 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  let h = 0;
  let d = 0;
  for (const p of prior) {
    if (p.homeGoals > p.awayGoals) h++;
    else if (p.homeGoals === p.awayGoals) d++;
  }
  return { home: h / prior.length, draw: d / prior.length, away: (prior.length - h - d) / prior.length };
}

export function backtest(params: Params, seasons: number[], league = "BSA"): Row[] {
  const rows: Row[] = [];

  for (const season of seasons) {
    const matches = loadSeason(season, league);

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const prior = matches.slice(0, i); // strictly earlier, same season — no lookahead

      const homeGames = prior.filter((p) => p.homeId === m.homeId).length;
      const awayGames = prior.filter((p) => p.awayId === m.awayId).length;
      if (homeGames < params.minPriorGames || awayGames < params.minPriorGames) continue;

      const weighted = computeWeightedTeamGoalStats(
        prior.map((p) => ({
          homeTeamId: p.homeId,
          awayTeamId: p.awayId,
          homeGoals: p.homeGoals,
          awayGoals: p.awayGoals,
          utcDate: p.date,
        })),
        m.date,
        params.halfLifeDays
      );

      const teams: TeamGoalStats[] = [...weighted.values()].map((w) => ({
        teamId: w.teamId,
        teamName: String(w.teamId),
        playedHome: w.playedHome,
        goalsForHome: w.goalsForHome,
        goalsAgainstHome: w.goalsAgainstHome,
        playedAway: w.playedAway,
        goalsForAway: w.goalsForAway,
        goalsAgainstAway: w.goalsAgainstAway,
      }));

      const home = teams.find((t) => t.teamId === m.homeId);
      const away = teams.find((t) => t.teamId === m.awayId);
      if (!home || !away || home.playedHome === 0 || away.playedAway === 0) continue;

      const avg = leagueAveragesOf(teams);
      const { lambdaHome, lambdaAway } = computeLambdas(
        factorsOf(home, avg, params.pseudoMatches),
        factorsOf(away, avg, params.pseudoMatches),
        avg
      );
      if (!Number.isFinite(lambdaHome) || !Number.isFinite(lambdaAway)) continue;

      const matrix = applyDixonColesAdjustment(buildProbabilityMatrix(lambdaHome, lambdaAway), lambdaHome, lambdaAway, params.rho);
      const { homeWin, draw, awayWin } = oneXTwoProbabilities(matrix);

      // Renormalize (the 11x11 grid truncates a sliver of mass) and apply draw boost.
      const boostedDraw = draw * params.drawBoost;
      const sum = homeWin + boostedDraw + awayWin;
      let pHome = homeWin / sum;
      let pDraw = boostedDraw / sum;
      let pAway = awayWin / sum;

      if (params.shrinkToBase > 0) {
        const b = runningBaseRates(prior);
        const k = params.shrinkToBase;
        pHome = (1 - k) * pHome + k * b.home;
        pDraw = (1 - k) * pDraw + k * b.draw;
        pAway = (1 - k) * pAway + k * b.away;
      }

      const btts = bttsProbabilities(matrix);
      const ou = overUnderProbabilities(matrix);
      const over05 = overZeroFiveProbabilities(matrix);
      const clean = cleanSheetProbabilities(matrix);
      const nil = winToNilProbabilities(matrix);
      const totalGoals = m.homeGoals + m.awayGoals;
      const line = (l: number) => ou.find((o) => o.line === l)!.over;

      rows.push({
        season,
        key: `${season}-${i}`,
        homeId: m.homeId,
        awayId: m.awayId,
        pHome,
        pDraw,
        pAway,
        pBtts: btts.yes,
        pOver: line(2.5),
        actual: m.homeGoals > m.awayGoals ? "home" : m.homeGoals < m.awayGoals ? "away" : "draw",
        actualBtts: m.homeGoals > 0 && m.awayGoals > 0,
        actualOver: totalGoals > 2,
        binary: {
          "Doble oport. 1X": { p: pHome + pDraw, actual: m.homeGoals >= m.awayGoals },
          "Doble oport. X2": { p: pDraw + pAway, actual: m.homeGoals <= m.awayGoals },
          "Doble oport. 12": { p: pHome + pAway, actual: m.homeGoals !== m.awayGoals },
          "AEM": { p: btts.yes, actual: m.homeGoals > 0 && m.awayGoals > 0 },
          "Over 0.5": { p: line(0.5), actual: totalGoals > 0 },
          "Over 1.5": { p: line(1.5), actual: totalGoals > 1 },
          "Over 2.5": { p: line(2.5), actual: totalGoals > 2 },
          "Over 3.5": { p: line(3.5), actual: totalGoals > 3 },
          "Local marca": { p: over05.home, actual: m.homeGoals > 0 },
          "Visitante marca": { p: over05.away, actual: m.awayGoals > 0 },
          "Portería 0 local": { p: clean.home, actual: m.awayGoals === 0 },
          "Portería 0 visit.": { p: clean.away, actual: m.homeGoals === 0 },
          "Gana s/recibir loc.": { p: nil.home, actual: m.homeGoals > m.awayGoals && m.awayGoals === 0 },
          "Gana s/recibir vis.": { p: nil.away, actual: m.awayGoals > m.homeGoals && m.homeGoals === 0 },
        },
      });
    }
  }

  return rows;
}

/** Mean -log(p assigned to what actually happened). Lower is better; the metric that decides if there is skill. */
export function logLoss1x2(rows: Row[]): number {
  return (
    rows.reduce((s, r) => {
      const p = r.actual === "home" ? r.pHome : r.actual === "draw" ? r.pDraw : r.pAway;
      return s - Math.log(Math.max(p, 1e-15));
    }, 0) / rows.length
  );
}

export function baseRateLogLoss1x2(rows: Row[]): number {
  const h = rows.filter((r) => r.actual === "home").length / rows.length;
  const d = rows.filter((r) => r.actual === "draw").length / rows.length;
  const a = 1 - h - d;
  return (
    rows.reduce((s, r) => {
      const p = r.actual === "home" ? h : r.actual === "draw" ? d : a;
      return s - Math.log(Math.max(p, 1e-15));
    }, 0) / rows.length
  );
}

export function favoriteOf(r: Row): "home" | "draw" | "away" {
  if (r.pHome >= r.pDraw && r.pHome >= r.pAway) return "home";
  if (r.pAway >= r.pDraw) return "away";
  return "draw";
}
