import type { BetMarket } from "@/lib/betting/settle";

/**
 * Translates odds-api.io's market shapes into the app's BetMarket vocabulary.
 *
 * Their payload nests differently per market: "ML" carries home/draw/away on one
 * object, "Totals" is an array of goal lines each with its own over/under, and
 * "Double Chance" keys by the 1X/12/X2 labels. Everything the app can price is
 * covered; the dozens of other markets they return (corners, cards, player props)
 * are ignored because there is no model probability to compare them against.
 */

export interface OddsApiMarket {
  name: string;
  updatedAt?: string;
  odds: Array<Record<string, string | number>>;
}

function num(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 1 ? n : null;
}

/** Picks the goal line matching `line` out of a Totals-style market. */
function totalsLine(market: OddsApiMarket | undefined, line: number) {
  return market?.odds.find((o) => Number(o.hdp) === line);
}

export function mapMarkets(markets: OddsApiMarket[]): Partial<Record<BetMarket, number>> {
  const byName = new Map(markets.map((m) => [m.name, m]));
  const out: Partial<Record<BetMarket, number>> = {};

  const ml = byName.get("ML")?.odds[0];
  if (ml) {
    const home = num(ml.home);
    const draw = num(ml.draw);
    const away = num(ml.away);
    if (home) out.home = home;
    if (draw) out.draw = draw;
    if (away) out.away = away;
  }

  const dc = byName.get("Double Chance")?.odds[0];
  if (dc) {
    const oneX = num(dc["1X"]);
    const oneTwo = num(dc["12"]);
    const xTwo = num(dc["X2"]);
    if (oneX) out.double_1x = oneX;
    if (oneTwo) out.double_12 = oneTwo;
    if (xTwo) out.double_x2 = xTwo;
  }

  const btts = byName.get("Both Teams To Score")?.odds[0];
  if (btts) {
    const yes = num(btts.yes);
    const no = num(btts.no);
    if (yes) out.btts_yes = yes;
    if (no) out.btts_no = no;
  }

  // "Totals" is the main goals market; "Goals Over/Under" is the same data under a
  // second name at some bookmakers, so it serves as a fallback.
  const totals = byName.get("Totals") ?? byName.get("Goals Over/Under");
  for (const [line, overKey, underKey] of [
    [1.5, "over_1_5", "under_1_5"],
    [2.5, "over_2_5", "under_2_5"],
  ] as const) {
    const row = totalsLine(totals, line);
    if (!row) continue;
    const over = num(row.over);
    const under = num(row.under);
    if (over) out[overKey] = over;
    if (under) out[underKey] = under;
  }

  // "Team scores" is the over side of that team's 0.5 goal line. Bookmakers also
  // publish it inverted as a clean sheet for the opponent, which is used as the
  // fallback: a clean sheet for the away side is exactly the home side not scoring.
  const homeGoals = totalsLine(byName.get("Team Total Goals Home"), 0.5);
  const awayGoals = totalsLine(byName.get("Team Total Goals Away"), 0.5);
  const homeScores = num(homeGoals?.over) ?? num(byName.get("Clean Sheet Away")?.odds[0]?.no);
  const awayScores = num(awayGoals?.over) ?? num(byName.get("Clean Sheet Home")?.odds[0]?.no);
  if (homeScores) out.home_scores = homeScores;
  if (awayScores) out.away_scores = awayScores;

  return out;
}

/**
 * The bookmaker's own implied probabilities including its margin. A complete,
 * fairly priced market sums to just over 1; anything far above means either a wide
 * margin or — far more often — a mistyped price.
 */
export function marketMargin(odds: number[]): number | null {
  if (odds.length === 0 || odds.some((o) => o <= 1)) return null;
  return odds.reduce((s, o) => s + 1 / o, 0) - 1;
}
