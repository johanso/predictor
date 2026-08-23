"use client";

import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { formatPercent } from "@/lib/format";

export interface FixtureOption {
  id: number;
  utcDate: string;
  matchday: number | null;
  homeTeamId: number;
  homeTeamName: string;
  homeTeamCrest: string | null;
  awayTeamId: number;
  awayTeamName: string;
  awayTeamCrest: string | null;
}

export interface FixtureFavorite {
  favorite: "home" | "draw" | "away";
  favoriteLabel: string;
  favoriteProbability: number;
  /** Best positive edge against the real price, precomputed server-side. */
  bestValue?: {
    market: string;
    label: string;
    odds: number;
    points: number;
    ev: number;
    bookmaker: string;
  } | null;
}

const FAVORITE_TONE = { home: "text-pitch", away: "text-sky", draw: "text-gold" } as const;

type VenueFilter = "all" | "home" | "away";
type SortMode = "date" | "probability" | "value";

interface FixtureGroup {
  dateKey: string;
  label: string;
  fixtures: FixtureOption[];
}

function TeamCrest({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return <span className="h-5 w-5 shrink-0" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable domain; not worth Next/Image config for a 20px crest
    <img
      src={src}
      alt={alt}
      className="h-5 w-5 shrink-0 object-contain"
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}

function FixtureRow({
  f,
  pred,
  onSelect,
  dateLabel,
}: {
  f: FixtureOption;
  pred: FixtureFavorite | undefined;
  onSelect: (fixture: FixtureOption) => void;
  /** Shown when the row isn't already grouped under a date header (probability sort mode). */
  dateLabel?: string;
}) {
  return (
    <button
      onClick={() => onSelect(f)}
      className="group flex w-full items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-left transition-colors last:border-0 hover:cursor-pointer hover:bg-paper"
    >
      <span className="font-numeric w-28 shrink-0 text-xs text-ink-soft">
        {dateLabel && <span className="mr-1">{dateLabel}</span>}
        {new Date(f.utcDate).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })}
        {f.matchday != null && <span> · J{f.matchday}</span>}
      </span>
      <span className="flex flex-1 items-center gap-2 text-sm">
        <TeamCrest src={f.homeTeamCrest} alt="" />
        <span className="text-pitch">{f.homeTeamName}</span>
        <span className="label-eyebrow text-[0.65rem] text-ink-soft">vs</span>
        <TeamCrest src={f.awayTeamCrest} alt="" />
        <span className="text-sky">{f.awayTeamName}</span>
      </span>
      {pred && (
        <span
          className={`font-numeric label-eyebrow shrink-0 text-[0.65rem] ${FAVORITE_TONE[pred.favorite]}`}
          title={`Favorito: ${pred.favoriteLabel}`}
        >
          {pred.favorite === "draw" ? "Empate" : pred.favoriteLabel} {formatPercent(pred.favoriteProbability)}
        </span>
      )}
      <span className="font-numeric w-36 shrink-0 text-right text-[0.65rem]">
        {pred?.bestValue ? (
          <span
            className="text-result-win"
            title={`${pred.bestValue.label} a ${pred.bestValue.odds.toFixed(2)} en ${pred.bestValue.bookmaker}. El modelo la da ${(pred.bestValue.points * 100).toFixed(1)} puntos por encima de lo que implica la cuota.`}
          >
            {pred.bestValue.label} <span className="opacity-70">+{(pred.bestValue.points * 100).toFixed(1)} pp</span>
          </span>
        ) : (
          <span className="text-ink-soft opacity-40">—</span>
        )}
      </span>
      <span className="shrink-0 text-lg text-ink-soft opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100">
        →
      </span>
    </button>
  );
}

