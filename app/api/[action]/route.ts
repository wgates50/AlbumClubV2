import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import crypto from "node:crypto";
import { cookies } from "next/headers";

/* Album Club — the whole server side: database, sessions and every endpoint.
   Kept in one file so the project stays at four files total. */

type Member = { id: string; name: string; color: string; sortOrder: number };
type Album = {
id: string; month: string; title: string; artist: string; year: number | null;
chosenBy: string | null; artUrl: string | null; spotifyUrl: string | null;
ytmUrl: string | null; appleUrl: string | null; tracks: string[]; createdAt: string;
};
type Rating = {
albumId: string; memberId: string; score: number | null; review: string;
favTracks: string[]; updatedAt: string;
};

const CONN =
process.env.DATABASE_URL || process.env.POSTGRES_URL ||
process.env.DATABASE_POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
const hasDb = CONN.length > 0;

let pool: Pool | null = null;
function db(): Pool {
if (!pool) {
const local = CONN.includes("localhost") || CONN.includes("127.0.0.1");
pool = new Pool({
connectionString: CONN,
ssl: local ? undefined : { rejectUnauthorized: false },
max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 12000,
});
pool.on("error", () => {});
}
return pool;
}

let schema: Promise<void> | null = null;
async function ready(): Promise<void> {
if (!schema) schema = init();
try { await schema; } catch (e) { schema = null; throw e; }
}
async function init(): Promise<void> {
const p = db();
await p.query(`create table if not exists settings (key text primary key, value text not null)`);
await p.query(`create table if not exists members (id text primary key, name text not null, color text not null, sort_order int not null default 0)`);
await p.query(`create table if not exists albums (id text primary key, month text not null, title text not null, artist text not null, year int, chosen_by text, art_url text, spotify_url text, ytm_url text, apple_url text, tracks text not null default '[]', created_at timestamptz not null default now())`);
await p.query(`create table if not exists ratings (album_id text not null, member_id text not null, score numeric(4,1), review text not null default '', fav_tracks text not null default '[]', updated_at timestamptz not null default now(), primary key (album_id, member_id))`);
await p.query(`create index if not exists albums_month_idx on albums(month)`);
/* Upcoming: each member's own connected service, tracked artists and shortlist. */
await p.query(`create table if not exists music_accounts (member_id text primary key, service text not null, access_token text, refresh_token text, expires_at timestamptz, client_id text, scanned_at timestamptz, connected_at timestamptz not null default now())`);
await p.query(`create table if not exists tracked_artists (member_id text not null, artist_id text not null, name text not null, image_url text, source text not null default 'spotify', excluded boolean not null default false, updated_at timestamptz not null default now(), primary key (member_id, artist_id))`);
await p.query(`create table if not exists shortlist (id text primary key, member_id text not null, month text not null, title text not null, artist text not null, release_date text, art_url text, spotify_url text, source text, added_at timestamptz not null default now())`);
await p.query(`create index if not exists shortlist_member_month_idx on shortlist(member_id, month)`);
/* Added after the table shipped, so it has to be an alter rather than part of the create. */
await p.query(`alter table music_accounts add column if not exists playlist_ids text not null default '[]'`);
}

function parseList(raw: unknown): string[] {
if (Array.isArray(raw)) return raw.map(String);
if (typeof raw !== "string" || !raw) return [];
try { const v = JSON.parse(raw); return Array.isArray(v) ? v.map(String) : []; }
catch { return []; }
}

