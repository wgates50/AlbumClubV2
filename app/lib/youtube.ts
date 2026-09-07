/* YouTube Music, browser side. Google insists on a client secret even for a
   PKCE flow, so unlike Spotify the code is handed to our own server and
   exchanged there — the secret never ships in the bundle. Everything after
   that is ordinary YouTube Data API reading. */

import type { SpotifyArtist } from "./spotify";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const YT_API_BASE = "https://www.googleapis.com/youtube/v3";
const SCOPES = "https://www.googleapis.com/auth/youtube.readonly";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

export type Playlist = { id: string; name: string; image: string; trackCount: number; owner: string };

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
export function redirectUri(): string {
  const pinned = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ?? process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI;
  if (pinned) return pinned.trim();
  const origin = window.location.origin;
  return origin.includes("localhost") ? origin.replace("://localhost", "://127.0.0.1") : origin;
}

export async function startAuth(): Promise<void> {
  if (!GOOGLE_CLIENT_ID) throw new Error("YouTube isn't set up on this deployment yet.");
  const verifier = randomString(64);
  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("auth_service", "youtube");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const params = new URLSearchParams({
    response_type: "code",
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: "S256",
    code_challenge: base64url(digest),
    /* offline + consent is what actually returns a refresh token, so the
       connection survives past the first hour. */
    access_type: "offline",
    prompt: "consent",
  });
  window.location.href = `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function completeAuth(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const authError = params.get("error");
  const clean = () => window.history.replaceState({}, document.title, window.location.pathname);

  if (authError) {
    clean();
    throw new Error(authError === "access_denied" ? "YouTube access was declined" : `Google: ${authError}`);
  }
  if (!code) return false;

  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) {
    clean();
    throw new Error("That sign-in didn't finish — try connecting again.");
  }
  const uri = redirectUri();
  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("auth_service");
  clean();

  const res = await fetch("/api/youtube", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: uri }),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(d.error ?? "Google wouldn't complete the sign-in");
  }
  return true;
}

async function serverToken(): Promise<string> {
  const res = await fetch("/api/youtube");
  const d = (await res.json()) as { ok?: boolean; accessToken?: string; message?: string };
  if (!d.ok || !d.accessToken) throw new Error(d.message ?? "YouTube needs reconnecting");
  return d.accessToken;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function yt<T>(token: string, endpoint: string): Promise<T> {
  const res = await fetch(`${YT_API_BASE}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error("YouTube needs reconnecting");
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(d.error?.message ?? `YouTube error ${res.status}`);
  }
  return (await res.json()) as T;
}

type PlaylistPage = {
  items?: { id: string; snippet: { title: string; channelTitle?: string; thumbnails?: Record<string, { url: string }> }; contentDetails?: { itemCount?: number } }[];
  nextPageToken?: string;
  pageInfo?: { totalResults?: number };
};

export async function fetchPlaylists(): Promise<Playlist[]> {
  const token = await serverToken();
  const out: Playlist[] = [];
  let pageToken = "";
  do {
    const d: PlaylistPage = await yt(token, `/playlists?part=snippet,contentDetails&mine=true&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`);
    for (const item of d.items ?? []) {
      out.push({
        id: item.id, name: item.snippet.title,
        image: item.snippet.thumbnails?.medium?.url ?? item.snippet.thumbnails?.default?.url ?? "",
        trackCount: item.contentDetails?.itemCount ?? 0,
        owner: item.snippet.channelTitle ?? "",
      });
    }
    pageToken = d.nextPageToken ?? "";
  } while (pageToken);

  /* "Liked Music" is a real playlist under the id LM, but not every account
     exposes it — if it isn't there, carry on without it. */
  try {
    const liked: PlaylistPage = await yt(token, "/playlistItems?part=snippet&playlistId=LM&maxResults=1");
    if ((liked.pageInfo?.totalResults ?? 0) > 0) {
      out.unshift({ id: "LM", name: "Liked Music", image: "", trackCount: liked.pageInfo!.totalResults!, owner: "YouTube Music" });
    }
  } catch {
    /* not available on this account */
  }
  return out;
}

type VideoPage = {
  items?: { snippet?: { title?: string; description?: string; channelTitle?: string; resourceId?: { videoId?: string } } }[];
  nextPageToken?: string;
};

/* YouTube has no notion of "artist" on a video, so this reads the signals that
   actually hold: an Art Track's channel is "<Artist> - Topic", auto-generated
   uploads say so in the description, and otherwise "Artist - Title" is the
   common convention. Anything that looks like a label or a VEVO channel is
   dropped rather than guessed at. */
function artistFromVideo(v: NonNullable<VideoPage["items"]>[number]): string | null {
  const channel = v.snippet?.channelTitle ?? "";
  const description = v.snippet?.description ?? "";
  const title = v.snippet?.title ?? "";
  const labelish = (s: string) => /records|music|vevo/i.test(s);

  if (channel.endsWith(" - Topic")) return channel.slice(0, -8).trim();
  if (description.includes("Provided to YouTube by") || description.includes("Auto-generated by YouTube")) {
    return channel.trim() || null;
  }
  const dash = title.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dash) {
    const artist = dash[1].trim();
    if (artist.length > 1 && !labelish(artist)) return artist;
  }
  if (channel.length > 1 && !labelish(channel)) return channel.trim();
  return null;
}

export async function fetchArtistsFromPlaylists(
  playlistIds: string[],
  onProgress?: (m: string) => void,
): Promise<SpotifyArtist[]> {
  const token = await serverToken();
  const seen = new Set<string>();
  const names: string[] = [];

  for (let i = 0; i < playlistIds.length; i++) {
    onProgress?.(`Reading playlist ${i + 1} of ${playlistIds.length}…`);
    const videoIds: string[] = [];
    let pageToken = "";
    do {
      const d: VideoPage = await yt(token, `/playlistItems?part=snippet&playlistId=${playlistIds[i]}&maxResults=50${pageToken ? `&pageToken=${pageToken}` : ""}`);
      for (const item of d.items ?? []) {
        const id = item.snippet?.resourceId?.videoId;
        if (id) videoIds.push(id);
      }
      pageToken = d.nextPageToken ?? "";
    } while (pageToken);

    for (let j = 0; j < videoIds.length; j += 50) {
      onProgress?.(`Playlist ${i + 1}: reading tracks ${Math.min(j + 50, videoIds.length)}/${videoIds.length}…`);
      const d: VideoPage = await yt(token, `/videos?part=snippet&id=${videoIds.slice(j, j + 50).join(",")}`);
      for (const v of d.items ?? []) {
        const name = artistFromVideo(v);
        if (name && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          names.push(name);
        }
      }
      if (j + 50 < videoIds.length) await sleep(100);
    }
    if (i < playlistIds.length - 1) await sleep(100);
  }

  return names.map((name) => ({
    id: `yt-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`,
    name, imageUrl: null, source: "youtube",
  }));
}
