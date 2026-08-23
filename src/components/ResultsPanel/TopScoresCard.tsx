import type { ExactScoreOutcome } from "@/types/domain";
import { Card } from "@/components/ui/Card";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";

export function TopScoresCard({ scores }: { scores: ExactScoreOutcome[] }) {
  const top5 = [...scores].sort((a, b) => b.probability - a.probability).slice(0, 5);

  return (
    <Card title="Top 5 marcadores más probables">
      <div className="flex flex-col gap-3">
        {top5.map((s, i) => (
          <ProbabilityBar
            key={`${s.home}-${s.away}`}
            label={`${s.home}-${s.away}`}
            probability={s.probability}
            odds={s.odds}
            tone={i === 0 ? "pitch" : "neutral"}
          />
        ))}
      </div>
    </Card>
  );
}
