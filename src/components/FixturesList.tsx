import { Card } from "@/components/ui/Card";

export interface FixtureOption {
  id: number;
  utcDate: string;
  matchday: number | null;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
}

export function FixturesList({
  fixtures,
  onSelect,
}: {
  fixtures: FixtureOption[];
  onSelect: (fixture: FixtureOption) => void;
}) {
  return (
    <Card title="Próximos partidos" className="max-h-72 overflow-y-auto">
      <div className="flex flex-col">
        {fixtures.map((f) => (
          <button
            key={f.id}
            onClick={() => onSelect(f)}
            className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-left transition-colors last:border-0 hover:border-pitch"
          >
            <span className="w-24 shrink-0 text-xs text-ink-soft">
              {new Date(f.utcDate).toLocaleDateString("es", { day: "2-digit", month: "short" })}
              {f.matchday != null && <span className="font-numeric"> · J{f.matchday}</span>}
            </span>
            <span className="flex flex-1 items-center justify-center gap-2 text-sm">
              <span className="text-pitch">{f.homeTeamName}</span>
              <span className="label-eyebrow text-[0.65rem] text-ink-soft">vs</span>
              <span className="text-sky">{f.awayTeamName}</span>
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
