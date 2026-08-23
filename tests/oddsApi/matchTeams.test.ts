import { describe, it, expect } from "vitest";
import {
  findEventForFixture,
  nameSimilarity,
  normalizeTeamName,
  MIN_TEAM_SIMILARITY,
  type OddsEvent,
} from "@/lib/oddsApi/matchTeams";

// Real spellings: football-data.org on the left, odds-api.io on the right.
const REAL_PAIRS: [string, string][] = [
  ["SE Palmeiras", "SE Palmeiras SP"],
  ["CR Vasco da Gama", "CR Vasco da Gama RJ"],
  ["RB Bragantino", "Red Bull Bragantino SP"],
  ["Grêmio FBPA", "Gremio FB Porto Alegrense RS"],
  ["EC Bahia", "EC Bahia BA"],
  ["EC Vitória", "EC Vitoria BA"],
  ["Santos FC", "Santos FC SP"],
  ["Mirassol FC", "Mirassol FC SP"],
  ["Chapecoense AF", "Chapecoense SC"],
  ["São Paulo FC", "Sao Paulo FC SP"],
  ["CR Flamengo", "CR Flamengo RJ"],
  ["SC Corinthians Paulista", "SC Corinthians Paulista SP"],
];

describe("normalizeTeamName", () => {
  it("drops club-type words and keeps the identifying ones", () => {
    expect(normalizeTeamName("SE Palmeiras SP")).toEqual(["palmeiras"]);
    expect(normalizeTeamName("EC Bahia BA")).toEqual(["bahia"]);
  });

  it("strips accents so spelling differences don't matter", () => {
    expect(normalizeTeamName("EC Vitória")).toEqual(normalizeTeamName("EC Vitoria BA"));
    expect(normalizeTeamName("São Paulo FC")).toEqual(normalizeTeamName("Sao Paulo FC SP"));
  });

  it("never strips a name down to nothing", () => {
    // Every word here is on the noise list; the result must still identify something.
    expect(normalizeTeamName("FC United").length).toBeGreaterThan(0);
    expect(normalizeTeamName("SC").length).toBeGreaterThan(0);
  });
});

describe("nameSimilarity", () => {
  it("scores every real pairing at or above the acceptance threshold", () => {
    for (const [fd, odds] of REAL_PAIRS) {
      expect(nameSimilarity(fd, odds), `${fd} vs ${odds}`).toBeGreaterThanOrEqual(MIN_TEAM_SIMILARITY);
    }
  });

  it("keeps genuinely different clubs apart", () => {
    // The pairs that would do real damage if conflated.
    expect(nameSimilarity("Real Madrid CF", "Atlético de Madrid")).toBeLessThan(MIN_TEAM_SIMILARITY);
    expect(nameSimilarity("Manchester United FC", "Manchester City FC")).toBeLessThan(MIN_TEAM_SIMILARITY);
    expect(nameSimilarity("EC Bahia", "EC Vitória")).toBeLessThan(MIN_TEAM_SIMILARITY);
    expect(nameSimilarity("Athletic Club", "Club Atlético de Madrid")).toBeLessThan(MIN_TEAM_SIMILARITY);
    expect(nameSimilarity("SE Palmeiras", "Santos FC")).toBeLessThan(MIN_TEAM_SIMILARITY);
  });
});

describe("findEventForFixture", () => {
  const kickoff = new Date("2026-08-23T19:00:00Z");
  const events: OddsEvent[] = [
    { id: 1, home: "SE Palmeiras SP", away: "CR Vasco da Gama RJ", date: "2026-08-23T19:00:00Z" },
    { id: 2, home: "Red Bull Bragantino SP", away: "Gremio FB Porto Alegrense RS", date: "2026-08-23T19:00:00Z" },
    { id: 3, home: "Santos FC SP", away: "Mirassol FC SP", date: "2026-08-23T21:30:00Z" },
  ];

  it("finds the right fixture among same-day matches", () => {
    const found = findEventForFixture({ homeTeamName: "SE Palmeiras", awayTeamName: "CR Vasco da Gama", utcDate: kickoff }, events);
    expect(found?.id).toBe(1);
  });

  it("does not confuse two fixtures kicking off at the same time", () => {
    const found = findEventForFixture({ homeTeamName: "RB Bragantino", awayTeamName: "Grêmio FBPA", utcDate: kickoff }, events);
    expect(found?.id).toBe(2);
  });

  it("respects home/away order rather than matching the reverse fixture", () => {
    const found = findEventForFixture({ homeTeamName: "CR Vasco da Gama", awayTeamName: "SE Palmeiras", utcDate: kickoff }, events);
    expect(found).toBeNull();
  });

  it("returns null rather than guessing when the fixture is absent", () => {
    const found = findEventForFixture({ homeTeamName: "CR Flamengo", awayTeamName: "SC Internacional", utcDate: kickoff }, events);
    expect(found).toBeNull();
  });

  it("rejects a name match played on a different date", () => {
    const found = findEventForFixture(
      { homeTeamName: "SE Palmeiras", awayTeamName: "CR Vasco da Gama", utcDate: new Date("2026-09-15T19:00:00Z") },
      events
    );
    expect(found).toBeNull();
  });

  it("tolerates a kickoff time that shifted by a few hours", () => {
    const found = findEventForFixture(
      { homeTeamName: "SE Palmeiras", awayTeamName: "CR Vasco da Gama", utcDate: new Date("2026-08-23T22:00:00Z") },
      events
    );
    expect(found?.id).toBe(1);
  });
});
