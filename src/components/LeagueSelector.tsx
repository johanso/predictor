import Link from "next/link";
import { COMPETITIONS } from "@/lib/footballData/competitions";

export function LeagueSelector() {
  return (
    <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 md:grid-cols-3">
      {COMPETITIONS.map((league) => (
        <Link
          key={league.code}
          href={`/leagues/${league.code}`}
          className="group flex flex-col gap-3 bg-paper-raised p-4 transition-colors hover:bg-pitch-dim"
        >
          <div className="flex items-center justify-between">
            <span className="font-numeric text-xs text-ink-soft">{league.code}</span>
            <span
              aria-hidden
              className="h-px flex-1 mx-2 bg-[repeating-linear-gradient(90deg,var(--line)_0,var(--line)_4px,transparent_4px,transparent_8px)] group-hover:bg-[repeating-linear-gradient(90deg,var(--pitch)_0,var(--pitch)_4px,transparent_4px,transparent_8px)]"
            />
          </div>
          <span className="text-lg font-medium uppercase tracking-tight text-ink">{league.name}</span>
        </Link>
      ))}
    </div>
  );
}
