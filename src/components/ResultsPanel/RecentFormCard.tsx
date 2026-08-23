import type { RecentFormEntry, TeamRecentForm } from "@/types/domain";
import { Card } from "@/components/ui/Card";

const RESULT_CLASS: Record<RecentFormEntry["result"], string> = {
  V: "bg-result-win text-paper",
  E: "bg-result-draw text-paper",
  D: "bg-result-loss text-paper",
};

function FormRow({ entries }: { entries: RecentFormEntry[] }) {
  if (entries.length === 0) return <p className="text-xs text-ink-soft">Sin partidos recientes cacheados.</p>;

  const goalsFor = entries.reduce((s, e) => s + e.goalsFor, 0);
  const goalsAgainst = entries.reduce((s, e) => s + e.goalsAgainst, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        {entries.map((e, i) => (
          <span
            key={i}
            title={`vs ${e.opponent}: ${e.goalsFor}-${e.goalsAgainst}`}
            className={`flex h-7 w-7 items-center justify-center text-xs font-semibold ${RESULT_CLASS[e.result]}`}
          >
            {e.result}
          </span>
        ))}
      </div>
      <p className="font-numeric text-xs text-ink-soft">
        {goalsFor} a favor · {goalsAgainst} en contra · {(goalsFor / entries.length).toFixed(2)} goles/partido en promedio
      </p>
    </div>
  );
}

export function RecentFormCard({ form, tone }: { form: TeamRecentForm; tone: "pitch" | "sky" }) {
  const venueTitle = form.venueLabel === "home" ? "En casa" : "Como visitante";
  return (
    <Card title={`Forma reciente: ${form.teamName}`}>
      <div className="flex flex-col gap-4">
        <div>
          <p className={`label-eyebrow mb-2 text-xs ${tone === "pitch" ? "text-pitch" : "text-sky"}`}>Últimos 5 (general)</p>
          <FormRow entries={form.overall} />
        </div>
        <div>
          <p className={`label-eyebrow mb-2 text-xs ${tone === "pitch" ? "text-pitch" : "text-sky"}`}>Últimos 5 ({venueTitle.toLowerCase()})</p>
          <FormRow entries={form.venue} />
        </div>
      </div>
    </Card>
  );
}