/* Preview data — only used until a database is attached. */
const nowMonth = () => new Date().toISOString().slice(0, 7);
const P_MEM: Member[] = [
{ id: "will", name: "Will", color: "#e0b25c", sortOrder: 0 },
{ id: "oli", name: "Oli", color: "#e4715a", sortOrder: 1 },
{ id: "flik", name: "Flik", color: "#5fb3a1", sortOrder: 2 },
];
const art = (p: string) => `https://is1-ssl.mzstatic.com/image/thumb/${p}/600x600bb.jpg`;
const P_ALB: Album[] = [
{ id: "p1", month: nowMonth(), title: "Untrue", artist: "Burial", year: 2007, chosenBy: "will",
artUrl: art("Music116/v4/9d/0f/1c/9d0f1c2b-2fae-d8ac-3920-ce9ec5bc85b5/7982.jpg"),
spotifyUrl: null, ytmUrl: null, appleUrl: "https://music.apple.com/gb/album/untrue/1056902908",
tracks: ["Archangel", "Near Dark", "Ghost Hardware", "Etched Headplate", "In McDonalds", "Untrue", "Shell of Light", "Dog Shelter", "Homeless", "UK", "Raver"],
createdAt: "2026-01-01T00:00:00.000Z" },
{ id: "p2", month: nowMonth(), title: "Promises", artist: "Floating Points, Pharoah Sanders & the LSO", year: 2021, chosenBy: "oli",
artUrl: art("Music126/v4/af/dc/6b/afdc6b88-b275-de4e-3098-63dff171dffb/680899009720.jpg"),
spotifyUrl: null, ytmUrl: null, appleUrl: "https://music.apple.com/gb/album/promises/1550697816",
tracks: ["Movement 1", "Movement 2", "Movement 3", "Movement 4", "Movement 5", "Movement 6", "Movement 7", "Movement 8", "Movement 9"],
createdAt: "2026-01-01T00:00:01.000Z" },
{ id: "p3", month: nowMonth(), title: "Honey", artist: "Caribou", year: 2024, chosenBy: "flik",
artUrl: art("Music211/v4/84/03/99/84039972-0b74-d18d-f268-23ce3e1d9cf2/57426.jpg"),
spotifyUrl: null, ytmUrl: null, appleUrl: "https://music.apple.com/gb/album/honey/1839200694",
tracks: ["Broke My Heart", "Volume", "Honey", "Campfire", "Come Find Me", "Climbing", "Got To Change", "Over Now"],
createdAt: "2026-01-01T00:00:02.000Z" },
];
const P_RAT: Rating[] = [
{ albumId: "p1", memberId: "oli", score: 9.1, review: "Still sounds like it was recorded through a night bus window. Nothing else gets this much feeling out of so little.", favTracks: ["Archangel", "Shell of Light"], updatedAt: "2026-01-02T00:00:00.000Z" },
{ albumId: "p1", memberId: "flik", score: 8.4, review: "Beautiful, but I need a lie down afterwards.", favTracks: ["Near Dark"], updatedAt: "2026-01-02T00:00:00.000Z" },
{ albumId: "p2", memberId: "will", score: 8.8, review: "One motif for 46 minutes and it never wears out. The strings arriving properly got me.", favTracks: ["Movement 6"], updatedAt: "2026-01-02T00:00:00.000Z" },
];
const pv = {
settings: new Map<string, string>([["club_name", "Album Club"]]),
members: [...P_MEM], albums: [...P_ALB], ratings: [...P_RAT],
};

async function getSettings(): Promise<Record<string, string>> {
if (!hasDb) return Object.fromEntries(pv.settings);
await ready();
const r = await db().query<{ key: string; value: string }>(`select key, value from settings`);
return Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
}
async function setSetting(key: string, value: string): Promise<void> {
if (!hasDb) { pv.settings.set(key, value); return; }
await ready();
await db().query(`insert into settings (key,value) values ($1,$2) on conflict (key) do update set value = excluded.value`, [key, value]);
}
async function listMembers(): Promise<Member[]> {
if (!hasDb) return [...pv.members].sort((a, b) => a.sortOrder - b.sortOrder);
await ready();
const r = await db().query(`select id,name,color,sort_order from members order by sort_order asc, name asc`);
return r.rows.map((x) => ({ id: x.id, name: x.name, color: x.color, sortOrder: Number(x.sort_order) }));
}
async function saveMember(m: Member): Promise<void> {
if (!hasDb) {
const i = pv.members.findIndex((x) => x.id === m.id);
if (i >= 0) pv.members[i] = m; else pv.members.push(m);
return;
}
await ready();
await db().query(`insert into members (id,name,color,sort_order) values ($1,$2,$3,$4) on conflict (id) do update set name=excluded.name, color=excluded.color, sort_order=excluded.sort_order`, [m.id, m.name, m.color, m.sortOrder]);
}
async function deleteMember(id: string): Promise<void> {
if (!hasDb) { pv.members = pv.members.filter((m) => m.id !== id); return; }
await ready();
await db().query(`delete from members where id=$1`, [id]);
}
async function listAlbums(): Promise<Album[]> {
if (!hasDb) return [...pv.albums].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
await ready();
const r = await db().query(`select id,month,title,artist,year,chosen_by,art_url,spotify_url,ytm_url,apple_url,tracks,created_at from albums order by month desc, created_at asc`);
return r.rows.map((x) => ({
id: x.id, month: x.month, title: x.title, artist: x.artist,
year: x.year === null ? null : Number(x.year), chosenBy: x.chosen_by,
artUrl: x.art_url, spotifyUrl: x.spotify_url, ytmUrl: x.ytm_url, appleUrl: x.apple_url,
tracks: parseList(x.tracks), createdAt: new Date(x.created_at).toISOString(),
}));
}
async function saveAlbum(a: Album): Promise<void> {
if (!hasDb) {
const i = pv.albums.findIndex((x) => x.id === a.id);
if (i >= 0) pv.albums[i] = a; else pv.albums.push(a);
return;
}
await ready();
await db().query(`insert into albums (id,month,title,artist,year,chosen_by,art_url,spotify_url,ytm_url,apple_url,tracks) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (id) do update set month=excluded.month,title=excluded.title,artist=excluded.artist,year=excluded.year,chosen_by=excluded.chosen_by,art_url=excluded.art_url,spotify_url=excluded.spotify_url,ytm_url=excluded.ytm_url,apple_url=excluded.apple_url,tracks=excluded.tracks`,
[a.id, a.month, a.title, a.artist, a.year, a.chosenBy, a.artUrl, a.spotifyUrl, a.ytmUrl, a.appleUrl, JSON.stringify(a.tracks ?? [])]);
}
async function deleteAlbum(id: string): Promise<void> {
if (!hasDb) {
pv.albums = pv.albums.filter((a) => a.id !== id);
pv.ratings = pv.ratings.filter((r) => r.albumId !== id);
return;
}
await ready();
await db().query(`delete from ratings where album_id=$1`, [id]);
await db().query(`delete from albums where id=$1`, [id]);
}
async function listRatings(): Promise<Rating[]> {
if (!hasDb) return [...pv.ratings];
await ready();
const r = await db().query(`select album_id,member_id,score,review,fav_tracks,updated_at from ratings`);
return r.rows.map((x) => ({
albumId: x.album_id, memberId: x.member_id,
score: x.score === null ? null : Number(x.score),
review: x.review ?? "", favTracks: parseList(x.fav_tracks),
updatedAt: new Date(x.updated_at).toISOString(),
}));
}
async function saveRating(r: Rating): Promise<void> {
if (!hasDb) {
const i = pv.ratings.findIndex((x) => x.albumId === r.albumId && x.memberId === r.memberId);
if (i >= 0) pv.ratings[i] = r; else pv.ratings.push(r);
return;
}
await ready();
await db().query(`insert into ratings (album_id,member_id,score,review,fav_tracks,updated_at) values ($1,$2,$3,$4,$5,now()) on conflict (album_id,member_id) do update set score=excluded.score,review=excluded.review,fav_tracks=excluded.fav_tracks,updated_at=now()`,
[r.albumId, r.memberId, r.score, r.review, JSON.stringify(r.favTracks ?? [])]);
}

