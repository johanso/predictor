import { describe, it, expect } from "vitest";

describe("didMarketWin — marca cada equipo", () => {
  it("settles home_scores on the home side's goals alone", () => {
    expect(didMarketWin("home_scores", 1, 0)).toBe(true);
    expect(didMarketWin("home_scores", 3, 5)).toBe(true); // losing but scoring still wins
    expect(didMarketWin("home_scores", 0, 0)).toBe(false);
    expect(didMarketWin("home_scores", 0, 2)).toBe(false);
  });

  it("settles away_scores on the away side's goals alone", () => {
    expect(didMarketWin("away_scores", 0, 1)).toBe(true);
    expect(didMarketWin("away_scores", 4, 2)).toBe(true);
    expect(didMarketWin("away_scores", 0, 0)).toBe(false);
    expect(didMarketWin("away_scores", 2, 0)).toBe(false);
  });

  it("agrees with the clean-sheet reading of the same scoreline", () => {
    // "Home scores" is the exact complement of the away side keeping a clean sheet.
    for (const [h, a] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [2, 2],
      [3, 1],
    ]) {
      expect(didMarketWin("home_scores", h, a)).toBe(h > 0);
      expect(didMarketWin("away_scores", h, a)).toBe(a > 0);
    }
  });

  it("is consistent with btts: both scoring means both single markets won", () => {
    for (const [h, a] of [
      [1, 1],
      [2, 3],
      [0, 1],
      [1, 0],
      [0, 0],
    ]) {
      const both = didMarketWin("btts_yes", h, a);
      expect(both).toBe(didMarketWin("home_scores", h, a) && didMarketWin("away_scores", h, a));
    }
  });
});
import { didMarketWin, settleBet } from "@/lib/betting/settle";

describe("didMarketWin", () => {
  it("home", () => {
    expect(didMarketWin("home", 2, 0)).toBe(true);
    expect(didMarketWin("home", 1, 1)).toBe(false);
    expect(didMarketWin("home", 0, 1)).toBe(false);
  });

  it("draw", () => {
    expect(didMarketWin("draw", 1, 1)).toBe(true);
    expect(didMarketWin("draw", 2, 0)).toBe(false);
  });

  it("away", () => {
    expect(didMarketWin("away", 0, 2)).toBe(true);
    expect(didMarketWin("away", 1, 1)).toBe(false);
  });

  it("btts_yes / btts_no", () => {
    expect(didMarketWin("btts_yes", 1, 1)).toBe(true);
    expect(didMarketWin("btts_yes", 1, 0)).toBe(false);
    expect(didMarketWin("btts_no", 1, 0)).toBe(true);
    expect(didMarketWin("btts_no", 1, 1)).toBe(false);
  });

  it("over_2_5 / under_2_5", () => {
    expect(didMarketWin("over_2_5", 2, 1)).toBe(true); // 3 goals
    expect(didMarketWin("over_2_5", 1, 1)).toBe(false); // 2 goals
    expect(didMarketWin("under_2_5", 1, 1)).toBe(true);
    expect(didMarketWin("under_2_5", 2, 1)).toBe(false);
  });

  it("over_1_5 / under_1_5", () => {
    expect(didMarketWin("over_1_5", 1, 1)).toBe(true); // 2 goals
    expect(didMarketWin("over_1_5", 1, 0)).toBe(false); // 1 goal
    expect(didMarketWin("under_1_5", 1, 0)).toBe(true);
    expect(didMarketWin("under_1_5", 0, 0)).toBe(true);
    expect(didMarketWin("under_1_5", 1, 1)).toBe(false);
  });

  it("double_1x / double_12 / double_x2", () => {
    expect(didMarketWin("double_1x", 2, 0)).toBe(true); // home win
    expect(didMarketWin("double_1x", 1, 1)).toBe(true); // draw
    expect(didMarketWin("double_1x", 0, 1)).toBe(false); // away win

    expect(didMarketWin("double_12", 2, 0)).toBe(true); // home win
    expect(didMarketWin("double_12", 0, 2)).toBe(true); // away win
    expect(didMarketWin("double_12", 1, 1)).toBe(false); // draw

    expect(didMarketWin("double_x2", 1, 1)).toBe(true); // draw
    expect(didMarketWin("double_x2", 0, 2)).toBe(true); // away win
    expect(didMarketWin("double_x2", 2, 0)).toBe(false); // home win
  });
});

describe("settleBet", () => {
  it("computes positive profit = stake*(odds-1) on a win", () => {
    const result = settleBet("home", 2.5, 100, 2, 0);
    expect(result.won).toBe(true);
    expect(result.profit).toBeCloseTo(150, 10);
  });

  it("computes profit = -stake on a loss", () => {
    const result = settleBet("home", 2.5, 100, 0, 1);
    expect(result.won).toBe(false);
    expect(result.profit).toBeCloseTo(-100, 10);
  });
});
