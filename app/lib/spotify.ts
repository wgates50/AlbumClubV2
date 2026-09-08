/* Spotify, browser side. The tokens themselves live in Postgres against the
   member (see the API route) — this module only runs the PKCE dance to obtain
   them, then borrows a fresh access token from the server to do the scanning.
   Scanning stays in the browser because it is hundreds of paged requests and
   would blow a serverless timeout. */

const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
const SCOPES = "user-follow-read user-top-read playlist-read-private user-library-read";

export const DEFAULT_CLIENT_ID =
  process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "857748a5334f4c79bdef21da5050714a";

export type SpotifyArtist = { id: string; name: string; imageUrl: string | null; source: string };
export type Release = {
  id: string;
  title: string;
  artist: string;
  artistIds: string[];
  releaseDate: string;
  precision: "day" | "month" | "year";
  date: Date;
  isUpcoming: boolean;
  albumType: string;
  artUrl: string | null;
  url: string | null;
  source: "spotify" | "musicbrainz";
};

function randomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join("");
}
function base64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/* Spotify matches this against the app's allowlist character for character —
   a trailing slash or the wrong Vercel alias is enough to be turned away. The
   deployment can be opened on several hostnames, so NEXT_PUBLIC_SPOTIFY_REDIRECT_URI
   pins it to the one string actually registered; without it we fall back to
   wherever the page happens to be served from. */
export function redirectUri(): string {
  const pinned = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
  if (pinned) return pinned.trim();
  const origin = window.location.origin;
  return origin.includes("localhost") ? origin.replace("://localhost", "://127.0.0.1") : origin;
}

export async function startAuth(clientId = DEFAULT_CLIENT_ID): Promise<void> {
  const verifier = randomString(64);
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("pkce_client_id", clientId);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: base64url(digest),
  });
  window.location.href = `${AUTHORIZE_URL}?${params.toString()}`;
}

/* Runs on return from Spotify. Exchanges the code, hands the tokens to the
   server, and scrubs the code out of the URL so a refresh can't replay it. */
export async function completeAuth(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const authError = params.get("error");
  const clean = () => window.history.replaceState({}, document.title, window.location.pathname);

  if (authError) {
    clean();
    throw new Error(authError === "access_denied" ? "Spotify access was declined" : `Spotify: ${authError}`);
  }
  if (!code) return false;

  const verifier = sessionStorage.getItem("pkce_verifier");
  const clientId = sessionStorage.getItem("pkce_client_id") ?? DEFAULT_CLIENT_ID;
  if (!verifier) {
    clean();
    throw new Error("That sign-in didn't finish — try connecting again.");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    }),
  });
  sessionStorage.removeItem("pkce_verifier");
  clean();

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error_description?: string };
    throw new Error(err.error_description ?? "Spotify wouldn't complete the sign-in");
  }
  const d = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };

  const save = await fetch("/api/spotify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      accessToken: d.access_token,
      refreshToken: d.refresh_token ?? null,
      expiresIn: d.expires_in ?? 3600,
      clientId,
    }),
  });
  if (!save.ok) throw new Error("Connected to Spotify, but saving it failed. Try again.");
  return true;
}

async function serverToken(): Promise<string> {
  const res = await fetch("/api/spotify");
  const d = (await res.json()) as { ok?: boolean; accessToken?: string; message?: string };
  if (!d.ok || !d.accessToken) throw new Error(d.message ?? "Spotify needs reconnecting");
  return d.accessToken;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); },
      { once: true });
  });

/* Spotify asking us to back off is not a per-request problem: every other
   request in the scan is about to be told the same thing. It stops the scan
   rather than being retried into a stall. */
export class RateLimited extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super(`Spotify rate limit, retry after ${retryAfter}s`);
    this.name = "RateLimited";
    this.retryAfter = retryAfter;
  }
}

/* A fetch with no timeout hangs forever on a stalled connection, and a whole
   batch waits on its slowest member. */