export function FixturesList({
  fixtures,
  predictions,
  onSelect,
}: {
  fixtures: FixtureOption[];
  predictions?: Record<number, FixtureFavorite>;
  onSelect: (fixture: FixtureOption) => void;
}) {
  const [teamFilter, setTeamFilter] = useState("");
  const [venueFilter, setVenueFilter] = useState<VenueFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());

  const filtered = useMemo(() => {
    const needle = teamFilter.trim().toLowerCase();
    return fixtures.filter((f) => {
      if (!needle) return true;
      const homeMatch = f.homeTeamName.toLowerCase().includes(needle);
      const awayMatch = f.awayTeamName.toLowerCase().includes(needle);
      if (venueFilter === "home") return homeMatch;
      if (venueFilter === "away") return awayMatch;
      return homeMatch || awayMatch;
    });
  }, [fixtures, teamFilter, venueFilter]);

  // Grouped by calendar day (fixtures already arrive sorted ascending by utcDate) —
  // turns one long flat list into scannable per-date sections, with a pill strip
  // above to jump straight to a date instead of scrolling past everything before it.
  const groups = useMemo<FixtureGroup[]>(() => {
    const byDate = new Map<string, FixtureOption[]>();
    for (const f of filtered) {
      // Group by local calendar day (matches what the label shows) — grouping by
      // the raw UTC date string instead caused near-midnight kickoffs to land in
      // a different bucket than their displayed label, producing duplicate pills.
      const dateKey = new Date(f.utcDate).toDateString();
      const list = byDate.get(dateKey) ?? [];
      list.push(f);
      byDate.set(dateKey, list);
    }
    return [...byDate.entries()].map(([dateKey, fxs]) => ({
      dateKey,
      label: new Date(fxs[0].utcDate).toLocaleDateString("es", { weekday: "short", day: "2-digit", month: "short" }),
      fixtures: fxs,
    }));
  }, [filtered]);

  // Only meaningful once predictions exist — fixtures without one (not enough
  // cached matches for a team yet) sink to the bottom instead of disappearing.
  const sortedByProbability = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const pa = predictions?.[a.id]?.favoriteProbability ?? -1;
      const pb = predictions?.[b.id]?.favoriteProbability ?? -1;
      return pb - pa;
    });
  }, [filtered, predictions]);

  // Ranked by percentage points of edge, matching the bet slip. Fixtures with no
  // priced edge sink to the bottom rather than disappearing.
  const sortedByValue = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const va = predictions?.[a.id]?.bestValue?.points ?? -1;
      const vb = predictions?.[b.id]?.bestValue?.points ?? -1;
      return vb - va;
    });
  }, [filtered, predictions]);

  const valueCount = useMemo(
    () => filtered.filter((f) => predictions?.[f.id]?.bestValue).length,
    [filtered, predictions]
  );

  function jumpToDate(dateKey: string) {
    sectionRefs.current.get(dateKey)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <Card title="Próximos partidos">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Filtrar por equipo…"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="flex-1 border border-line bg-paper-raised px-3 py-1.5 text-sm text-ink outline-none focus:border-pitch"
        />
        <select
          value={venueFilter}
          onChange={(e) => setVenueFilter(e.target.value as VenueFilter)}
          disabled={!teamFilter.trim()}
          className="border border-line bg-paper-raised px-2 py-1.5 text-xs text-ink-soft outline-none disabled:opacity-40"
        >
          <option value="all">Local o visitante</option>
          <option value="home">Solo local</option>
          <option value="away">Solo visitante</option>
        </select>
        <div className="flex border border-line">
          <button
            onClick={() => setSortMode("date")}
            className={`label-eyebrow px-2 py-1.5 text-xs transition-colors ${sortMode === "date" ? "bg-ink text-paper" : "text-ink-soft hover:text-pitch"}`}
          >
            Por fecha
          </button>
          <button
            onClick={() => setSortMode("probability")}
            className={`label-eyebrow border-l border-line px-2 py-1.5 text-xs transition-colors ${sortMode === "probability" ? "bg-ink text-paper" : "text-ink-soft hover:text-pitch"}`}
          >
            Por probabilidad
          </button>
          <button
            onClick={() => setSortMode("value")}
            disabled={valueCount === 0}
            title={valueCount === 0 ? "Sin cuotas cargadas para esta jornada" : `${valueCount} partidos con valor positivo`}
            className={`label-eyebrow border-l border-line px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sortMode === "value" ? "bg-ink text-paper" : "text-ink-soft hover:text-pitch"}`}
          >
            Por valor{valueCount > 0 && ` (${valueCount})`}
          </button>
        </div>
      </div>

      {sortMode === "date" && groups.length > 1 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button
              key={g.dateKey}
              onClick={() => jumpToDate(g.dateKey)}
              className="label-eyebrow shrink-0 border border-line px-2 py-1 text-[0.65rem] text-ink-soft transition-colors hover:border-pitch hover:text-pitch"
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex max-h-72 flex-col overflow-y-auto">
        {filtered.length === 0 && <p className="py-4 text-center text-xs text-ink-soft">Sin partidos que coincidan con el filtro.</p>}

        {sortMode !== "date"
          ? (sortMode === "value" ? sortedByValue : sortedByProbability).map((f) => (
              <FixtureRow
                key={f.id}
                f={f}
                pred={predictions?.[f.id]}
                onSelect={onSelect}
                dateLabel={new Date(f.utcDate).toLocaleDateString("es", { day: "2-digit", month: "short" })}
              />
            ))
          : groups.map((g) => (
              <div key={g.dateKey} ref={(el) => void (el ? sectionRefs.current.set(g.dateKey, el) : sectionRefs.current.delete(g.dateKey))}>
                <p className="label-eyebrow px-4 bg-slate-100 sticky top-0 border-b border-t border-line py-2 text-[0.65rem] text-ink-soft">{g.label}</p>
                {g.fixtures.map((f) => (
                  <FixtureRow key={f.id} f={f} pred={predictions?.[f.id]} onSelect={onSelect} />
                ))}
              </div>
            ))}
      </div>
    </Card>
  );
}
