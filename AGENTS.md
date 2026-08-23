<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project log

Read this before touching the model, the betting UI, or the external API calls. Several
decisions here are deliberate and counter-intuitive; reverting them in the name of
"simplifying" breaks things that were expensive to measure.

**Language convention:** code, comments and documentation in English. User-facing strings —
the UI and the error messages the app surfaces — stay in Spanish, as does the console output
of the `scripts/` backtests, because the owner reads them.

## What this is and who it's for

A single-user local app that estimates football market probabilities and puts them next to the
real prices a bookmaker is offering. The owner bets his own money in small amounts and does the
off-pitch research himself — injuries, line-ups, rotation. **The app's job is a well-calibrated
base probability shown beside the real price**, not deciding for him.

Covers the 10 competitions on football-data.org's free plan. Practical focus has been the
Brasileirão, the only league in season during development.

## What is actually measured — don't oversell it

Walk-forward backtest across 5 leagues and 3735 matches (`scripts/`), no lookahead:

| | Edge over the league's own base rates |
|---|---|
| Original formula (ratio of averages) | +4.10% |
| **Current formula (fitted Dixon-Coles)** | **+5.42%**, t=4.55 |

By league: Spain +6.46%, Italy +7.51%, England +5.68%, Germany +4.98%, Brazil +2.27%. Better in
5 of 5 with identical settings, nothing tuned per country.

**What this does NOT mean:** that it beats the market. Profiting requires exceeding the
bookmaker's own skill *plus* its margin (~5-7%), and bookmakers run 8-12% skill over base rates.
Brazil is also the hardest of the five.

Per market, measured in `scripts/markets.test.ts`: **no market showed skill distinguishable from
chance** (all |t| < 2). Those figures live in `src/lib/betting/reliability.ts` and are shown in
the UI when a market is selected, deliberately — a "positive value" means the model disagrees
with the bookmaker, not that it is right.

If you improve the model, **re-run the backtests and update these numbers** — here, in
`reliability.ts`, and in the README.

## Architecture

```
football-data.org ──> standingsCache ──> Match/TeamStanding (SQLite)
   (10 req/min)            │
                           ├──> ratingsCache ──> Dixon-Coles fit (in memory)
                           │                          │
                           └──> predict.ts <──────────┘
                                    │
odds-api.io ──────> oddsCache ──> OddsSnapshot ──> BetSlipCard
   (500 req/day)                                        │
                                                   Bet / Bankroll
```

- `src/lib/poisson/` — pure computation, no network or DB. The model lives here.
- `src/lib/oddsApi/` — odds client, market mapping, fixture matching, quota accounting.
- `src/lib/cache/` — the three cache layers (standings, fitted ratings, odds).
- `src/lib/betting/` — Kelly, bet settlement, measured per-market reliability.
- `src/lib/predictions/` — prediction tracking and evaluation.
- `scripts/` — offline backtests. Excluded from `npm test` (see below).

### Two estimation paths

1. **Primary** — `dixonColesFit.ts` fits every team's attack and defense, plus home advantage and
   rho, by maximum likelihood over the cached matches, using Adam on the analytic gradient. It
   measures strength *relative to the opposition actually faced*.
2. **Fallback** — `teamStats.ts` + `matchup.ts`, ratio of averages (Maher 1982). Used only when
   the `Match` cache has no data for that competition yet.

Both feed `buildPredictionFromLambdas()`, so they can differ only in how they arrive at λ, never
in how the markets are derived from it.

## Decisions not to revert

Each is justified in the code; this is the index.