/* ---- upcoming: accounts, tracked artists, shortlist ---- */

type Account = {
memberId: string; service: string; accessToken: string | null; refreshToken: string | null;
expiresAt: string | null; clientId: string | null; scannedAt: string | null; playlistIds: string[];
};
type TrackedArtist = { id: string; name: string; imageUrl: string | null; source: string; excluded: boolean };
type ShortlistItem = {
id: string; memberId: string; month: string; title: string; artist: string;
releaseDate: string | null; artUrl: string | null; spotifyUrl: string | null; source: string | null; addedAt: string;
};

async function getAccount(memberId: string): Promise<Account | null> {
if (!hasDb) return null;
await ready();
const r = await db().query(`select member_id,service,access_token,refresh_token,expires_at,client_id,scanned_at,playlist_ids from music_accounts where member_id=$1`, [memberId]);
const x = r.rows[0];
if (!x) return null;
return {
memberId: x.member_id, service: x.service, accessToken: x.access_token, refreshToken: x.refresh_token,
expiresAt: x.expires_at ? new Date(x.expires_at).toISOString() : null,
clientId: x.client_id, scannedAt: x.scanned_at ? new Date(x.scanned_at).toISOString() : null,
playlistIds: parseList(x.playlist_ids),
};
}
async function saveAccount(a: Account): Promise<void> {
if (!hasDb) return;
await ready();
await db().query(`insert into music_accounts (member_id,service,access_token,refresh_token,expires_at,client_id,playlist_ids) values ($1,$2,$3,$4,$5,$6,$7) on conflict (member_id) do update set service=excluded.service, access_token=excluded.access_token, refresh_token=coalesce(excluded.refresh_token, music_accounts.refresh_token), expires_at=excluded.expires_at, client_id=excluded.client_id`,
[a.memberId, a.service, a.accessToken, a.refreshToken, a.expiresAt, a.clientId, JSON.stringify(a.playlistIds ?? [])]);
}
async function deleteAccount(memberId: string): Promise<void> {
if (!hasDb) return;
await ready();
await db().query(`delete from music_accounts where member_id=$1`, [memberId]);
await db().query(`delete from tracked_artists where member_id=$1`, [memberId]);
}
async function savePlaylistIds(memberId: string, ids: string[]): Promise<void> {
if (!hasDb) return;
await ready();
await db().query(`update music_accounts set playlist_ids=$2 where member_id=$1`, [memberId, JSON.stringify(ids)]);
}
async function markScanned(memberId: string): Promise<void> {
if (!hasDb) return;
await db().query(`update music_accounts set scanned_at=now() where member_id=$1`, [memberId]);
}

async function listTrackedArtists(memberId: string): Promise<TrackedArtist[]> {
if (!hasDb) return [];
await ready();
const r = await db().query(`select artist_id,name,image_url,source,excluded from tracked_artists where member_id=$1 order by name asc`, [memberId]);
return r.rows.map((x) => ({ id: x.artist_id, name: x.name, imageUrl: x.image_url, source: x.source, excluded: x.excluded }));
}
/* A scan is the full picture of who you follow, so it replaces the stored set —
   but exclusions are the member's own choice and are carried across. */
