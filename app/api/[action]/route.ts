import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { PALETTE } from "../../lib/accent";

/* Album Club — the whole server side: database, sessions and every endpoint.
   Kept in one file so the project stays at four files total. */

type Member = { id: string; name: string; color: string; sortOrder: number };
type Album = {
id: string; month: string; title: string; artist: string; year: number | null;
chosenBy: string | null; artUrl: string | null; spotifyUrl: string | null;
ytmUrl: string | null; appleUrl: string | null; tracks: string[]; createdAt: string;
releaseDate: string | null;
};
type Rating = {
albumId: string; memberId: string; score: number | null; review: string;
favTracks: string[]; skipped: boolean; updatedAt: string;
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
/* Scanning is slow — hundreds of Spotify calls and MusicBrainz's one-per-second
   ceiling — so what a scan finds is kept and the tab paints from here. sort_date
   is the release date resolved to a real day (a month-precision date becomes the
   1st), which is what windowing and pruning need; "upcoming" is never stored,
   because it is only ever true until the date passes. */
await p.query(`create table if not exists releases (member_id text not null, id text not null, title text not null, artist text not null, artist_ids text not null default '[]', release_date text not null, sort_date date not null, precision text not null default 'day', album_type text not null default 'album', art_url text, url text, source text not null default 'spotify', seen_at timestamptz not null default now(), primary key (member_id, id))`);
await p.query(`create index if not exists releases_member_date_idx on releases(member_id, sort_date)`);
/* Added after the table shipped, so it has to be an alter rather than part of the create. */
await p.query(`alter table music_accounts add column if not exists playlist_ids text not null default '[]'`);
/* When releases were last looked for, as against scanned_at, which is when the
   artist list itself was last rebuilt from the account. */
await p.query(`alter table music_accounts add column if not exists refreshed_at timestamptz`);
/* "Skipped" is a third state, distinct from an unscored album nobody has got
   to yet — it says the listener made a decision, so stop nagging them. */
await p.query(`alter table ratings add column if not exists skipped boolean not null default false`);
/* So the club can tell an album that is out from one that only will be. ISO,
   either a full day or a bare month when that is all anyone knows. */
await p.query(`alter table albums add column if not exists release_date text`);
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
createdAt: "2026-01-01T00:00:00.000Z", releaseDate: "2007-11-05" },
{ id: "p2", month: nowMonth(), title: "Promises", artist: "Floating Points, Pharoah Sanders & the LSO", year: 2021, chosenBy: "oli",
artUrl: art("Music126/v4/af/dc/6b/afdc6b88-b275-de4e-3098-63dff171dffb/680899009720.jpg"),
spotifyUrl: null, ytmUrl: null, appleUrl: "https://music.apple.com/gb/album/promises/1550697816",
tracks: ["Movement 1", "Movement 2", "Movement 3", "Movement 4", "Movement 5", "Movement 6", "Movement 7", "Movement 8", "Movement 9"],
createdAt: "2026-01-01T00:00:01.000Z", releaseDate: "2021-03-26" },
{ id: "p3", month: nowMonth(), title: "Honey", artist: "Caribou", year: 2024, chosenBy: "flik",
artUrl: art("Music211/v4/84/03/99/84039972-0b74-d18d-f268-23ce3e1d9cf2/57426.jpg"),
spotifyUrl: null, ytmUrl: null, appleUrl: "https://music.apple.com/gb/album/honey/1839200694",
tracks: ["Broke My Heart", "Volume", "Honey", "Campfire", "Come Find Me", "Climbing", "Got To Change", "Over Now"],
createdAt: "2026-01-01T00:00:02.000Z", releaseDate: "2024-10-04" },
];
const P_RAT: Rating[] = [
{ albumId: "p1", memberId: "oli", skipped: false, score: 9.1, review: "Still sounds like it was recorded through a night bus window. Nothing else gets this much feeling out of so little.", favTracks: ["Archangel", "Shell of Light"], updatedAt: "2026-01-02T00:00:00.000Z" },
{ albumId: "p1", memberId: "flik", skipped: false, score: 8.4, review: "Beautiful, but I need a lie down afterwards.", favTracks: ["Near Dark"], updatedAt: "2026-01-02T00:00:00.000Z" },
{ albumId: "p2", memberId: "will", skipped: false, score: 8.8, review: "One motif for 46 minutes and it never wears out. The strings arriving properly got me.", favTracks: ["Movement 6"], updatedAt: "2026-01-02T00:00:00.000Z" },
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
const r = await db().query(`select id,month,title,artist,year,chosen_by,art_url,spotify_url,ytm_url,apple_url,tracks,created_at,release_date from albums order by month desc, created_at asc`);
return r.rows.map((x) => ({
id: x.id, month: x.month, title: x.title, artist: x.artist,
year: x.year === null ? null : Number(x.year), chosenBy: x.chosen_by,
artUrl: x.art_url, spotifyUrl: x.spotify_url, ytmUrl: x.ytm_url, appleUrl: x.apple_url,
tracks: parseList(x.tracks), createdAt: new Date(x.created_at).toISOString(),
releaseDate: x.release_date ?? null,
}));
}
async function saveAlbum(a: Album): Promise<void> {
if (!hasDb) {
const i = pv.albums.findIndex((x) => x.id === a.id);
if (i >= 0) pv.albums[i] = a; else pv.albums.push(a);
return;
}
await ready();
await db().query(`insert into albums (id,month,title,artist,year,chosen_by,art_url,spotify_url,ytm_url,apple_url,tracks,release_date) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (id) do update set month=excluded.month,title=excluded.title,artist=excluded.artist,year=excluded.year,chosen_by=excluded.chosen_by,art_url=excluded.art_url,spotify_url=excluded.spotify_url,ytm_url=excluded.ytm_url,apple_url=excluded.apple_url,tracks=excluded.tracks,release_date=excluded.release_date`,
[a.id, a.month, a.title, a.artist, a.year, a.chosenBy, a.artUrl, a.spotifyUrl, a.ytmUrl, a.appleUrl, JSON.stringify(a.tracks ?? []), a.releaseDate]);
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
/* Swapping one record for another leaves any scores on it attached to
   something nobody heard. */
async function clearRatingsFor(albumId: string): Promise<void> {
if (!hasDb) { pv.ratings = pv.ratings.filter((r) => r.albumId !== albumId); return; }
await ready();
await db().query(`delete from ratings where album_id=$1`, [albumId]);
}
async function listRatings(): Promise<Rating[]> {
if (!hasDb) return [...pv.ratings];
await ready();
const r = await db().query(`select album_id,member_id,score,review,fav_tracks,skipped,updated_at from ratings`);
return r.rows.map((x) => ({
albumId: x.album_id, memberId: x.member_id,
score: x.score === null ? null : Number(x.score),
review: x.review ?? "", favTracks: parseList(x.fav_tracks),
skipped: Boolean(x.skipped),
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
await db().query(`insert into ratings (album_id,member_id,score,review,fav_tracks,skipped,updated_at) values ($1,$2,$3,$4,$5,$6,now()) on conflict (album_id,member_id) do update set score=excluded.score,review=excluded.review,fav_tracks=excluded.fav_tracks,skipped=excluded.skipped,updated_at=now()`,
[r.albumId, r.memberId, r.score, r.review, JSON.stringify(r.favTracks ?? []), r.skipped]);
}

/* ---- upcoming: accounts, tracked artists, shortlist ---- */

type Account = {
memberId: string; service: string; accessToken: string | null; refreshToken: string | null;
expiresAt: string | null; clientId: string | null; scannedAt: string | null; playlistIds: string[];
refreshedAt?: string | null;
};
type TrackedArtist = { id: string; name: string; imageUrl: string | null; source: string; excluded: boolean };
type ShortlistItem = {
id: string; memberId: string; month: string; title: string; artist: string;
releaseDate: string | null; artUrl: string | null; spotifyUrl: string | null; source: string | null; addedAt: string;
};

async function getAccount(memberId: string): Promise<Account | null> {
if (!hasDb) return null;
await ready();
const r = await db().query(`select member_id,service,access_token,refresh_token,expires_at,client_id,scanned_at,refreshed_at,playlist_ids from music_accounts where member_id=$1`, [memberId]);
const x = r.rows[0];
if (!x) return null;
return {
memberId: x.member_id, service: x.service, accessToken: x.access_token, refreshToken: x.refresh_token,
expiresAt: x.expires_at ? new Date(x.expires_at).toISOString() : null,
clientId: x.client_id, scannedAt: x.scanned_at ? new Date(x.scanned_at).toISOString() : null,
refreshedAt: x.refreshed_at ? new Date(x.refreshed_at).toISOString() : null,
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
await db().query(`delete from releases where member_id=$1`, [memberId]);
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

/* How far back a release stays worth showing. Matches the window the Spotify
   scan itself pulls, so the stored set and a fresh scan agree. */
const RELEASE_WINDOW_DAYS = 180;
const windowStart = () =>
new Date(Date.now() - RELEASE_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

type StoredRelease = {
id: string; title: string; artist: string; artistIds: string[];
releaseDate: string; sortDate: string; precision: string; albumType: string;
artUrl: string | null; url: string | null; source: string;
};

async function listReleases(memberId: string): Promise<StoredRelease[]> {
if (!hasDb) return [];
await ready();
const r = await db().query(
`select id,title,artist,artist_ids,release_date,to_char(sort_date,'YYYY-MM-DD') as sort_date,
        precision,album_type,art_url,url,source
 from releases where member_id=$1 and sort_date >= $2 order by sort_date asc`,
[memberId, windowStart()],
);
return r.rows.map((x) => ({
id: x.id, title: x.title, artist: x.artist, artistIds: parseList(x.artist_ids),
releaseDate: x.release_date, sortDate: x.sort_date,
precision: x.precision, albumType: x.album_type,
artUrl: x.art_url, url: x.url, source: x.source,
}));
}

/* A scan is a top-up, not a replacement: it only ever looks forward from the
   last one, so whatever it does not mention is still good. */
async function saveReleases(memberId: string, items: StoredRelease[]): Promise<void> {
if (!hasDb || !items.length) return;
await ready();
const cols = 12;
const values: unknown[] = [];
const rows: string[] = [];
items.forEach((it, i) => {
rows.push(`(${Array.from({ length: cols }, (_, c) => `$${i * cols + c + 1}`).join(",")})`);
values.push(memberId, it.id, it.title, it.artist, JSON.stringify(it.artistIds),
it.releaseDate, it.sortDate, it.precision, it.albumType, it.artUrl, it.url, it.source);
});
await db().query(
`insert into releases (member_id,id,title,artist,artist_ids,release_date,sort_date,precision,album_type,art_url,url,source)
 values ${rows.join(",")}
 on conflict (member_id, id) do update set
   title=excluded.title, artist=excluded.artist, artist_ids=excluded.artist_ids,
   release_date=excluded.release_date, sort_date=excluded.sort_date,
   precision=excluded.precision, album_type=excluded.album_type,
   art_url=excluded.art_url, url=excluded.url, source=excluded.source, seen_at=now()`,
values,
);
}

async function clearReleases(memberId: string): Promise<void> {
if (!hasDb) return;
await ready();
await db().query(`delete from releases where member_id=$1`, [memberId]);
await db().query(`update music_accounts set refreshed_at=null where member_id=$1`, [memberId]);
}
async function pruneReleases(memberId: string): Promise<void> {
if (!hasDb) return;
await db().query(`delete from releases where member_id=$1 and sort_date < $2`, [memberId, windowStart()]);
}
async function markRefreshed(memberId: string): Promise<void> {
if (!hasDb) return;
await db().query(`update music_accounts set refreshed_at=now() where member_id=$1`, [memberId]);
}

async function listTrackedArtists(memberId: string): Promise<TrackedArtist[]> {
if (!hasDb) return [];
await ready();
const r = await db().query(`select artist_id,name,image_url,source,excluded from tracked_artists where member_id=$1 order by name asc`, [memberId]);
return r.rows.map((x) => ({ id: x.artist_id, name: x.name, imageUrl: x.image_url, source: x.source, excluded: x.excluded }));
}
/* A scan is the full picture of who you follow, so it replaces the stored set —
   but exclusions are the member's own choice and are carried across. */
/* A scan that did not get all the way through is still worth keeping, but it
   cannot say who has been unfollowed — so it adds and never removes. Run it
   again and it picks up where it left off. */
async function mergeTrackedArtists(memberId: string, artists: TrackedArtist[]): Promise<void> {
if (!hasDb) return;
await ready();
const c = await db().connect();
try {
await c.query("begin");
for (const a of artists) {
await c.query(`insert into tracked_artists (member_id,artist_id,name,image_url,source,excluded) values ($1,$2,$3,$4,$5,false) on conflict (member_id,artist_id) do update set name=excluded.name, image_url=excluded.image_url`,
[memberId, a.id, a.name, a.imageUrl, a.source]);
}
await c.query("commit");
} catch (e) {
await c.query("rollback");
throw e;
} finally {
c.release();
}
}
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
/* Everything Upcoming knows about one member, so they can start it again from
   nothing. The shortlist is theirs whether or not the scan was any good, so it
   only goes when they say so. */
async function clearUpcoming(memberId: string, alsoShortlist: boolean): Promise<void> {
if (!hasDb) return;
await ready();
await db().query(`delete from music_accounts where member_id=$1`, [memberId]);
await db().query(`delete from tracked_artists where member_id=$1`, [memberId]);
await db().query(`delete from releases where member_id=$1`, [memberId]);
if (alsoShortlist) await db().query(`delete from shortlist where member_id=$1`, [memberId]);
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

/* ---- admin ---- */

/* The code lives in the environment, never in the bundle or the repository —
   this repo is public. Unset means admin is simply off. It is a guard against
   fat fingers, not an attacker: anyone with the link can already score as
   anyone, so this only gates editing *other* people's entries. */
const ADMIN_CODE = (process.env.ADMIN_CODE ?? "").trim();
const ADMIN_COOKIE = "ac_admin";

function adminStamp(secret: string): string {
return crypto.createHmac("sha256", secret).update("admin:" + ADMIN_CODE).digest("hex").slice(0, 16);
}
async function isAdmin(): Promise<boolean> {
if (!ADMIN_CODE) return false;
const secret = await getSecret();
const jar = await cookies();
const raw = jar.get(ADMIN_COOKIE)?.value ?? "";
if (!raw) return false;
/* Deriving the stamp from the code means changing the code in Vercel signs
   every existing admin session out. */
return unsign(raw, secret) === adminStamp(secret);
}
function codeMatches(given: string): boolean {
const a = Buffer.from(given);
const b = Buffer.from(ADMIN_CODE);
return a.length === b.length && crypto.timingSafeEqual(a, b);
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

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const RELEASE_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

/* A record can be picked for the month it lands in even if that is a fortnight
   away — everyone still has the rest of the month to hear it. One that does not
   arrive until after the month is over cannot be scored by anybody, so it is
   turned away. Anything already out is fine, however old it is. */
function releaseTooLate(releaseDate: string | null, month: string): boolean {
if (!releaseDate || !RELEASE_RE.test(releaseDate)) return false;
return releaseDate.slice(0, 7) > month;
}
const releaseLabel = (d: string) =>
new Date(`${d.length === 7 ? `${d}-01` : d}T00:00:00Z`).toLocaleDateString("en-GB", {
day: d.length === 7 ? undefined : "numeric", month: "long", year: "numeric", timeZone: "UTC",
});
const monthName = (m: string) =>
new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
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
/* The nudge to pick offers this member's own shortlist as one-click picks. */
myShortlist: session.memberId ? await listShortlist(session.memberId) : [],
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
/* Picking artwork by eye wants a wider net than filling in a new album does. */
const want = Number(req.nextUrl.searchParams.get("limit"));
const limit = Number.isFinite(want) ? Math.min(Math.max(Math.trunc(want), 1), 24) : 8;
const u = `https://itunes.apple.com/search?term=${encodeURIComponent(q.trim())}&entity=album&limit=${limit}&country=GB`;
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
releaseDate: a.releaseDate ? String(a.releaseDate).slice(0, 10) : null,
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

if (r === "admin") {
return J({ ok: true, configured: Boolean(ADMIN_CODE), unlocked: await isAdmin() });
}

if (r === "palette") return J({ ok: true, palette: PALETTE });

if (r === "upcoming") {
const auth = await requireMember();
if (!auth.ok) return auth.res;
const [account, artists, shortlist, releases] = await Promise.all([
getAccount(auth.memberId), listTrackedArtists(auth.memberId),
listShortlist(auth.memberId), listReleases(auth.memberId),
]);
return J({
ok: true,
connected: Boolean(account?.refreshToken ?? account?.accessToken),
service: account?.service ?? null, scannedAt: account?.scannedAt ?? null,
refreshedAt: account?.refreshedAt ?? null,
playlistIds: account?.playlistIds ?? [],
artists, shortlist, releases,
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

if (r === "admin") {
if (!ADMIN_CODE) return bad("Admin isn't switched on for this deployment yet.", 501);
const code = String(b.code ?? "").trim();
if (!code || !codeMatches(code)) {
/* A four-digit code is 10,000 guesses; make each one cost something. */
await new Promise((res) => setTimeout(res, 700));
return bad("That code doesn't match", 401);
}
const secret = await getSecret();
const res = NextResponse.json({ ok: true });
res.cookies.set(ADMIN_COOKIE, sign(adminStamp(secret), secret), COOKIE_OPTS);
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
if (b.merge === true) {
/* Partial: top up the list and leave everything else alone, releases
   included — they still belong to artists that are still tracked. */
await mergeTrackedArtists(auth.memberId, artists);
} else {
await replaceTrackedArtists(auth.memberId, artists);
/* The artist list has been rebuilt, so anything on file could belong to
   somebody no longer followed. The scan that follows repopulates it. */
await clearReleases(auth.memberId);
}
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
if (releaseTooLate(item.releaseDate, month))
return bad(`${item.title} isn't out until ${releaseLabel(item.releaseDate!)}. It can be your pick for ${monthName(item.releaseDate!.slice(0, 7))}, but not ${monthName(month)}.`);
const album: Album = {
id: newId("alb"), month, title: item.title, artist: item.artist,
year: Number.isFinite(year) && year > 1900 ? year : null,
chosenBy: auth.memberId, artUrl: item.artUrl, spotifyUrl: item.spotifyUrl,
ytmUrl: null, appleUrl: null, tracks: [], createdAt: new Date().toISOString(),
releaseDate: item.releaseDate,
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
const releaseDate = str(b.releaseDate);
const releaseYear = releaseDate && RELEASE_RE.test(releaseDate) ? Number(releaseDate.slice(0, 4)) : NaN;
if (releaseDate && !RELEASE_RE.test(releaseDate)) return bad("Release date should look like 2026-09-18");
if (releaseTooLate(releaseDate, month))
return bad(`${title} isn't out until ${releaseLabel(releaseDate!)}, so nobody could score it in ${monthName(month)}. Put it in ${monthName(releaseDate!.slice(0, 7))} instead.`);
const album: Album = {
id: newId("alb"), month, title, artist,
year: Number.isFinite(y) && y > 1900 ? Math.trunc(y)
: Number.isFinite(releaseYear) && releaseYear > 1900 ? releaseYear : null,
chosenBy: str(b.chosenBy) ?? auth.memberId,
artUrl: str(b.artUrl), spotifyUrl: str(b.spotifyUrl),
ytmUrl: str(b.ytmUrl), appleUrl: str(b.appleUrl),
tracks: Array.isArray(b.tracks)
? (b.tracks as unknown[]).map(String).filter(Boolean).slice(0, 60)
: [],
createdAt: new Date().toISOString(),
releaseDate,
};
await saveAlbum(album);
return J({ ok: true, album });
}

if (r === "members") {
if (typeof b.clubName === "string")
await setSetting("club_name", b.clubName.trim().slice(0, 60) || "Album Club");
const members = await listMembers();

/* Picking a colour doesn't come with a name, so it gets its own path. */
const wantColour = str(b.color);
if (b.id && wantColour && typeof b.name !== "string") {
const ex = members.find((m) => m.id === String(b.id));
if (!ex) return bad("No such member", 404);
if (!PALETTE.includes(wantColour)) return bad("That isn't one of the club colours");
await saveMember({ ...ex, color: wantColour });
return J({ ok: true, members: await listMembers() });
}

if (typeof b.name === "string" && b.name.trim()) {
const name = b.name.trim().slice(0, 40);
if (b.id) {
const ex = members.find((m) => m.id === String(b.id));
if (!ex) return bad("No such member", 404);
await saveMember({ ...ex, name, color: wantColour && PALETTE.includes(wantColour) ? wantColour : ex.color });
} else {
let id = slug(name);
let n = 2;
while (members.some((m) => m.id === id)) id = `${slug(name)}-${n++}`;
await saveMember({
id, name,
color: wantColour && PALETTE.includes(wantColour) ? wantColour : PALETTE[members.length % PALETTE.length],
sortOrder: members.length,
});
}
}
return J({ ok: true, members: await listMembers() });
}

return bad("Not found", 404);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
const put = await route(ctx);
if (put !== "ratings" && put !== "upcoming") return bad("Not found", 404);
const auth = await requireMember();
if (!auth.ok) return auth.res;
const b = await req.json().catch(() => ({}) as Record<string, unknown>);

/* What a scan found, kept so the next visit does not have to run one. */
if (put === "upcoming") {
const raw = Array.isArray(b.releases) ? (b.releases as Record<string, unknown>[]) : [];
const items: StoredRelease[] = [];
const seen = new Set<string>();
for (const x of raw) {
const id = str(x.id);
const title = str(x.title);
const artist = str(x.artist);
const sortDate = str(x.sortDate);
if (!id || !title || !artist || !sortDate || seen.has(id)) continue;
if (!/^\d{4}-\d{2}-\d{2}$/.test(sortDate)) continue;
seen.add(id);
items.push({
id, title, artist,
artistIds: Array.isArray(x.artistIds) ? (x.artistIds as unknown[]).map(String).slice(0, 8) : [],
releaseDate: str(x.releaseDate) ?? sortDate, sortDate,
precision: str(x.precision) ?? "day",
albumType: str(x.albumType) === "single" ? "single" : "album",
artUrl: str(x.artUrl), url: str(x.url),
source: str(x.source) === "musicbrainz" ? "musicbrainz" : "spotify",
});
}
/* One oversized body should not be able to fill the table. */
await saveReleases(auth.memberId, items.slice(0, 4000));
await pruneReleases(auth.memberId);
await markRefreshed(auth.memberId);
return J({ ok: true, releases: await listReleases(auth.memberId) });
}

const albumId = String(b.albumId ?? "");
if (!albumId) return bad("Missing album id");
if (!(await listAlbums()).some((a) => a.id === albumId)) return bad("No such album", 404);
/* An admin may write on someone else's behalf; everyone else only ever
   writes their own row, whatever they put in the body. */
const asMember = str(b.memberId);
let memberId = auth.memberId;
if (asMember && asMember !== auth.memberId) {
if (!(await isAdmin())) return bad("Only an admin can edit someone else's score", 403);
if (!(await listMembers()).some((m) => m.id === asMember)) return bad("Unknown member", 404);
memberId = asMember;
}

/* Skipping and scoring are mutually exclusive — a skipped album carries no
   number, which is what keeps it out of every average. */
const skipped = Boolean(b.skipped);
const rating = {
albumId, memberId, skipped,
score: skipped ? null : clampScore(b.score),
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
releaseDate: b.releaseDate === undefined ? ex.releaseDate : str(b.releaseDate),
};
if (next.releaseDate && !RELEASE_RE.test(next.releaseDate))
return bad("Release date should look like 2026-09-18");
/* Catches both halves of the same mistake: dating an album past its month, and
   moving an album back to a month it had not come out in. */
if (releaseTooLate(next.releaseDate, next.month))
return bad(`${next.title} isn't out until ${releaseLabel(next.releaseDate!)}, which is after ${monthName(next.month)}.`);
if (next.year === null && next.releaseDate) next.year = Number(next.releaseDate.slice(0, 4));

/* "replace" says this is a member swapping their pick, not an admin correcting
   a typo — the difference matters, because only the first should take anyone's
   scores with it. An ordinary edit never clears a rating. */
if (b.replace === true) {
if (ex.chosenBy !== auth.memberId && !(await isAdmin()))
return bad("Only whoever picked an album can change it", 403);
const differentRecord =
next.title.toLowerCase().trim() !== ex.title.toLowerCase().trim() ||
next.artist.toLowerCase().trim() !== ex.artist.toLowerCase().trim();
if (differentRecord) await clearRatingsFor(ex.id);
}
await saveAlbum(next);
return J({ ok: true, album: next });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
const r = await route(ctx);
const auth = await requireMember();
if (!auth.ok) return auth.res;

if (r === "admin") {
const res = NextResponse.json({ ok: true });
res.cookies.set(ADMIN_COOKIE, "", { ...COOKIE_OPTS, maxAge: 0 });
return res;
}

if (r === "spotify" || r === "youtube") {
await deleteAccount(auth.memberId);
return J({ ok: true });
}

if (r === "upcoming") {
await clearUpcoming(auth.memberId, req.nextUrl.searchParams.get("shortlist") === "1");
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
