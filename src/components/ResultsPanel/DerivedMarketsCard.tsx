import type { DerivedMarkets } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";

export function DerivedMarketsCard({ markets, homeTeam, awayTeam }: { markets: DerivedMarkets; homeTeam: string; awayTeam: string }) {
  return (
    <Card title="Mercados derivados">
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
        <ProbabilityBar label={`${homeTeam} marca +0.5`} probability={markets.homeOver05.probability} odds={markets.homeOver05.odds} tone="pitch" />
        <ProbabilityBar label={`${awayTeam} marca +0.5`} probability={markets.awayOver05.probability} odds={markets.awayOver05.odds} tone="sky" />
        <ProbabilityBar
          label={`Portería a cero (${homeTeam})`}
          probability={markets.cleanSheetHome.probability}
          odds={markets.cleanSheetHome.odds}
          tone="pitch"
        />
        <ProbabilityBar
          label={`Portería a cero (${awayTeam})`}
          probability={markets.cleanSheetAway.probability}
          odds={markets.cleanSheetAway.odds}
          tone="sky"
        />
        <ProbabilityBar
          label={`Gana sin recibir (${homeTeam})`}
          probability={markets.winToNilHome.probability}
          odds={markets.winToNilHome.odds}
          tone="pitch"
        />
        <ProbabilityBar
          label={`Gana sin recibir (${awayTeam})`}
          probability={markets.winToNilAway.probability}
          odds={markets.winToNilAway.odds}
          tone="sky"
        />
      </div>
      <div className="mt-5 border-t border-line pt-4">
        <p className="label-eyebrow mb-3 text-xs text-ink-soft">Total de goles del partido</p>
        <div className="flex flex-col gap-3">
          {markets.goalRanges.map((r) => (
            <ProbabilityBar key={r.label} label={r.label} probability={r.outcome.probability} odds={r.outcome.odds} tone="gold" />
          ))}
        </div>
      </div>
    </Card>
  );
}