async function replaceTrackedArtists(memberId: string, artists: TrackedArtist[]): Promise<void> {
if (!hasDb) return;
await ready();
const prev = await listTrackedArtists(memberId);
const wasExcluded = new Set(prev.filter((a) => a.excluded).map((a) => a.id));
const c = await db().connect();
try {
await c.query("begin");
await c.query(`delete from tracked_artists where member_id=$1`, [memberId]);
for (const a of artists) {
await c.query(`insert into tracked_artists (member_id,artist_id,name,image_url,source,excluded) values ($1,$2,$3,$4,$5,$6) on conflict (member_id,artist_id) do nothing`,
[memberId, a.id, a.name, a.imageUrl, a.source, wasExcluded.has(a.id)]);
}
await c.query("commit");
} catch (e) {
await c.query("rollback");
throw e;
} finally {
c.release();
}
}
async function setArtistExcluded(memberId: string, artistId: string, excluded: boolean): Promise<void> {
if (!hasDb) return;
await ready();
await db().query(`update tracked_artists set excluded=$3 where member_id=$1 and artist_id=$2`, [memberId, artistId, excluded]);
}

async function listShortlist(memberId: string): Promise<ShortlistItem[]> {
if (!hasDb) return [];
await ready();
const r = await db().query(`select id,member_id,month,title,artist,release_date,art_url,spotify_url,source,added_at from shortlist where member_id=$1 order by added_at asc`, [memberId]);
return r.rows.map((x) => ({
id: x.id, memberId: x.member_id, month: x.month, title: x.title, artist: x.artist,
releaseDate: x.release_date, artUrl: x.art_url, spotifyUrl: x.spotify_url, source: x.source,
addedAt: new Date(x.added_at).toISOString(),
}));
}
async function addShortlist(item: ShortlistItem): Promise<void> {
if (!hasDb) return;
await ready();
await db().query(`insert into shortlist (id,member_id,month,title,artist,release_date,art_url,spotify_url,source) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (id) do nothing`,
[item.id, item.memberId, item.month, item.title, item.artist, item.releaseDate, item.artUrl, item.spotifyUrl, item.source]);
}
async function deleteShortlist(memberId: string, id: string): Promise<void> {
if (!hasDb) return;
await ready();
await db().query(`delete from shortlist where member_id=$1 and id=$2`, [memberId, id]);
}

/* Spotify tokens live here rather than in the browser, so a member's scan works
   from any device. Refreshing is done server-side and the fresh access token is
   handed to the client, which does the scanning itself (hundreds of paged calls
   would blow a serverless timeout). */
const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "857748a5334f4c79bdef21da5050714a";

async function spotifyAccessToken(memberId: string): Promise<string | null> {
const a = await getAccount(memberId);
if (!a) return null;
const stillGood = a.accessToken && a.expiresAt && new Date(a.expiresAt).getTime() - 60000 > Date.now();
if (stillGood) return a.accessToken;
if (!a.refreshToken) return null;
const res = await fetch("https://accounts.spotify.com/api/token", {
method: "POST",
headers: { "content-type": "application/x-www-form-urlencoded" },
body: new URLSearchParams({
grant_type: "refresh_token", refresh_token: a.refreshToken,
client_id: a.clientId || SPOTIFY_CLIENT_ID,
}),
signal: AbortSignal.timeout(12000),
});
if (!res.ok) throw new Error("Spotify needs reconnecting");
const d = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
if (!d.access_token) throw new Error("Spotify needs reconnecting");
await saveAccount({
memberId, service: "spotify", accessToken: d.access_token,
refreshToken: d.refresh_token ?? a.refreshToken,
expiresAt: new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString(),
clientId: a.clientId || SPOTIFY_CLIENT_ID, scannedAt: a.scannedAt, playlistIds: a.playlistIds,
});
return d.access_token;
}

/* YouTube. Google requires a client secret even for a browser PKCE flow, so the
   code exchange and every refresh happen here — the secret is server-only and
   never reaches the bundle. Asking for offline access gets us a refresh token,
   which the original app went without. */
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

async function googleTokenRequest(body: Record<string, string>) {
const res = await fetch(GOOGLE_TOKEN_URL, {
method: "POST",
headers: { "content-type": "application/x-www-form-urlencoded" },
body: new URLSearchParams({ ...body, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET }),
signal: AbortSignal.timeout(12000),
});
const d = (await res.json().catch(() => ({}))) as {
access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; error?: string;
};
if (!res.ok || !d.access_token) {
throw new Error(d.error_description || d.error || "Google wouldn't complete the sign-in");
}
return d;
}

async function youtubeAccessToken(memberId: string): Promise<string | null> {
const a = await getAccount(memberId);
if (!a || a.service !== "youtube") return null;
const stillGood = a.accessToken && a.expiresAt && new Date(a.expiresAt).getTime() - 60000 > Date.now();
if (stillGood) return a.accessToken;
if (!a.refreshToken) return null;
const d = await googleTokenRequest({ grant_type: "refresh_token", refresh_token: a.refreshToken });
await saveAccount({
memberId, service: "youtube", accessToken: d.access_token ?? null,
refreshToken: d.refresh_token ?? a.refreshToken,
expiresAt: new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString(),
clientId: GOOGLE_CLIENT_ID, scannedAt: a.scannedAt, playlistIds: a.playlistIds,
});
return d.access_token ?? null;
}

/* ---- session ---- */

const COOKIE = "ac_session";
const COOKIE_OPTS = {
httpOnly: true, sameSite: "lax" as const,
secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365,
};

