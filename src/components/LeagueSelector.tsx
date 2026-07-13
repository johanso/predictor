import Link from "next/link";
import { COMPETITIONS } from "@/lib/footballData/competitions";

export function LeagueSelector() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {COMPETITIONS.map((league) => (
        <Link
          key={league.code}
          href={`/leagues/${league.code}`}
          className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-emerald-500 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="font-medium">{league.name}</div>
          <div className="text-xs text-neutral-500">{league.code}</div>
          {!league.hasHomeAway && (
            <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">Sin marcador local/visitante</div>
          )}
        </Link>
      ))}
    </div>
  );
}
