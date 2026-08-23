import type { TeamComparativeStats } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { SplitCompareBar } from "@/components/ui/SplitCompareBar";
import { formatPercent } from "@/lib/format";

export function ComparativeStatsCard({ home, away }: { home: TeamComparativeStats; away: TeamComparativeStats }) {
  return (
    <Card title="Comparativa de equipos">
      <div className="mb-5 grid grid-cols-2 gap-4 text-center">
        <div>
          <p className="text-sm font-semibold text-pitch">{home.teamName}</p>
          <p className="font-numeric text-xs text-ink-soft">
            {home.matchesAnalyzed} PJ · {home.wins}-{home.draws}-{home.losses}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-sky">{away.teamName}</p>
          <p className="font-numeric text-xs text-ink-soft">
            {away.matchesAnalyzed} PJ · {away.wins}-{away.draws}-{away.losses}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <SplitCompareBar label="Goles anotados (promedio)" homeValue={home.avgGoalsScored} awayValue={away.avgGoalsScored} />
        <SplitCompareBar label="Goles recibidos (promedio)" homeValue={home.avgGoalsConceded} awayValue={away.avgGoalsConceded} />
        <SplitCompareBar
          label="AEM"
          homeValue={home.bttsPct}
          awayValue={away.bttsPct}
          format={(n) => formatPercent(n)}
        />
        <SplitCompareBar
          label="Over 2.5"
          homeValue={home.over25Pct}
          awayValue={away.over25Pct}
          format={(n) => formatPercent(n)}
        />
      </div>
    </Card>
  );
}