async function getSecret(): Promise<string> {
if (!hasDb) return "preview-mode-secret";
if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
const s = await getSettings();
if (s.session_secret) return s.session_secret;
const secret = crypto.randomBytes(24).toString("hex");
await setSetting("session_secret", secret);
return secret;
}
function sign(value: string, secret: string): string {
const mac = crypto.createHmac("sha256", secret).update(value).digest("base64url");
return `${Buffer.from(value).toString("base64url")}.${mac}`;
}
function unsign(token: string, secret: string): string | null {
const i = token.lastIndexOf(".");
if (i <= 0) return null;
const value = Buffer.from(token.slice(0, i), "base64url").toString();
const a = Buffer.from(token.slice(i + 1));
const b = Buffer.from(crypto.createHmac("sha256", secret).update(value).digest("base64url"));
if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
return value;
}
async function clubConfigured(): Promise<boolean> {
if (!hasDb) return true;
const s = await getSettings();
/* passcode_hash is only ever read here, so a club set up before the passcode
   was removed stays set up instead of being sent back through first-run. */
return Boolean(s.configured || s.passcode_hash);
}
type Session = { authed: boolean; memberId: string | null; needsSetup: boolean };

/* No passcode: anyone who can reach the app is in. The cookie only remembers
   which member you picked, signed so it can't be edited by hand. */
async function readSession(): Promise<Session> {
const secret = await getSecret();
const jar = await cookies();
const raw = jar.get(COOKIE)?.value ?? "";
const memberId = raw ? unsign(raw, secret) : null;
if (!hasDb) return { authed: true, memberId: memberId || null, needsSetup: false };
if (!(await clubConfigured())) return { authed: false, memberId: null, needsSetup: true };
return { authed: true, memberId: memberId || null, needsSetup: false };
}
async function sessionToken(memberId: string | null): Promise<string> {
const secret = await getSecret();
return sign(memberId ?? "", secret);
}

/* ---- helpers ---- */

function slug(s: string): string {
return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "x";
}
function newId(p: string): string {
return `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
function currentMonth(): string {
const d = new Date();
return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function clampScore(v: unknown): number | null {
if (v === null || v === undefined || v === "") return null;
const n = Number(v);
if (!Number.isFinite(n)) return null;
return Math.round(Math.min(10, Math.max(0, n)) * 10) / 10;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ action?: string }> };
const route = async (c: Ctx) => (await c.params).action ?? "";
const J = (d: unknown, s = 200) => NextResponse.json(d, { status: s });
const bad = (m: string, s = 400) => NextResponse.json({ error: m }, { status: s });
const PALETTE = ["#e0b25c", "#e4715a", "#5fb3a1", "#a98bd8", "#6f9ce0", "#d4886f"];
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const str = (v: unknown): string | null => {
const s = v === null || v === undefined ? "" : String(v).trim();
return s ? s : null;
};

async function requireMember() {
const s = await readSession();
if (!s.authed) return { ok: false as const, res: bad("Not signed in", 401) };
if (!s.memberId) return { ok: false as const, res: bad("Pick who you are first", 403) };
return { ok: true as const, memberId: s.memberId };
}

async function clubData() {
const [settings, albums, ratings] = await Promise.all([
getSettings(), listAlbums(), listRatings(),
]);
return { settings, albums, ratings };
}

const csvCell = (v: unknown) => {
const s = v === null || v === undefined ? "" : String(v);
return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest, ctx: Ctx) {
const r = await route(ctx);

if (r === "state") {
const session = await readSession();
if (session.needsSetup) return J({ ok: false, needsSetup: true, mode: "live" });
try {
const { settings, albums, ratings } = await clubData();
return J({
ok: true, mode: hasDb ? "live" : "preview", me: session.memberId,
members: await listMembers(), albums, ratings,
clubName: settings.club_name || "Album Club",
currentMonth: currentMonth(),
});
} catch (err) {
return J({
ok: false, dbError: true,
message: err instanceof Error ? err.message : "Could not reach the database",
});
}
}

if (r === "search") {
const s = await readSession();
if (!s.authed) return bad("Not signed in", 401);
const q = req.nextUrl.searchParams.get("q");
const tracksFor = req.nextUrl.searchParams.get("tracks");
try {
if (tracksFor) {
const u = `https://itunes.apple.com/lookup?id=${encodeURIComponent(tracksFor)}&entity=song&limit=200&country=GB`;
const res = await fetch(u, { signal: AbortSignal.timeout(9000), cache: "no-store" });
if (!res.ok) return J({ ok: true, tracks: [] });
const d = (await res.json()) as { results?: Record<string, unknown>[] };
const tracks = (d.results ?? [])
.filter((t) => t.wrapperType === "track" && t.trackName)
.sort(
(a, b) =>
(Number(a.discNumber) || 1) - (Number(b.discNumber) || 1) ||
(Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0),
)
.map((t) => String(t.trackName));
return J({ ok: true, tracks });
}
if (!q || q.trim().length < 2) return J({ ok: true, results: [] });
const u = `https://itunes.apple.com/search?term=${encodeURIComponent(q.trim())}&entity=album&limit=8&country=GB`;
const res = await fetch(u, { signal: AbortSignal.timeout(9000), cache: "no-store" });
if (!res.ok) return J({ ok: true, results: [], warning: "Lookup unavailable" });
const d = (await res.json()) as { results?: Record<string, unknown>[] };
return J({
ok: true,
results: (d.results ?? []).map((a) => ({
sourceId: String(a.collectionId),
title: String(a.collectionName ?? ""),
artist: String(a.artistName ?? ""),
year: a.releaseDate ? new Date(String(a.releaseDate)).getUTCFullYear() : null,
artUrl: a.artworkUrl100
? String(a.artworkUrl100).replace(/\/\d+x\d+bb\.(jpg|png)$/, "/600x600bb.$1")
: null,
appleUrl: a.collectionViewUrl ? String(a.collectionViewUrl).split("?")[0] : null,
trackCount: a.trackCount ? Number(a.trackCount) : null,
})),
});
} catch {
return J({
ok: true, results: [], tracks: [],
warning: "Couldn't reach the album lookup — you can still type it in by hand.",
});
}
}

