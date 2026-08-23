"use client";

import { useState } from "react";
import type { StandingsRow } from "@/lib/cache/standingsCache";
import type { VenueStandingsRow } from "@/lib/cache/formCache";
import { Card } from "@/components/ui/Card";

const FORM_LETTER_CLASS: Record<string, string> = {
  V: "bg-result-win",
  E: "bg-result-draw",
  D: "bg-result-loss",
};

function FormDots({ form }: { form: string }) {
  if (!form) return <span className="text-ink-soft">—</span>;
  return (
    <span className="flex justify-end gap-1">
      {form.split("").map((letter, i) => (
        <span key={i} title={letter} className={`h-2.5 w-2.5 rounded-full ${FORM_LETTER_CLASS[letter] ?? "bg-ink-soft"}`} />
      ))}
    </span>
  );
}

function TeamCrest({ src }: { src: string | null | undefined }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable domain; not worth Next/Image config for a 18px crest
    <img
      src={src}
      alt=""
      className="h-4.5 w-4.5 shrink-0 object-contain"
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}

interface RankingRow {
  teamId: number;
  teamName: string;
  crestUrl?: string | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string;
}

function RankingTable({
  rows,
  onTeamClick,
  homeTeamId,
  awayTeamId,
}: {
  rows: RankingRow[];
  onTeamClick?: (teamId: number) => void;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="label-eyebrow border-b border-line text-xs text-ink-soft">
          <th className="px-2 py-2 text-left font-normal">#</th>
          <th className="px-2 py-2 text-left font-normal">Equipo</th>
          <th className="font-numeric px-2 py-2 text-right font-normal">PJ</th>
          <th className="font-numeric px-2 py-2 text-right font-normal">V-E-D</th>
          <th className="font-numeric px-2 py-2 text-right font-normal">GF</th>
          <th className="font-numeric px-2 py-2 text-right font-normal">GC</th>
          <th className="font-numeric px-2 py-2 text-right font-normal">DG</th>
          <th className="font-numeric px-2 py-2 text-right font-normal">Prom. GF/GC</th>
          <th className="px-2 py-2 text-right font-normal">Forma</th>
          <th className="font-numeric px-2 py-2 text-right font-normal">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isHome = r.teamId === homeTeamId;
          const isAway = r.teamId === awayTeamId;
          const highlightClass = isHome ? "bg-pitch/10" : isAway ? "bg-sky/10" : "";
          return (
          <tr
            key={r.teamId}
            className={`border-b border-line last:border-0 ${highlightClass} ${onTeamClick ? "cursor-pointer transition-colors hover:bg-paper" : ""}`}
            onClick={() => onTeamClick?.(r.teamId)}
          >
            <td className="font-numeric px-2 py-2 text-ink-soft">{i + 1}</td>
            <td className="px-2 py-2">
              <span className="flex items-center gap-1.5">
                <TeamCrest src={r.crestUrl} />
                {r.teamName}
                {isHome && <span className="label-eyebrow text-[0.6rem] text-pitch">LOCAL</span>}
                {isAway && <span className="label-eyebrow text-[0.6rem] text-sky">VISITANTE</span>}
              </span>
            </td>
            <td className="font-numeric px-2 py-2 text-right">{r.played}</td>
            <td className="font-numeric px-2 py-2 text-right text-ink-soft">
              {r.won}-{r.draw}-{r.lost}
            </td>
            <td className="font-numeric px-2 py-2 text-right">{r.goalsFor}</td>
            <td className="font-numeric px-2 py-2 text-right">{r.goalsAgainst}</td>
            <td className="font-numeric px-2 py-2 text-right">
              {r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}
            </td>
            <td className="font-numeric px-2 py-2 text-right text-ink-soft">
              {r.played > 0 ? (r.goalsFor / r.played).toFixed(2) : "0.00"} / {r.played > 0 ? (r.goalsAgainst / r.played).toFixed(2) : "0.00"}
            </td>
            <td className="px-2 py-2">
              <FormDots form={r.form} />
            </td>
            <td className="font-numeric px-2 py-2 text-right font-semibold text-ink">{r.points}</td>
          </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type Tab = "general" | "local" | "visitante";

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "local", label: "Local" },
  { id: "visitante", label: "Visitante" },
];

export function StandingsTable({
  rows,
  homeRows,
  awayRows,
  onTeamClick,
  homeTeamId,
  awayTeamId,
}: {
  rows: StandingsRow[];
  homeRows: VenueStandingsRow[];
  awayRows: VenueStandingsRow[];
  onTeamClick?: (teamId: number) => void;
  homeTeamId?: number | null;
  awayTeamId?: number | null;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const activeRows: RankingRow[] = tab === "general" ? rows : tab === "local" ? homeRows : awayRows;

  return (
    <Card title="Tabla de posiciones" className="overflow-x-auto">
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`label-eyebrow border px-3 py-1.5 text-xs transition-colors ${
              tab === t.id ? "border-pitch bg-pitch-dim text-pitch" : "border-line text-ink-soft hover:border-pitch hover:text-pitch"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-xs text-ink-soft">
        {tab === "general" && "Clasificación general de la temporada."}
        {tab === "local" && "Ranking calculado solo con los partidos que cada equipo jugó como local."}
        {tab === "visitante" && "Ranking calculado solo con los partidos que cada equipo jugó como visitante."}
      </p>
      <RankingTable rows={activeRows} onTeamClick={onTeamClick} homeTeamId={homeTeamId} awayTeamId={awayTeamId} />
    </Card>
  );
}
