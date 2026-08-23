/**
 * Matches odds-api.io fixtures to football-data.org ones by team name.
 *
 * The two providers spell the same club differently — football-data.org says
 * "SE Palmeiras" where odds-api.io says "SE Palmeiras SP", and Brazilian sides
 * routinely carry a two-letter state suffix (SP, RJ, BA, RS, MG...) that is part
 * of the name at one source and absent at the other. Rather than maintain a
 * hand-written alias table per league, names are normalised down to their
 * distinctive words and compared, and the pairing is only accepted when BOTH
 * teams agree and the kickoff times are close.
 */

// Club-type words that carry no identifying information, in the languages the
// supported leagues use. "Real" and "Atletico" are deliberately NOT here: they
// distinguish real clubs (Real Madrid vs Madrid, Atletico vs Athletic).
const NOISE_WORDS = new Set([
  "fc",
  "cf",
  "sc",
  "ac",
  "as",
  "afc",
  "cd",
  "ud",
  "sd",
  "rc",
  "ca",
  "ec",
  "se",
  "cr",
  "se",
  "rb",
  "fr",
  "aa",
  "af",
  "club",
  "clube",
  "futebol",
  "futbol",
  "football",
  "calcio",
  "sport",
  "sporting",
  "sportiva",
  "sportivo",
  "societa",
  "societe",
  "associacao",
  "asociacion",
  "association",
  "deportivo",
  "deportiva",
  "regatas",
  "team",
  "the",
  "de",
  "do",
  "da",
  "del",
  "di",
  "of",
  "und",
  "e",
  "v",
  "ev",
  "fk",
  "sv",
  "vfl",
  "vfb",
  "tsg",
  "fsv",
  "bsc",
  // Club-type abbreviations that one source spells out and the other doesn't
  // ("Gremio FBPA" vs "Gremio FB Porto Alegrense", "Coritiba FBC").
  "fb",
  "fbc",
  "fbpa",
  // NOT here, on purpose: "united" and "city" are the ONLY thing separating
  // Manchester United from Manchester City, and likewise for many English clubs.
]);

// Trailing Brazilian state codes, which appear only on the odds provider's names.
const STATE_SUFFIXES = new Set([
  "sp",
  "rj",
  "mg",
  "rs",
  "ba",
  "pr",
  "sc",
  "pe",
  "ce",
  "go",
  "pa",
  "am",
  "df",
  "mt",
  "ms",
  "es",
  "pb",
  "rn",
  "al",
  "se",
  "pi",
  "ma",
  "to",
  "ro",
  "ac",
  "rr",
  "ap",
]);

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Reduces a club name to the lowercase words that actually identify it. */
export function normalizeTeamName(name: string): string[] {
  const words = stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Drop a trailing state code only when something else remains to identify the club.
  const trimmed = words.length > 1 && STATE_SUFFIXES.has(words[words.length - 1]) ? words.slice(0, -1) : words;

  const meaningful = trimmed.filter((w) => !NOISE_WORDS.has(w));
  return meaningful.length > 0 ? meaningful : trimmed;
}

/**
 * 0..1 containment between two normalised names: shared words over the SHORTER of
 * the two sets.
 *
 * Containment rather than Jaccard, because the dominant real difference between the
 * two providers is one of them adding descriptive words — "Bragantino" against "Red
 * Bull Bragantino", "Gremio" against "Gremio Porto Alegrense". Jaccard would score
 * those 0.33 and 0.25 and reject the correct fixture. Containment scores them 1.0
 * while still separating clubs that merely share a city, since "Manchester United"
 * and "Manchester City" agree on only one of two words either way.
 */
export function nameSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeTeamName(a));
  const setB = new Set(normalizeTeamName(b));
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const word of setA) {
    if (setB.has(word)) {
      shared++;
      continue;
    }
    // Catches truncation and spelling drift without letting short or unrelated
    // words collide — both sides must be long enough for a prefix to be meaningful.
    for (const other of setB) {
      if (word.length >= 5 && other.length >= 5 && (word.startsWith(other) || other.startsWith(word))) {
        shared += 0.9;
        break;
      }
    }
  }

  return Math.min(1, shared / Math.min(setA.size, setB.size));
}

export interface OddsEvent {
  id: number;
  home: string;
  away: string;
  date: string;
}

export interface FixtureLike {
  homeTeamName: string;
  awayTeamName: string;
  utcDate: Date;
}

/**
 * Both sides must clear this, so a single strong half can't carry a wrong pairing.
 * 0.6 is the level that admits every real spelling difference observed between the
 * two providers while rejecting same-city rivals, which agree on exactly 0.5.
 */
export const MIN_TEAM_SIMILARITY = 0.6;
const MAX_KICKOFF_DRIFT_MS = 36 * 60 * 60 * 1000;

/**
 * Finds the odds-api event for a fixture, or null when nothing is confident enough.
 * Returning null is the correct outcome for an unmatched fixture — a wrong pairing
 * would silently price a different match.
 */
export function findEventForFixture(fixture: FixtureLike, events: OddsEvent[]): OddsEvent | null {
  let best: { event: OddsEvent; score: number } | null = null;

  for (const event of events) {
    const drift = Math.abs(new Date(event.date).getTime() - fixture.utcDate.getTime());
    if (drift > MAX_KICKOFF_DRIFT_MS) continue;

    const home = nameSimilarity(fixture.homeTeamName, event.home);
    const away = nameSimilarity(fixture.awayTeamName, event.away);
    if (home < MIN_TEAM_SIMILARITY || away < MIN_TEAM_SIMILARITY) continue;

    const score = home + away;
    if (!best || score > best.score) best = { event, score };
  }

  return best?.event ?? null;
}
