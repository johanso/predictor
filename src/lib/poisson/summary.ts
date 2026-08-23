import type { ExactScoreOutcome, MarketOutcome, PredictionSummary } from "@/types/domain";
import { formatPercent } from "@/lib/format";

export function buildSummary(
  homeTeam: string,
  awayTeam: string,
  oneXTwo: { homeWin: MarketOutcome; draw: MarketOutcome; awayWin: MarketOutcome },
  exactScores: ExactScoreOutcome[]
): PredictionSummary {
  const candidates: { favorite: PredictionSummary["favorite"]; label: string; probability: number }[] = [
    { favorite: "home", label: homeTeam, probability: oneXTwo.homeWin.probability },
    { favorite: "draw", label: "Empate", probability: oneXTwo.draw.probability },
    { favorite: "away", label: awayTeam, probability: oneXTwo.awayWin.probability },
  ];
  const top = candidates.reduce((best, c) => (c.probability > best.probability ? c : best));

  const bestScore = exactScores.reduce((best, s) => (s.probability > best.probability ? s : best));
  const likelyScore = { home: bestScore.home, away: bestScore.away, probability: bestScore.probability };

  const text =
    top.favorite === "draw"
      ? `Partido muy parejo: el empate es el resultado más probable, con ${formatPercent(top.probability)}. El marcador más probable es ${likelyScore.home}-${likelyScore.away}.`
      : `${top.label} es favorito con una probabilidad estimada del ${formatPercent(top.probability)}. El marcador más probable es ${likelyScore.home}-${likelyScore.away}.`;

  return {
    favorite: top.favorite,
    favoriteLabel: top.label,
    favoriteProbability: top.probability,
    likelyScore,
    text,
  };
}
