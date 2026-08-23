# Football Predictor

A **Next.js 16** app that estimates probabilities for football betting markets (1X2, correct
score, both teams to score, double chance, over/under, team to score) and compares them against
the **real prices** a bookmaker is offering, to compute expected value and stake size.

Match data from [football-data.org](https://www.football-data.org), odds from
[odds-api.io](https://odds-api.io), both on free plans. Covers the 10 competitions the free plan
includes.

> Before working on the code, read [AGENTS.md](AGENTS.md): it holds the project log, the design
> decisions that should not be reverted, and the known traps.

## How the model works

Every team gets an **attack** and a **defense** parameter, fitted jointly by **maximum
likelihood** along with home advantage and the Dixon-Coles rho, chosen to maximise the
likelihood of every result actually observed (`src/lib/poisson/dixonColesFit.ts`):

```
λ_home = exp(attack[home] + defense[away] + homeAdvantage)
λ_away = exp(attack[away] + defense[home])
```

Because the fit is joint, strength is measured **relative to the opposition actually faced**:
thrashing the bottom side does not count the same as thrashing the leader. Optimisation is Adam
on the analytic gradient, with exponential time decay and L2 regularisation.

Those two λ build a bivariate Poisson matrix (0-10 goals per side), corrected by Dixon-Coles on
the low scorelines, from which every market is derived.

Everything is fitted per league: home advantage lands at **1.43x in Brazil and 1.25x in Italy**,
and rho ranges from −0.124 to +0.007 depending on the competition.

A fallback path also exists (ratio of averages, Maher 1982), used only when no matches are
cached for that competition yet.

### How good it is

Walk-forward backtest across 5 leagues and 3735 matches, no lookahead:

| League | Original formula | Current formula |
|---|---|---|
| Spain | +4.76% | **+6.46%** |
| Italy | +6.43% | **+7.51%** |
| England | +4.86% | **+5.68%** |
| Germany | +3.96% | **+4.98%** |
| Brazil | +0.41% | **+2.27%** |
| **Pooled** | +4.10% | **+5.42%** (t=4.55) |

Figures are log-loss improvement over the league's own base rates. Better in all five with
identical settings, chosen on 2023-24 and confirmed on a 2025 the search never saw.

**This does not mean it beats the market.** A bookmaker runs 8-12% skill and additionally charges
a 5-7% margin. The app exists to provide a well-calibrated baseline, not to guarantee profit.
Measured per market, none showed skill distinguishable from chance — those numbers are shown in
the UI itself when a bet is selected.

## Requirements

- Node.js 20+
- A free API key from [football-data.org](https://www.football-data.org/client/register)
- A free API key from [odds-api.io](https://odds-api.io) (optional — without it the app still
  works, odds just have to be typed in by hand)

## Setup

```bash
npm install
cp .env.example .env     # paste your keys
npx prisma migrate dev   # creates prisma/dev.db
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build
- `npm test` — 112 tests (Vitest)
- `npx prisma studio` — inspect the SQLite database

Offline backtests run separately and need downloaded data; see [AGENTS.md](AGENTS.md).

## Layout

- `src/lib/poisson/` — the model, pure, with no network or DB dependencies
- `src/lib/oddsApi/` — real odds: client, markets, fixture matching, quota accounting
- `src/lib/betting/` — Kelly, settlement, measured per-market reliability
- `src/lib/predictions/` — prediction tracking and evaluation
- `src/lib/cache/` — cache layers over SQLite
- `scripts/` — offline backtests
- `prisma/schema.prisma` — database schema

## A note on the data sources

football-data.org's free `/standings` endpoint returns only the `TOTAL` table, with no home/away
split. The app downloads finished matches (`/matches?status=FINISHED`) and aggregates them team
by team (`src/lib/cache/standingsCache.ts:aggregateFromMatches`). That same match cache feeds the
model fit.

Odds are requested in batches of 10 fixtures and cached for 30 minutes: pricing a full matchday
costs 4 of the 500 daily requests. On odds-api.io's free plan, only Bet365 returns data in
practice.

## Language convention

Code, comments and documentation are in English. User-facing strings — the UI and the error
messages the app surfaces — are in Spanish, as is the console output of the `scripts/` backtests.
