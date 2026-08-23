"use client";

import { useState } from "react";
import type { StandingsRow } from "@/lib/cache/standingsCache";
import type { VenueStandingsRow } from "@/lib/cache/formCache";
import { StandingsTable } from "@/components/StandingsTable";
import { PredictorClient } from "@/components/PredictorClient";
import type { FixtureOption, FixtureFavorite } from "@/components/FixturesList";

interface TeamOption {
  teamId: number;
  teamName: string;
}

export function LeaguePageClient({
  competitionCode,
  standingsRows,
  homeStandingsRows,
  awayStandingsRows,
  teams,
  fetchedAt,
  fixtures,
  fixturePredictions,
}: {
  competitionCode: string;
  standingsRows: StandingsRow[];
  homeStandingsRows: VenueStandingsRow[];
  awayStandingsRows: VenueStandingsRow[];
  teams: TeamOption[];
  fetchedAt: string | null;
  fixtures: FixtureOption[];
  fixturePredictions: Record<number, FixtureFavorite>;
}) {
  const [homeTeamId, setHomeTeamId] = useState<number | null>(null);
  const [awayTeamId, setAwayTeamId] = useState<number | null>(null);

  function handleTeamRowClick(teamId: number) {
    if (homeTeamId === null) {
      setHomeTeamId(teamId);
    } else if (awayTeamId === null && teamId !== homeTeamId) {
      setAwayTeamId(teamId);
    } else {
      setHomeTeamId(teamId);
      setAwayTeamId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <StandingsTable
        rows={standingsRows}
        homeRows={homeStandingsRows}
        awayRows={awayStandingsRows}
        onTeamClick={handleTeamRowClick}
        homeTeamId={homeTeamId}
        awayTeamId={awayTeamId}
      />
      <PredictorClient
        competitionCode={competitionCode}
        teams={teams}
        fetchedAt={fetchedAt}
        fixtures={fixtures}
        fixturePredictions={fixturePredictions}
        homeTeamId={homeTeamId}
        awayTeamId={awayTeamId}
        onHomeTeamChange={setHomeTeamId}
        onAwayTeamChange={setAwayTeamId}
      />
    </div>
  );
}
