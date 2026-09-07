/* MusicBrainz fills the gap Spotify leaves: records that are announced but not
   yet on Spotify. Rate limit is one request a second and they mean it, so this
   batches artist names into OR queries rather than asking per artist. */

import type { Release, SpotifyArtist } from "./spotify";

const MB_BASE = "https://musicbrainz.org/ws/2";
const BATCH_SIZE = 15;

let lastRequest = 0;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

type ReleaseGroup = {
  id: string;
  title: string;
  "first-release-date"?: string;
  "primary-type"?: string;
  "artist-credit"?: { name?: string; artist?: { name?: string } }[];
};

async function mbFetch(path: string, signal?: AbortSignal): Promise<{ "release-groups"?: ReleaseGroup[]; count?: number } | null> {
  const wait = Math.max(0, 1100 - (Date.now() - lastRequest));
  if (wait > 0) await sleep(wait, signal);
  lastRequest = Date.now();

  const res = await fetch(`${MB_BASE}${path}`, { signal, headers: { Accept: "application/json" } });
  if (res.status === 429 || res.status === 503) {
    await sleep(2000, signal);
    return mbFetch(path, signal);
  }
  if (!res.ok) return null;
  return res.json();
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/* Lucene chokes on punctuation that is perfectly normal in a band name. */
const escapeName = (name: string) => name.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, "\\$1");

function precisionOf(dateStr: string): "day" | "month" | "year" {
  if (dateStr.length === 7) return "month";
  if (dateStr.length === 4) return "year";
  return "day";
}
function parseMbDate(dateStr: string): Date {
  const p = precisionOf(dateStr);
  if (p === "month") return new Date(`${dateStr}-01T00:00:00`);
  if (p === "year") return new Date(`${dateStr}-01-01T00:00:00`);
  return new Date(`${dateStr}T00:00:00`);
}
function albumType(primary?: string): string {
  const t = (primary ?? "album").toLowerCase();
  return t === "single" || t === "ep" ? "single" : "album";
}

async function fetchInRange(
  artists: SpotifyArtist[],
  from: string,
  to: string,
  signal?: AbortSignal,
  onProgress?: (batch: number, total: number) => void,
): Promise<ReleaseGroup[]> {
  const range = `firstreleasedate:[${from} TO ${to}]`;

  const results: ReleaseGroup[] = [];
  const totalBatches = Math.ceil(artists.length / BATCH_SIZE);

  for (let b = 0; b < totalBatches; b++) {
    const batch = artists.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
    const clause = batch.map((a) => `"${escapeName(a.name)}"`).join(" OR ");
    const query = encodeURIComponent(`artist:(${clause}) AND ${range}`);
    onProgress?.(b + 1, totalBatches);

    let offset = 0;
    for (let page = 0; page < 2; page++) {
      const data = await mbFetch(`/release-group?query=${query}&limit=100&offset=${offset}&fmt=json`, signal);
      const groups = data?.["release-groups"];
      if (!groups || groups.length === 0) break;
      results.push(...groups);
      if (results.length >= (data.count ?? 0) || groups.length < 100) break;
      offset += 100;
    }
  }
  return results;
}

const DAY = 24 * 60 * 60 * 1000;

/* Everything announced between today and a year out. */
export function fetchUpcoming(
  artists: SpotifyArtist[],
  signal?: AbortSignal,
  onProgress?: (batch: number, total: number) => void,
): Promise<ReleaseGroup[]> {
  return fetchInRange(artists, ymd(new Date()), ymd(new Date(Date.now() + 365 * DAY)), signal, onProgress);
}

/* The last six months. Spotify reports its own back-catalogue, so this is only
   needed for YouTube members, where MusicBrainz is the sole source. */
export function fetchRecent(
  artists: SpotifyArtist[],
  signal?: AbortSignal,
  onProgress?: (batch: number, total: number) => void,
): Promise<ReleaseGroup[]> {
  return fetchInRange(artists, ymd(new Date(Date.now() - 180 * DAY)), ymd(new Date()), signal, onProgress);
}

/* MusicBrainz matches on name, so anything we can't tie back to a tracked
   artist is dropped rather than guessed at. */
export function matchToArtists(
  groups: ReleaseGroup[],
  artists: SpotifyArtist[],
  existing: Release[],
  isUpcoming = true,
): Release[] {
  const byName = new Map(artists.map((a) => [a.name.toLowerCase().trim(), a]));
  const seen = new Set(existing.map((r) => `${r.title.toLowerCase().trim()}::${r.artist.toLowerCase().trim()}`));
  const out: Release[] = [];

  for (const rg of groups) {
    const dateStr = rg["first-release-date"];
    if (!dateStr) continue;

    const credits = (rg["artist-credit"] ?? []).map((c) => c.name ?? c.artist?.name).filter(Boolean) as string[];
    let matched: SpotifyArtist | undefined;
    for (const name of credits) {
      matched = byName.get(name.toLowerCase().trim());
      if (matched) break;
    }
    if (!matched) continue;

    const artist = credits.join(", ");
    const key = `${rg.title.toLowerCase().trim()}::${artist.toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: `mb-${rg.id}`, title: rg.title, artist, artistIds: [matched.id],
      releaseDate: dateStr, precision: precisionOf(dateStr), date: parseMbDate(dateStr),
      isUpcoming, albumType: albumType(rg["primary-type"]),
      artUrl: `https://coverartarchive.org/release-group/${rg.id}/front-250`,
      url: `https://musicbrainz.org/release-group/${rg.id}`,
      source: "musicbrainz",
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
