import { describe, it, expect } from "vitest";
import { bestEdge, positiveEdges, marketProbabilities } from "@/lib/betting/marketProbabilities";
import { buildDerivedMarkets, buildPredictionFromLambdas } from "@/lib/poisson";
import { BET_MARKETS, type BetMarket } from "@/lib/betting/settle";

const { prediction, matrix } = buildPredictionFromLambdas("Local", "Visitante", 1.6, 1.1);
const probs = marketProbabilities(prediction, buildDerivedMarkets(matrix));

describe("marketProbabilities", () => {
  it("covers every market the app can bet on", () => {
    for (const m of BET_MARKETS) {
      expect(probs[m.value], m.value).toBeGreaterThan(0);
      expect(probs[m.value], m.value).toBeLessThan(1);
    }
  });

  it("keeps complementary markets summing to 1", () => {
    for (const [a, b] of [
      ["btts_yes", "btts_no"],
      ["over_1_5", "under_1_5"],
      ["over_2_5", "under_2_5"],
    ] as [BetMarket, BetMarket][]) {
      expect(probs[a] + probs[b], `${a}+${b}`).toBeCloseTo(1, 6);
    }
  });

  it("keeps 1X2 and double chance consistent with each other", () => {
    expect(probs.home + probs.draw + probs.away).toBeCloseTo(1, 6);
    expect(probs.double_1x).toBeCloseTo(probs.home + probs.draw, 6);
    expect(probs.double_12).toBeCloseTo(probs.home + probs.away, 6);
    expect(probs.double_x2).toBeCloseTo(probs.draw + probs.away, 6);
  });

  it("keeps both-teams-to-score below either side scoring alone", () => {
    expect(probs.btts_yes).toBeLessThan(probs.home_scores);
    expect(probs.btts_yes).toBeLessThan(probs.away_scores);
  });
});

describe("bestEdge", () => {
  it("returns null when no price beats its own fair odds", () => {
    const fair = (m: BetMarket) => 1 / probs[m] - 0.01; // every price slightly short
    expect(bestEdge(probs, { home: fair("home"), draw: fair("draw"), away: fair("away") }, 0)).toBeNull();
  });

  it("ignores markets with no price and unusable odds", () => {
    expect(bestEdge(probs, {}, 0)).toBeNull();
    expect(bestEdge(probs, { home: 1, draw: 0.5 }, 0)).toBeNull();
  });

  /**
   * The reason the floor exists: positive EV always favours long odds, so without it
   * the top recommendation can be an outcome the model expects to lose most of the
   * time. Reproduces the case that prompted it — a home side rated ~31% priced at
   * 4.00 outranks a genuine favourite until a floor rules it out.
   */
  it("respects the minimum probability floor", () => {
    const longshot = 1 / (probs.away - 0.06); // biggest edge, but the least likely outcome
    const solid = 1 / (probs.home - 0.02);
    const odds = { away: longshot, home: solid };

    expect(bestEdge(probs, odds, 0)?.market).toBe("away");
    expect(bestEdge(probs, odds, probs.away + 0.01)?.market).toBe("home");
    expect(bestEdge(probs, odds, 0.99)).toBeNull();
  });

  it("reports every positive edge, strongest first, for client-side filtering", () => {
    const odds = {
      home: 1 / (probs.home - 0.02),
      away: 1 / (probs.away - 0.06),
      draw: (1 / probs.draw) * 0.9, // no edge: shorter than fair, so the book wins it
    };
    const all = positiveEdges(probs, odds);

    expect(all.map((e) => e.market)).toEqual(["away", "home"]);
    expect(all[0].points).toBeGreaterThan(all[1].points);
    expect(all.every((e) => e.probability > 0)).toBe(true);
  });

  /**
   * The behaviour the ranking depends on: a long price with a smaller true edge must
   * lose to a short price with a bigger one, even though the long price shows a far
   * larger EV percentage. Ranking by EV% would invert this pair.
   */
  it("ranks by probability points, not by EV percentage", () => {
    // The inversion needs edges that are CLOSE in points but far apart in odds:
    // EV works out to edge / (probability - edge), so the same edge pays a much
    // larger percentage on the less likely outcome. +3 points on the draw against
    // +4 on the home side does it.
    const drawOdds = 1 / (probs.draw - 0.03);
    const homeOdds = 1 / (probs.home - 0.04);

    // Ranked by points, the home side wins — it has the bigger real edge.
    expect(bestEdge(probs, { draw: drawOdds, home: homeOdds }, 0)?.market).toBe("home");

    // And the trap is real: the row that loses the ranking has the higher EV%,
    // so ranking by EV% would have picked the weaker edge.
    const drawEv = probs.draw * drawOdds - 1;
    const homeEv = probs.home * homeOdds - 1;
    expect(drawEv).toBeGreaterThan(homeEv);
  });

  it("reports the points and EV of the market it picked", () => {
    const odds = 1 / (probs.over_2_5 - 0.05);
    const edge = bestEdge(probs, { over_2_5: odds }, 0);
    expect(edge?.market).toBe("over_2_5");
    expect(edge?.points).toBeCloseTo(0.05, 6);
    expect(edge?.ev).toBeCloseTo(probs.over_2_5 * odds - 1, 10);
  });
});