| Decision | Why |
|---|---|
| **Tracked predictions are immutable** (`api/predictions/route.ts`) | An "update submission" button used to overwrite the record and reset its timestamp. It let a forecast be replaced by a better-informed one after more matches had been played, so the statistics measured predictions made with hindsight. |
| **Tracking gates on data quality, not model confidence** (`predictions/gate.ts`) | A 58% floor passed only 16% of fixtures, all from one narrow band. Calibration can only be measured across the full range, so filtering before storing blinded the chart exactly where the model is most likely wrong. |
| **The bet slip ranks by probability points, not EV%** (`BetSlipCard.tsx`) | EV% divides by the stake and inflates long odds: 4 points of edge reads as +17% at 3.90 and +9% at 2.20. Ranking by EV% steers every recommendation toward longshots, where a small model error does the most damage. |
| **Rho bounds: ceiling from the product, floor from the larger rate** (`dixonColes.ts:rhoBounds`) | They were inverted and allowed a rho that made the probability of a 0-0 negative. Easy to get backwards; tests pin it. |
| **The tau form preserves mass exactly** (`dixonColes.ts`) | The rho terms cancel algebraically. A variant circulating elsewhere does not have this property — do not "correct" toward it. A test pins the property. |
| **`united` and `city` are NOT noise words** (`oddsApi/matchTeams.ts`) | They are the only thing separating Manchester United from Manchester City. With them on the list both scored 1.000 and swapped odds. |
| **The odds-api quota counter lives in the database** (`oddsApi/quota.ts`) | In memory it reset on every server reload and would have authorised the 501st request while reporting "0 used today". The football-data counter can stay in memory: its window is 60 seconds. |

## External APIs and quota discipline

**football-data.org** — 10 req/min. 6h cache in `standingsCache`, in-memory counter
(`footballData/rateLimiter.ts`), on-screen badge.

**odds-api.io** — 100/hour and 500/day. The discipline lives in `oddsCache.ts`:
- `/odds/multi` prices **10 fixtures per request**: a whole matchday costs one call.
- 30-minute cache, plus a 5-minute floor between refreshes of the same competition.
- Measured: pricing a full Brasileirão round = **4 requests**.
- Both windows are checked before sending; a full one is refused rather than sent.

odds-api.io quirks found the hard way:
- **Requesting several bookmakers where one is unavailable voids the entire response.** It does
  not return the ones it has. Hence only the account's selected bookmakers are requested.
- The free plan allows selecting 2 bookmakers, but **in practice only Bet365 returns data**
  (Betano BR, Betnacional, Betsson, 1xBet, Betway, 888Sport and Bet7k were all tested: none respond).
- It publishes reduced side-feeds next to the main one ("Bet365 (no latency)", 3-4 markets).
  Filtered out by `MIN_USEFUL_MARKETS`.
- `sport` is mandatory on `/events` even when filtering by `league`.

## Running things

```bash
npm run dev        # dev server
npm test           # 112 tests — does NOT include scripts/
npx tsc --noEmit   # typecheck
npx eslint .       # lint

# Offline backtests (need downloaded data, see below)
npx vitest run --config vitest.backtest.config.ts scripts/leagues.test.ts   # does it generalise?
npx vitest run --config vitest.backtest.config.ts scripts/compare.test.ts   # fitted vs original
npx vitest run --config vitest.backtest.config.ts scripts/markets.test.ts   # per-market reliability
npx vitest run --config vitest.backtest.config.ts scripts/threshold.test.ts # thresholds
```

Backtests read season dumps from `data/{LEAGUE}/{YEAR}.json`, which are **not in the repo**
(~1 MB each; `/data/` is gitignored). The download command is documented at the top of
`scripts/backtestLib.ts`. The free plan serves past seasons via `?season=YYYY`, but only from
2023 onward and at 10 requests per minute.

## Known traps

- **Adding a Prisma model requires restarting the dev server.** Node keeps the previously
  generated client in memory and the new model arrives as `undefined`. Guards in `oddsCache.ts`
  and `quota.ts` say so explicitly.
- **Vitest does not load `.env`.** Next.js does. A script in `scripts/` that needs keys must do
  `Object.assign(process.env, dotenv.parse(fs.readFileSync(".env")))` before importing anything
  that reads them.
- **`dotenv.config()` prints a banner to stdout.** Capturing its output into a shell variable
  captures the banner along with the value. Use `dotenv.parse`.
- Team names differ between the two providers. `matchTeams.ts` reconciles them and **returns null
  rather than guessing** — an empty cell beats another fixture's odds.

## Product state

Working: prediction with the fitted model, comparison against real Bet365 prices with autofill,
value and Kelly computation, bet logging with a bankroll, and prediction tracking with calibration.

The most useful thing missing: **closing-line value (CLV) logging**. It is the only way to detect
a real edge in ~50 bets instead of thousands. If the owner asks, that is the natural next step.