if (r === "upcoming") {
const auth = await requireMember();
if (!auth.ok) return auth.res;
const [account, artists, shortlist] = await Promise.all([
getAccount(auth.memberId), listTrackedArtists(auth.memberId), listShortlist(auth.memberId),
]);
return J({
ok: true,
connected: Boolean(account?.refreshToken ?? account?.accessToken),
service: account?.service ?? null, scannedAt: account?.scannedAt ?? null,
playlistIds: account?.playlistIds ?? [],
artists, shortlist,
});
}

if (r === "spotify") {
const auth = await requireMember();
if (!auth.ok) return auth.res;
try {
const token = await spotifyAccessToken(auth.memberId);
if (!token) return J({ ok: false, connected: false });
return J({ ok: true, connected: true, accessToken: token, clientId: SPOTIFY_CLIENT_ID });
} catch (err) {
return J({ ok: false, connected: false, message: err instanceof Error ? err.message : "Spotify needs reconnecting" });
}
}

if (r === "youtube") {
const auth = await requireMember();
if (!auth.ok) return auth.res;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
return J({ ok: false, connected: false, unconfigured: true, message: "YouTube isn't set up on this deployment yet." });
}
try {
const token = await youtubeAccessToken(auth.memberId);
if (!token) return J({ ok: false, connected: false });
return J({ ok: true, connected: true, accessToken: token });
} catch (err) {
return J({ ok: false, connected: false, message: err instanceof Error ? err.message : "YouTube needs reconnecting" });
}
}

if (r === "export") {
const session = await readSession();
if (!session.authed) return bad("Not signed in", 401);
const { settings, albums, ratings } = await clubData();
const members = await listMembers();
const visible = ratings;
const clubName = settings.club_name || "Album Club";
const base = `${clubName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}`;

if ((req.nextUrl.searchParams.get("format") ?? "json").toLowerCase() === "csv") {
const nameOf = new Map(members.map((m) => [m.id, m.name]));
const rows = [
"month,artist,album,year,chosen_by,reviewer,score,review,favourite_tracks,spotify,youtube_music,artwork",
];
for (const a of [...albums].sort((x, y) => (x.month < y.month ? 1 : -1))) {
const rs = visible.filter((x) => x.albumId === a.id);
for (const rr of rs.length ? rs : [null]) {
rows.push(
[
a.month, a.artist, a.title, a.year ?? "",
a.chosenBy ? (nameOf.get(a.chosenBy) ?? a.chosenBy) : "",
rr ? (nameOf.get(rr.memberId) ?? rr.memberId) : "",
rr?.score ?? "", rr?.review ?? "", rr ? rr.favTracks.join(" | ") : "",
a.spotifyUrl ?? "", a.ytmUrl ?? "", a.artUrl ?? "",
].map(csvCell).join(","),
);
}
}
return new NextResponse(rows.join("\n"), {
headers: {
"content-type": "text/csv; charset=utf-8",
"content-disposition": `attachment; filename="${base}.csv"`,
},
});
}
return new NextResponse(
JSON.stringify(
{ exportedAt: new Date().toISOString(), club: clubName, schema: 1, members, albums, ratings: visible },
null, 2,
),
{
headers: {
"content-type": "application/json; charset=utf-8",
"content-disposition": `attachment; filename="${base}.json"`,
},
},
);
}

return bad("Not found", 404);
}

