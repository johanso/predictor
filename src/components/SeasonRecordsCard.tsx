"use client";

import type { SeasonRecords } from "@/lib/cache/formCache";
import { Card } from "@/components/ui/Card";
import { formatPercent } from "@/lib/format";

function TeamCrest({ src }: { src: string | null }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable domain; not worth Next/Image config for a 24px crest
    <img
      src={src}
      alt=""
      className="h-6 w-6 shrink-0 object-contain"
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
}

function RecordTile({
  label,
  teamName,
  crestUrl,
  valueLabel,
}: {
  label: string;
  teamName: string;
  crestUrl: string | null;
  valueLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 border border-line bg-paper-raised p-4">
      <p className="label-eyebrow text-[0.65rem] text-ink-soft">{label}</p>
      <div className="flex items-center gap-2">
        <TeamCrest src={crestUrl} />
        <span className="text-sm text-ink">{teamName}</span>
      </div>
      <span className="font-numeric text-xl font-semibold text-ink">{valueLabel}</span>
    </div>
  );
}

export function SeasonRecordsCard({ records }: { records: SeasonRecords }) {
  const hasAny = records.topScorer || records.bestDefense || records.mostBtts || records.longestUnbeatenStreak;
  if (!hasAny) return null;

  return (
    <Card title="Récords de la temporada">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {records.topScorer && (
          <RecordTile
            label="Más goles anotados"
            teamName={records.topScorer.teamName}
            crestUrl={records.topScorer.crestUrl}
            valueLabel={`${records.topScorer.value} goles`}
          />
        )}
        {records.bestDefense && (
          <RecordTile
            label="Mejor defensa"
            teamName={records.bestDefense.teamName}
            crestUrl={records.bestDefense.crestUrl}
            valueLabel={`${records.bestDefense.value} recibidos`}
          />
        )}
        {records.mostBtts && (
          <RecordTile
            label="Más ambos marcan"
            teamName={records.mostBtts.teamName}
            crestUrl={records.mostBtts.crestUrl}
            valueLabel={formatPercent(records.mostBtts.value)}
          />
        )}
        {records.longestUnbeatenStreak && (
          <RecordTile
            label="Racha invicta más larga"
            teamName={records.longestUnbeatenStreak.teamName}
            crestUrl={records.longestUnbeatenStreak.crestUrl}
            valueLabel={`${records.longestUnbeatenStreak.value} partidos`}
          />
        )}
      </div>
    </Card>
  );
}