function guard(signal: AbortSignal | undefined, ms: number) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(new DOMException("Timed out", "TimeoutError")), ms);
  const relay = () => c.abort(signal?.reason);
  if (signal?.aborted) c.abort(signal.reason);
  else signal?.addEventListener("abort", relay, { once: true });
  return {
    signal: c.signal,
    release() { clearTimeout(timer); signal?.removeEventListener("abort", relay); },
  };
}

async function api<T>(token: string, endpoint: string, opts: { signal?: AbortSignal; retries?: number } = {}): Promise<T> {
  const { signal } = opts;
  let retries = opts.retries ?? 2;
  let waits = 0;
  for (;;) {
    const g = guard(signal, 12000);
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${token}` }, signal: g.signal });
    } finally {
      g.release();
    }
    if (res.status === 429) {
      const after = parseInt(res.headers.get("Retry-After") ?? "1", 10) || 1;
      if (after <= 8 && waits < 3) { waits += 1; await sleep(after * 1000, signal); continue; }
      throw new RateLimited(after);
    }
    if (res.status === 401 && retries > 0) {
      retries -= 1;
      token = await serverToken();
      continue;
    }
    if (!res.ok) throw new Error(`Spotify error ${res.status}`);
    return (await res.json()) as T;
  }
}

type RawArtist = { id: string; name: string; images?: { url: string }[] };
const toArtist = (a: RawArtist): SpotifyArtist => ({
  id: a.id, name: a.name, imageUrl: a.images?.[1]?.url ?? a.images?.[0]?.url ?? null, source: "spotify",
});

export async function fetchFollowedArtists(onProgress?: (m: string) => void): Promise<SpotifyArtist[]> {
  const token = await serverToken();
  const found = new Map<string, SpotifyArtist>();

  onProgress?.("Reading the artists you follow…");
  let url: string | null = "/me/following?type=artist&limit=50";
  while (url) {
    const d: { artists: { items: RawArtist[]; cursors?: { after?: string } } } = await api(token, url);
    for (const a of d.artists.items) found.set(a.id, toArtist(a));
    url = d.artists.cursors?.after ? `/me/following?type=artist&limit=50&after=${d.artists.cursors.after}` : null;
  }

  onProgress?.("Reading your most-played artists…");
  for (const range of ["short_term", "medium_term"]) {
    const d = await api<{ items: RawArtist[] }>(token, `/me/top/artists?limit=50&time_range=${range}`);
    for (const a of d.items) found.set(a.id, toArtist(a));
  }

  return Array.from(found.values());
}

export const LIKED_SONGS_ID = "__liked_songs__";
export type Playlist = { id: string; name: string; image: string; trackCount: number; owner: string };

export async function fetchPlaylists(): Promise<Playlist[]> {
  const token = await serverToken();
  const out: Playlist[] = [];

  /* Liked Songs isn't a playlist as far as the API is concerned, so it is
     fetched separately and pinned to the top. Needs user-library-read, which
     the user can decline — hence the catch. */
  let liked: Playlist | null = null;
  try {
    const d = await api<{ total?: number }>(token, "/me/tracks?limit=1");
    liked = { id: LIKED_SONGS_ID, name: "Liked Songs", image: "", trackCount: d.total ?? 0, owner: "You" };
  } catch {
    /* scope not granted */
  }

  let url: string | null = "/me/playlists?limit=50";
  while (url) {
    const d: {
      items: ({ id: string; name: string; images?: { url: string }[]; tracks?: { total?: number }; owner?: { display_name?: string } } | null)[];
      next?: string | null;
    } = await api(token, url);
    for (const item of d.items) {
      if (!item) continue;
      out.push({
        id: item.id, name: item.name, image: item.images?.[0]?.url ?? "",
        trackCount: item.tracks?.total ?? 0, owner: item.owner?.display_name ?? "",
      });
    }
    if (d.next) {
      const next = new URL(d.next);
      url = next.pathname.replace("/v1", "") + next.search;
    } else url = null;
  }
  return liked ? [liked, ...out] : out;
}

export type ArtistScan = {
  artists: SpotifyArtist[];
  /* Short of `total` means Spotify would not finish the job this sitting. What
     came back is still real, just not the whole library. */
  named: number;
  total: number;
  complete: boolean;
};

export async function fetchArtistsFromPlaylists(
  playlistIds: string[],
  onProgress?: (m: string) => void,
  signal?: AbortSignal,
  known: Map<string, SpotifyArtist> = new Map(),
): Promise<ArtistScan> {
  const token = await serverToken();
  const ids = new Set<string>();

  for (let i = 0; i < playlistIds.length; i++) {
    const isLiked = playlistIds[i] === LIKED_SONGS_ID;
    onProgress?.(`Reading ${isLiked ? "Liked Songs" : `playlist ${i + 1} of ${playlistIds.length}`}…`);
    let url: string | null = isLiked
      ? "/me/tracks?limit=50&fields=items(track(artists(id))),next,total"
      : `/playlists/${playlistIds[i]}/tracks?limit=100&fields=items(track(artists(id))),next`;
    while (url) {
      const d: { items: ({ track?: { artists?: { id?: string }[] } } | null)[]; next?: string | null } = await api(token, url);
      for (const item of d.items) {
        for (const a of item?.track?.artists ?? []) if (a.id) ids.add(a.id);
      }
      if (d.next) {
        const next = new URL(d.next);
        url = next.pathname.replace("/v1", "") + next.search;
      } else url = null;
    }
    if (i < playlistIds.length - 1) await sleep(100);
  }

  /* Names and pictures come back 50 at a time, which for a big library is a lot
     of asking. Anyone already on file is reused rather than looked up again, so
     a second run starts where the first ran out of patience. Whatever does get
     named is handed back even if the rest will not come — an incomplete answer
     is saved additively, so running again only ever adds. */
  const all = Array.from(ids);
  const artists: SpotifyArtist[] = [];
  const toName: string[] = [];
  for (const id of all) {
    const seen = known.get(id);
    if (seen) artists.push(seen); else toName.push(id);
  }

  let pause = 300;
  let complete = true;
  outer:
  for (let i = 0; i < toName.length; i += 50) {
    onProgress?.(`Naming artists… ${Math.min(i + 50, toName.length)} of ${toName.length}`);
    const batch = toName.slice(i, i + 50).join(",");
    for (let attempt = 0; ; attempt++) {
      try {
        const d = await api<{ artists: (RawArtist | null)[] }>(token, `/artists?ids=${batch}`, { signal });
        artists.push(...d.artists.filter(Boolean).map((a) => toArtist(a as RawArtist)));
        pause = Math.max(300, Math.round(pause * 0.8));
        break;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") throw err;
        if (attempt >= 5) { complete = false; break outer; }
        /* Spotify's own number, waited out in full up to a minute — the earlier
           cap of 30s meant we gave up while it was still telling us when to
           come back. Progress says what is happening so it does not read as
           a freeze. */
        const wait = err instanceof RateLimited ? Math.min(err.retryAfter, 60) : 3;
        onProgress?.(`Spotify asked us to wait ${wait}s — ${artists.length} named so far…`);
        await sleep(wait * 1000, signal);
        pause = Math.min(pause * 2, 3000);
      }
    }
    if (i + 50 < toName.length) await sleep(pause, signal);
  }
  return { artists, named: artists.length, total: all.length, complete };
}

function parseDate(dateStr: string, precision: string): Date | null {
  if (precision === "day") return new Date(`${dateStr}T00:00:00`);
  if (precision === "month") return new Date(`${dateStr}-01T00:00:00`);
  if (precision === "year") return new Date(`${dateStr}-01-01T00:00:00`);
  return null;
}

type RawAlbum = {
  id: string; name: string; album_type: string; release_date: string; release_date_precision: string;
  images?: { url: string }[]; artists: { id: string; name: string }[]; external_urls?: { spotify?: string };
};

export type ScanResult = {
  releases: Release[];
  /* How far it got. Short of `total` means it stopped early and what came back
     is a partial answer worth keeping rather than a complete one. */
  scanned: number;
  total: number;
  rateLimited: boolean;
};

/* Everything out in the last 6 months, plus everything announced ahead.
   Spotify has no bulk endpoint for this, so it is one request per artist —
   with a thousand of them that is minutes of work, and the job is to make it
   survivable rather than fast: paced under the rate limit, interruptible, and
   handing back what it has whenever it stops. */
export async function fetchReleases(
  artists: SpotifyArtist[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
  onPartial?: (releases: Release[], done: number) => void,
): Promise<ScanResult> {
  const token = await serverToken();
  const out = new Map<string, Release>();
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 180);

  /* Spotify's ceiling is not documented and moves, so rather than guess it,
     start briskly and let the 429s tune it: each one costs its stated wait and
     halves the pace from then on. Twenty back to back, which is what this used
     to do, went over within seconds. */
  const BATCH = 6;
  const BANK_EVERY = 150;
  let pause = 250;
  let strikes = 0;
  let banked = 0;
  let scanned = 0;
  let rateLimited = false;

  let i = 0;
  while (i < artists.length) {
    if (signal?.aborted) break;
    const batch = artists.slice(i, i + BATCH);
    let results: { items: RawAlbum[] }[];
    try {
      results = await Promise.all(
        batch.map((a) =>
          api<{ items: RawAlbum[] }>(token, `/artists/${a.id}/albums?include_groups=album,single,compilation&limit=20&market=GB`, { signal })
            .catch((err) => {
              if (err instanceof RateLimited || (err as Error)?.name === "AbortError") throw err;
              return { items: [] as RawAlbum[] };
            }),
        ),
      );
    } catch (err) {
      if ((err as Error)?.name === "AbortError") break;
      if (err instanceof RateLimited) {
        /* A long cool-off is indistinguishable from a freeze from the outside,
           and repeated strikes mean we are not going to finish this sitting. */
        if (err.retryAfter > 30 || ++strikes > 4) { rateLimited = true; break; }
        try { await sleep(err.retryAfter * 1000, signal); } catch { break; }
        pause = Math.min(pause * 2, 4000);
        continue;   /* same batch, slower */
      }
      throw err;
    }
    i += BATCH;
    scanned = Math.min(i, artists.length);
    pause = Math.max(250, Math.round(pause * 0.85));
    for (const d of results) {
      for (const al of d.items) {
        if (out.has(al.id)) continue;
        const date = parseDate(al.release_date, al.release_date_precision);
        if (!date) continue;
        const isUpcoming = date > now;
        if (!isUpcoming && date < cutoff) continue;
        out.set(al.id, {
          id: al.id, title: al.name,
          artist: al.artists.map((x) => x.name).join(", "),
          artistIds: al.artists.map((x) => x.id),
          releaseDate: al.release_date,
          precision: al.release_date_precision as "day" | "month" | "year",
          date, isUpcoming, albumType: al.album_type,
          artUrl: al.images?.[1]?.url ?? al.images?.[0]?.url ?? null,
          url: al.external_urls?.spotify ?? null,
          source: "spotify",
        });
      }
    }
    onProgress?.(scanned, artists.length);
    /* Banked along the way, so a scan that is interrupted at artist 700 is not
       700 artists of work thrown away. */
    if (onPartial && scanned - banked >= BANK_EVERY) {
      banked = scanned;
      onPartial(Array.from(out.values()), scanned);
    }
    if (i < artists.length) { try { await sleep(pause, signal); } catch { break; } }
  }
  return {
    releases: Array.from(out.values()).sort((a, b) => b.date.getTime() - a.date.getTime()),
    scanned, total: artists.length, rateLimited,
  };
}