export async function POST(req: NextRequest, ctx: Ctx) {
const r = await route(ctx);
const b = await req.json().catch(() => ({}) as Record<string, unknown>);

if (r === "me") {
const s = await readSession();
if (!s.authed) return bad("Not signed in", 401);
const memberId = b.memberId ? String(b.memberId) : null;
if (memberId && !(await listMembers()).some((m) => m.id === memberId))
return bad("Unknown member");
const res = NextResponse.json({ ok: true, me: memberId });
res.cookies.set(COOKIE, await sessionToken(memberId), COOKIE_OPTS);
return res;
}

if (r === "setup") {
if (!hasDb) return bad("No database attached yet", 409);
if (await clubConfigured()) return bad("This club is already set up", 409);
const names: string[] = Array.isArray(b.members)
? (b.members as unknown[]).map((n) => String(n).trim()).filter(Boolean)
: [];
if (!names.length) return bad("Add at least one member");
await setSetting("club_name", String(b.clubName ?? "Album Club").trim() || "Album Club");
const used = new Set<string>();
let i = 0;
for (const name of names) {
let id = slug(name);
while (used.has(id)) id = `${id}-${i}`;
used.add(id);
await saveMember({ id, name, color: PALETTE[i % PALETTE.length], sortOrder: i });
i += 1;
}
await setSetting("configured", "1");
const res = NextResponse.json({ ok: true });
res.cookies.set(COOKIE, await sessionToken(null), COOKIE_OPTS);
return res;
}

const auth = await requireMember();
if (!auth.ok) return auth.res;

if (r === "spotify") {
const accessToken = str(b.accessToken);
if (!accessToken) return bad("Missing access token");
const expiresIn = Number(b.expiresIn);
await saveAccount({
memberId: auth.memberId, service: "spotify", accessToken,
refreshToken: str(b.refreshToken),
expiresAt: new Date(Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000).toISOString(),
clientId: str(b.clientId) ?? SPOTIFY_CLIENT_ID, scannedAt: null, playlistIds: [],
});
return J({ ok: true });
}

if (r === "youtube") {
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
return bad("YouTube isn't set up on this deployment — GOOGLE_CLIENT_SECRET and NEXT_PUBLIC_GOOGLE_CLIENT_ID are missing.", 501);
}
const code = str(b.code);
const verifier = str(b.codeVerifier);
const redirect = str(b.redirectUri);
if (!code || !verifier || !redirect) return bad("Missing sign-in details");
try {
const d = await googleTokenRequest({
grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirect,
});
await saveAccount({
memberId: auth.memberId, service: "youtube", accessToken: d.access_token ?? null,
refreshToken: d.refresh_token ?? null,
expiresAt: new Date(Date.now() + (d.expires_in ?? 3600) * 1000).toISOString(),
clientId: GOOGLE_CLIENT_ID, scannedAt: null, playlistIds: [],
});
return J({ ok: true });
} catch (err) {
return bad(err instanceof Error ? err.message : "Google sign-in failed", 400);
}
}

if (r === "upcoming") {
const raw = Array.isArray(b.artists) ? (b.artists as Record<string, unknown>[]) : [];
const seen = new Set<string>();
const artists: TrackedArtist[] = [];
for (const x of raw) {
const id = str(x.id);
const name = str(x.name);
if (!id || !name || seen.has(id)) continue;
seen.add(id);
artists.push({ id, name, imageUrl: str(x.imageUrl), source: str(x.source) ?? "spotify", excluded: false });
}
if (!artists.length) return bad("No artists to save");
if (Array.isArray(b.playlistIds)) {
await savePlaylistIds(auth.memberId, (b.playlistIds as unknown[]).map(String));
}
await replaceTrackedArtists(auth.memberId, artists);
await markScanned(auth.memberId);
return J({ ok: true, artists: await listTrackedArtists(auth.memberId) });
}

if (r === "shortlist") {
/* Promoting turns a shortlisted release into this member's pick for the month. */
const promote = str(b.promote);
if (promote) {
const item = (await listShortlist(auth.memberId)).find((x) => x.id === promote);
if (!item) return bad("Not on your shortlist", 404);
const month = str(b.month) ?? item.month;
if (!MONTH_RE.test(month)) return bad("Bad month");
const year = item.releaseDate ? Number(item.releaseDate.slice(0, 4)) : NaN;
const album: Album = {
id: newId("alb"), month, title: item.title, artist: item.artist,
year: Number.isFinite(year) && year > 1900 ? year : null,
chosenBy: auth.memberId, artUrl: item.artUrl, spotifyUrl: item.spotifyUrl,
ytmUrl: null, appleUrl: null, tracks: [], createdAt: new Date().toISOString(),
};
await saveAlbum(album);
await deleteShortlist(auth.memberId, item.id);
return J({ ok: true, album });
}
const title = str(b.title);
const artist = str(b.artist);
if (!title || !artist) return bad("Needs a title and an artist");
const month = str(b.month) ?? currentMonth();
if (!MONTH_RE.test(month)) return bad("Bad month");
const item: ShortlistItem = {
id: str(b.id) ?? newId("sl"), memberId: auth.memberId, month, title, artist,
releaseDate: str(b.releaseDate), artUrl: str(b.artUrl), spotifyUrl: str(b.spotifyUrl),
source: str(b.source), addedAt: new Date().toISOString(),
};
await addShortlist(item);
return J({ ok: true, shortlist: await listShortlist(auth.memberId) });
}

