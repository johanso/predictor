import { describe, it, expect } from "vitest";
import { buildSummary } from "@/lib/poisson/summary";
import type { ExactScoreOutcome, MarketOutcome } from "@/types/domain";

function outcome(label: string, probability: number): MarketOutcome {
  return { label, probability, odds: probability > 0 ? 1 / probability : null };
}

function score(home: number, away: number, probability: number): ExactScoreOutcome {
  return { home, away, probability, odds: probability > 0 ? 1 / probability : null };
}

describe("buildSummary", () => {
  it("picks a clear home favorite", () => {
    const oneXTwo = { homeWin: outcome("Gana Local", 0.741), draw: outcome("Empate", 0.19), awayWin: outcome("Gana Visitante", 0.069) };
    const exactScores = [score(2, 0, 0.21), score(1, 0, 0.18), score(0, 0, 0.05)];
    const summary = buildSummary("Santos FC", "Vasco", oneXTwo, exactScores);

    expect(summary.favorite).toBe("home");
    expect(summary.favoriteLabel).toBe("Santos FC");
    expect(summary.favoriteProbability).toBeCloseTo(0.741, 10);
    expect(summary.likelyScore).toEqual({ home: 2, away: 0, probability: 0.21 });
    expect(summary.text).toBe("Santos FC es favorito con una probabilidad estimada del 74.1%. El marcador más probable es 2-0.");
  });

  it("picks an away favorite", () => {
    const oneXTwo = { homeWin: outcome("Gana Local", 0.2), draw: outcome("Empate", 0.25), awayWin: outcome("Gana Visitante", 0.55) };
    const exactScores = [score(0, 1, 0.15), score(1, 1, 0.12)];
    const summary = buildSummary("Home FC", "Away FC", oneXTwo, exactScores);

    expect(summary.favorite).toBe("away");
    expect(summary.favoriteLabel).toBe("Away FC");
  });

  it("falls back to a draw-focused message when the draw is most likely", () => {
    const oneXTwo = { homeWin: outcome("Gana Local", 0.3), draw: outcome("Empate", 0.4), awayWin: outcome("Gana Visitante", 0.3) };
    const exactScores = [score(1, 1, 0.14), score(0, 0, 0.1)];
    const summary = buildSummary("Home FC", "Away FC", oneXTwo, exactScores);

    expect(summary.favorite).toBe("draw");
    expect(summary.favoriteLabel).toBe("Empate");
    expect(summary.text).toContain("Partido muy parejo");
    expect(summary.text).toContain("1-1");
  });
});