if (r === "albums") {
const title = str(b.title);
const artist = str(b.artist);
if (!title || !artist) return bad("An album needs a title and an artist");
const month = str(b.month) ?? currentMonth();
if (!MONTH_RE.test(month)) return bad("Bad month");
const y = Number(b.year);
const album: Album = {
id: newId("alb"), month, title, artist,
year: Number.isFinite(y) && y > 1900 ? Math.trunc(y) : null,
chosenBy: str(b.chosenBy) ?? auth.memberId,
artUrl: str(b.artUrl), spotifyUrl: str(b.spotifyUrl),
ytmUrl: str(b.ytmUrl), appleUrl: str(b.appleUrl),
tracks: Array.isArray(b.tracks)
? (b.tracks as unknown[]).map(String).filter(Boolean).slice(0, 60)
: [],
createdAt: new Date().toISOString(),
};
await saveAlbum(album);
return J({ ok: true, album });
}

if (r === "members") {
if (typeof b.clubName === "string")
await setSetting("club_name", b.clubName.trim().slice(0, 60) || "Album Club");
const members = await listMembers();
if (typeof b.name === "string" && b.name.trim()) {
const name = b.name.trim().slice(0, 40);
if (b.id) {
const ex = members.find((m) => m.id === String(b.id));
if (!ex) return bad("No such member", 404);
await saveMember({ ...ex, name, color: typeof b.color === "string" ? b.color : ex.color });
} else {
let id = slug(name);
let n = 2;
while (members.some((m) => m.id === id)) id = `${slug(name)}-${n++}`;
await saveMember({
id, name,
color: typeof b.color === "string" ? b.color : PALETTE[members.length % PALETTE.length],
sortOrder: members.length,
});
}
}
return J({ ok: true, members: await listMembers() });
}

return bad("Not found", 404);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
if ((await route(ctx)) !== "ratings") return bad("Not found", 404);
const auth = await requireMember();
if (!auth.ok) return auth.res;
const b = await req.json().catch(() => ({}) as Record<string, unknown>);
const albumId = String(b.albumId ?? "");
if (!albumId) return bad("Missing album id");
if (!(await listAlbums()).some((a) => a.id === albumId)) return bad("No such album", 404);
const rating = {
albumId, memberId: auth.memberId, score: clampScore(b.score),
review: String(b.review ?? "").slice(0, 6000),
favTracks: Array.isArray(b.favTracks)
? (b.favTracks as unknown[]).map((t) => String(t).slice(0, 200)).filter(Boolean).slice(0, 20)
: [],
updatedAt: new Date().toISOString(),
};
await saveRating(rating);
return J({ ok: true, rating });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
const rr = await route(ctx);
if (rr !== "albums" && rr !== "upcoming") return bad("Not found", 404);
const auth = await requireMember();
if (!auth.ok) return auth.res;
const b = await req.json().catch(() => ({}) as Record<string, unknown>);
if (rr === "upcoming") {
const artistId = str(b.artistId);
if (!artistId) return bad("Missing artist id");
await setArtistExcluded(auth.memberId, artistId, Boolean(b.excluded));
return J({ ok: true, artists: await listTrackedArtists(auth.memberId) });
}
const id = str(b.id);
if (!id) return bad("Missing album id");
const ex = (await listAlbums()).find((a) => a.id === id);
if (!ex) return bad("No such album", 404);
const month = b.month === undefined ? ex.month : String(b.month);
if (!MONTH_RE.test(month)) return bad("Bad month");
const next: Album = {
...ex, month,
title: b.title === undefined ? ex.title : (str(b.title) ?? ex.title),
artist: b.artist === undefined ? ex.artist : (str(b.artist) ?? ex.artist),
year:
b.year === undefined
? ex.year
: Number.isFinite(Number(b.year)) && Number(b.year) > 1900
? Math.trunc(Number(b.year))
: null,
chosenBy: b.chosenBy === undefined ? ex.chosenBy : str(b.chosenBy),
artUrl: b.artUrl === undefined ? ex.artUrl : str(b.artUrl),
spotifyUrl: b.spotifyUrl === undefined ? ex.spotifyUrl : str(b.spotifyUrl),
ytmUrl: b.ytmUrl === undefined ? ex.ytmUrl : str(b.ytmUrl),
appleUrl: b.appleUrl === undefined ? ex.appleUrl : str(b.appleUrl),
tracks: Array.isArray(b.tracks)
? (b.tracks as unknown[]).map(String).filter(Boolean).slice(0, 60)
: ex.tracks,
};
await saveAlbum(next);
return J({ ok: true, album: next });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
const r = await route(ctx);
const auth = await requireMember();
if (!auth.ok) return auth.res;

if (r === "spotify" || r === "youtube") {
await deleteAccount(auth.memberId);
return J({ ok: true });
}

const id = req.nextUrl.searchParams.get("id");
if (!id) return bad("Missing id");

if (r === "shortlist") {
await deleteShortlist(auth.memberId, id);
return J({ ok: true, shortlist: await listShortlist(auth.memberId) });
}

if (r === "albums") {
await deleteAlbum(id);
return J({ ok: true });
}
if (r === "members") {
const [albums, ratings] = await Promise.all([listAlbums(), listRatings()]);
if (albums.some((a) => a.chosenBy === id) || ratings.some((x) => x.memberId === id))
return bad("That member has picks or reviews on record — rename them instead of deleting, so the history stays intact.");
await deleteMember(id);
return J({ ok: true, members: await listMembers() });
}
return bad("Not found", 404);
}
