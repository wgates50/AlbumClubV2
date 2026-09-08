"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fallbackArt } from "./lib/art";
import { PALETTE, accentVars } from "./lib/accent";
import Upcoming from "./upcoming";
import Admin from "./admin";
import ArtworkPicker from "./artwork";

/* ------------------------------ types ------------------------------ */

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
type ShortlistItem = {
id: string; month: string; title: string; artist: string;
releaseDate: string | null; artUrl: string | null;
};
type State = {
ok: true; mode: "live" | "preview"; me: string | null; members: Member[];
albums: Album[]; ratings: Rating[]; clubName: string; currentMonth: string;
myShortlist: ShortlistItem[];
};
type Wire = State | { ok: false; needsSetup?: boolean; dbError?: boolean; message?: string };
type Tab = "month" | "upcoming" | "archive" | "table" | "club" | "admin";

/* ----------------------------- helpers ----------------------------- */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (m: string) => {
const [y, mm] = m.split("-");
return { name: MONTHS[Number(mm) - 1] ?? m, year: y ?? "" };
};
const shiftMonth = (m: string, d: number) => {
const [y, mm] = m.split("-").map(Number);
const x = new Date(Date.UTC(y, mm - 1 + d, 1));
return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
};
const thisMonth = () => {
const d = new Date();
return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
/* Whole days left in the month, today included. Only ever asked about the
   current month, so a local Date is the right clock to read it off. */
const daysLeftIn = (month: string) => {
const [y, mm] = month.split("-").map(Number);
const last = new Date(y, mm, 0).getDate();
return Math.max(0, last - new Date().getDate());
};
const RELEASE_RE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
const releaseLabel = (d: string) =>
new Date(`${d.length === 7 ? `${d}-01` : d}T00:00:00Z`).toLocaleDateString("en-GB", {
day: d.length === 7 ? undefined : "numeric", month: "long", year: "numeric", timeZone: "UTC",
});
/* Out later today still counts as out, so this compares whole days. */
function notOutYet(d: string | null | undefined): boolean {
if (!d || !RELEASE_RE.test(d)) return false;
const today = new Date().toISOString().slice(0, 10);
return (d.length === 7 ? `${d}-01` : d) > today;
}
/* The same rule the server enforces, so the form can say so before you submit. */
const releaseTooLate = (d: string | null | undefined, month: string) =>
Boolean(d && RELEASE_RE.test(d) && d.slice(0, 7) > month);

const q = (a: Album) => `${a.artist} ${a.title}`.trim();
const spotify = (a: Album) => a.spotifyUrl || `https://open.spotify.com/search/${encodeURIComponent(q(a))}/albums`;
const ytm = (a: Album) => a.ytmUrl || `https://music.youtube.com/search?q=${encodeURIComponent(q(a))}`;
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : n.toFixed(1));

type Stats = { visible: Rating[]; avg: number | null; scoredCount: number; total: number };
function albumStats(album: Album, ratings: Rating[], total: number): Stats {
const visible = ratings.filter((r) => r.albumId === album.id);
const withScore = visible.filter((r) => r.score !== null) as (Rating & { score: number })[];
return {
visible,
avg: withScore.length
? Math.round((withScore.reduce((s, r) => s + r.score, 0) / withScore.length) * 10) / 10
: null,
scoredCount: withScore.length,
total,
};
}

async function api(path: string, init?: RequestInit) {
const res = await fetch(path, {
...init,
headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
});
let data: Record<string, unknown> = {};
try { data = await res.json(); } catch { /* no body */ }
return { ok: res.ok, data };
}

/* ------------------------------ icons ------------------------------ */

const SpotifyMark = () => (
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
<circle cx="12" cy="12" r="10.2" fill="currentColor" opacity="0.16" />
<path d="M6.6 9.3c3.4-1 7.4-.7 10.5 1.1M7.4 12.6c2.8-.8 6-.5 8.6.9M8.2 15.7c2.2-.6 4.7-.4 6.7.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
</svg>
);
const YtmMark = () => (
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
<circle cx="12" cy="12" r="9.4" stroke="currentColor" strokeWidth="1.5" />
<path d="M10.1 8.6 15.6 12l-5.5 3.4V8.6Z" fill="currentColor" />
</svg>
);
const Chevron = ({ left }: { left?: boolean }) => (
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={left ? { transform: "rotate(180deg)" } : undefined}>
<path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
</svg>
);
const Plus = () => (
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
<path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
</svg>
);
const DownloadIcon = () => (
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
<path d="M12 3.5v11m0 0 4-4m-4 4-4-4M4.5 19h15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
</svg>
);

/* --------------------------- small pieces --------------------------- */

function Sleeve({ album }: { album: Album }) {
const [broken, setBroken] = useState(false);
const showArt = Boolean(album.artUrl) && !broken;
return (
<div className="sleeve" style={showArt ? undefined : { background: fallbackArt(album.artist + album.title) }}>
{showArt ? (
<img src={album.artUrl!} alt={`${album.title} by ${album.artist}`} loading="lazy" onError={() => setBroken(true)} />
) : (
<div className="sleeve-fallback">{album.title}<span>{album.artist}</span></div>
)}
</div>
);
}

/* The sleeve, blown up and blurred, sitting behind the album header. No canvas
   and no CORS involved — just an img with a filter — so it works whatever the
   artwork host sends back, and simply doesn't render when there is no art. */
function Glow({ album }: { album: Album }) {
const [broken, setBroken] = useState(false);
if (!album.artUrl || broken) return null;
return (
<div className="album-glow" aria-hidden="true">
<img src={album.artUrl} alt="" onError={() => setBroken(true)} />
</div>
);
}

function Cover({ album }: { album: Album }) {
const [broken, setBroken] = useState(false);
const show = Boolean(album.artUrl) && !broken;
return (
<div className="cover" style={show ? undefined : { background: fallbackArt(album.artist + album.title) }}>
{show && <img src={album.artUrl!} alt="" loading="lazy" onError={() => setBroken(true)} />}
</div>
);
}

function Thumb({ album, size = 62 }: { album: Album; size?: number }) {
const [broken, setBroken] = useState(false);
const showArt = Boolean(album.artUrl) && !broken;
return (
<div className="thumb" style={{ width: size, height: size, ...(showArt ? {} : { background: fallbackArt(album.artist + album.title) }) }}>
{showArt && <img src={album.artUrl!} alt="" loading="lazy" onError={() => setBroken(true)} />}
</div>
);
}

function ListenRow({ album }: { album: Album }) {
return (
<div className="listen-row">
<a className="listen sp" href={spotify(album)} target="_blank" rel="noreferrer"><SpotifyMark /> Spotify</a>
<a className="listen yt" href={ytm(album)} target="_blank" rel="noreferrer"><YtmMark /> YouTube Music</a>
</div>
);
}

function Take({ member, r }: { member: Member; r?: Rating }) {
const skipped = Boolean(r?.skipped);
const empty = !skipped && (!r || (r.score === null && !r.review));
return (
<div className="take">
<div className="take-head">
<i className="pip" style={{ background: member.color }} />
<span className="take-name">{member.name}</span>
{skipped
? <span className="take-score dim">skipped</span>
: <span className="take-score" style={{ color: empty ? "var(--muted-2)" : member.color }}>{fmt(r?.score ?? null)}</span>}
</div>
{empty ? (
<p className="take-review dim">Hasn&rsquo;t weighed in yet.</p>
) : (
<>
{r!.review && <p className="take-review">{r!.review}</p>}
{r!.favTracks.length > 0 && <p className="take-favs">★ {r!.favTracks.join(" · ")}</p>}
</>
)}
</div>
);
}

/* ---------------------------- album card ---------------------------- */

function AlbumCard({
album, members, ratings, me, onChanged,
}: {
album: Album; members: Member[]; ratings: Rating[]; me: string | null;
onChanged: () => void;
}) {
/* Whoever picked this record sets its colour for as long as it's on screen. */
const pickedBy = members.find((m) => m.id === album.chosenBy);
const mine = ratings.find((r) => r.albumId === album.id && r.memberId === me);
const [score, setScore] = useState<number | null>(mine?.score ?? null);
const [review, setReview] = useState(mine?.review ?? "");
const [favs, setFavs] = useState<string[]>(mine?.favTracks ?? []);
const [skipped, setSkipped] = useState(mine?.skipped ?? false);
const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
const [newTrack, setNewTrack] = useState("");
const snapshot = (s: number | null, r: string, f: string[], k: boolean) => JSON.stringify([s, r, f, k]);
const lastSaved = useRef(snapshot(mine?.score ?? null, mine?.review ?? "", mine?.favTracks ?? [], mine?.skipped ?? false));
const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
const r = ratings.find((x) => x.albumId === album.id && x.memberId === me);
setScore(r?.score ?? null);
setReview(r?.review ?? "");
setFavs(r?.favTracks ?? []);
setSkipped(r?.skipped ?? false);
lastSaved.current = snapshot(r?.score ?? null, r?.review ?? "", r?.favTracks ?? [], r?.skipped ?? false);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [album.id, me]);

// Debounced autosave — only ever fires when the values actually differ from
// what the server already holds, so simply opening the page saves nothing.
useEffect(() => {
if (!me) return;
const payload = snapshot(score, review, favs, skipped);
if (payload === lastSaved.current) return;
setStatus("saving");
if (timer.current) clearTimeout(timer.current);
timer.current = setTimeout(async () => {
const res = await api("/api/ratings", {
method: "PUT",
body: JSON.stringify({ albumId: album.id, score, review, favTracks: favs, skipped }),
});
if (res.ok) { lastSaved.current = payload; onChanged(); }
setStatus(res.ok ? "saved" : "idle");
setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2200);
}, 700);
return () => { if (timer.current) clearTimeout(timer.current); };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [score, review, favs, skipped]);

const stats = albumStats(album, ratings, members.length);
const others = members.filter((m) => m.id !== me);
const chooser = members.find((m) => m.id === album.chosenBy);
const toggleFav = (t: string) => setFavs((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));
const addTrack = () => {
const t = newTrack.trim();
if (t && !favs.includes(t)) setFavs((f) => [...f, t]);
setNewTrack("");
};
const unpicked = album.tracks.filter((t) => !favs.includes(t));

return (
<article className="album" style={accentVars(pickedBy?.color)}>
<Glow album={album} />
<div className="album-top">
<Sleeve album={album} />
<div>
{/* Whose record this is comes before anything else about it. */}
<p className="album-chooser">
{chooser
? <><i className="pip" style={{ background: chooser.color }} />{chooser.name}&rsquo;s pick</>
: <span className="dim">Nobody&rsquo;s pick</span>}
</p>
<p className="album-artist">{album.artist}</p>
<h2 className="album-title display">{album.title}</h2>
<div className="album-sub">
{album.releaseDate
? <span className={`chip${notOutYet(album.releaseDate) ? " soon" : ""}`}>
{notOutYet(album.releaseDate) ? "Out " : "Released "}{releaseLabel(album.releaseDate)}
</span>
: album.year && <span className="mono-num">{album.year}</span>}
<span className="chip">{stats.scoredCount}/{stats.total} scored</span>
{stats.avg !== null && stats.scoredCount > 1 && (
<span className="chip gold">
{stats.scoredCount === stats.total ? "club average" : "average so far"} {fmt(stats.avg)}
</span>
)}
</div>
{notOutYet(album.releaseDate) && (
<div className="notice soon mb16">
<span className="badge">Not out yet</span>
<div>
This lands on <strong className="semi">{releaseLabel(album.releaseDate!)}</strong>. Scores and
reviews can wait until then — the links below will not play anything before it.
</div>
</div>
)}
<ListenRow album={album} />
</div>
</div>

<div className="panels">
<section className="panel">
<div className="panel-head">
<span className="eyebrow">Your verdict</span>
<span className={`saved ${status === "saved" ? "on" : ""}`}>
{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
</span>
</div>
{!me ? (
<p className="muted">Pick who you are at the top of the page to score this.</p>
) : (
<>
<div className="score-row">
<div className={`big-score${score === null ? " unset" : ""}`}>
{skipped ? "—" : score === null ? "—" : score.toFixed(1)}<small>{skipped ? "" : "/10"}</small>
</div>
<div className="grow">
<input type="range" min={0} max={10} step={0.1} value={score ?? 5} disabled={skipped}
aria-label={`Your score for ${album.title}`}
onChange={(e) => setScore(Number(e.target.value))} />
<div className="ticks"><span>0</span><span>5</span><span>10</span></div>
<div className="flex gap8 mt8 wrap">
{score !== null && !skipped && (
<button className="btn ghost sm" onClick={() => setScore(null)}>Clear score</button>
)}
<button className={`btn ghost sm${skipped ? " on" : ""}`}
onClick={() => { const next = !skipped; setSkipped(next); if (next) setScore(null); }}>
{skipped ? "Skipped — undo" : "Skip this one"}
</button>
</div>
{skipped && (
<p className="muted mt8">Left out of the averages. Your review still shows if you write one.</p>
)}
</div>
</div>

<label className="field">
<span>Review</span>
<textarea value={review}
placeholder="What did it do for you? Change your mind halfway through the month and edit it."
onChange={(e) => setReview(e.target.value)} />
</label>

<div className="field">
<span className="lbl">Favourite tracks</span>
{favs.length > 0 && (
<div className="tracks mb9">
{favs.map((t) => (
<button key={t} type="button" className="track on" onClick={() => toggleFav(t)}
title="Remove">{t} <span aria-hidden="true">×</span></button>
))}
</div>
)}
{/* Pick from the tracklist where we have one — a long album is 20+ chips
    otherwise, which is a lot of screen for a couple of picks. */}
{unpicked.length > 0 && (
<select className="mb9" value="" aria-label="Add a favourite track"
onChange={(e) => { if (e.target.value) toggleFav(e.target.value); }}>
<option value="">Pick a track&hellip;</option>
{unpicked.map((t) => <option key={t} value={t}>{t}</option>)}
</select>
)}
{album.tracks.length === 0 && (
<p className="muted mb9">No tracklist stored for this one — type them in.</p>
)}
<div className="flex gap8">
<input type="text" value={newTrack}
placeholder={album.tracks.length ? "Or type one that isn't listed" : "Type a track name"}
onChange={(e) => setNewTrack(e.target.value)}
onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTrack(); } }} />
<button className="btn sm" type="button" onClick={addTrack}>Add</button>
</div>
</div>
</>
)}
</section>

<section className="panel">
<div className="panel-head"><span className="eyebrow">The club</span></div>
{others.length === 0 ? (
<p className="muted">Add the rest of the club under Club settings.</p>
) : (
others.map((m) => (
<Take key={m.id} member={m} r={stats.visible.find((x) => x.memberId === m.id)} />
))
)}
</section>
</div>
</article>
);
}

/* --------------------------- the nudge to pick --------------------------- */

/* In a three-person club nobody chases anybody, so the app does it. This sits
   at the top of the month until the pick exists, and sharpens as the month
   runs out. Shortlisted records become the pick in one click, because the
   fastest way to stop nagging someone is to make the job trivial. */
function PickPrompt({
month, members, me, monthAlbums, shortlist, onAdd, onBrowse, onPicked,
}: {
month: string; members: Member[]; me: string; monthAlbums: Album[];
shortlist: ShortlistItem[]; onAdd: () => void; onBrowse: () => void; onPicked: () => void;
}) {
const [busy, setBusy] = useState<string | null>(null);
const [error, setError] = useState("");
const l = monthLabel(month);
const left = daysLeftIn(month);
const urgent = left <= 5;

const others = members.filter((m) => m.id !== me);
const waiting = others.filter((m) => monthAlbums.some((a) => a.chosenBy === m.id));
const names = waiting.map((m) => m.name);
const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];

/* Anything already shortlisted is a candidate; ones dated to this month first. */
const candidates = [...shortlist]
.sort((a, b) => Number(b.month === month) - Number(a.month === month))
.slice(0, 3);

const promote = async (item: ShortlistItem) => {
setBusy(item.id); setError("");
const res = await api("/api/shortlist", {
method: "POST",
body: JSON.stringify({ promote: item.id, month }),
});
setBusy(null);
if (res.ok) onPicked();
else setError(String(res.data.error ?? "Couldn't make that your pick"));
};

return (
<div className={`nudge${urgent ? " urgent" : ""}`}>
<div className="nudge-bar" aria-hidden="true" />
<div className="nudge-body">
<div className="nudge-head">
<h2 className="nudge-title display">Your {l.name} pick is still blank</h2>
<span className="nudge-days">
{left === 0 ? "Last day of the month" : `${left} day${left === 1 ? "" : "s"} left`}
</span>
</div>
<p className="nudge-line">
{waiting.length === 0
? "Nobody has put anything in yet. Go first and set the tone."
: waiting.length === others.length
? `${list} ${waiting.length === 1 ? "is" : "are"} in. You are the one holding up the month.`
: `${list} ${waiting.length === 1 ? "is" : "are"} in. You are not.`}
</p>

{candidates.length > 0 && (
<>
<p className="eyebrow mb9">One click from your shortlist</p>
<div className="nudge-picks">
{candidates.map((c) => (
<button key={c.id} className="nudge-pick" disabled={busy !== null} onClick={() => promote(c)}>
<span className="nudge-pick-art"
style={c.artUrl ? undefined : { background: fallbackArt(c.artist + c.title) }}>
{c.artUrl && <img src={c.artUrl} alt="" loading="lazy" />}
</span>
<span className="min0">
<span className="nudge-pick-title">{c.title}</span>
<span className="nudge-pick-sub">
{c.artist}
{/* Shortlisted against a different month — say so before it becomes this one's pick. */}
{c.month !== month && ` · out ${monthLabel(c.month).name}`}
</span>
</span>
<span className="nudge-pick-go">{busy === c.id ? "…" : "Make it mine"}</span>
</button>
))}
</div>
</>
)}

{error && <p className="error">{error}</p>}
<div className="flex gap8 wrap mt14">
<button className="btn primary" onClick={onAdd}><Plus /> Add my album</button>
<button className="btn ghost" onClick={onBrowse}>Find one in Upcoming</button>
</div>
</div>
</div>
);
}

/* --------------------------- add / edit modal --------------------------- */

type Result = {
sourceId: string; title: string; artist: string; year: number | null;
artUrl: string | null; appleUrl: string | null; trackCount: number | null;
releaseDate: string | null;
};

function AlbumModal({
album, month, members, me, onClose, onSaved,
}: {
album: Album | null; month: string; members: Member[]; me: string | null;
onClose: () => void; onSaved: () => void;
}) {
const editing = Boolean(album);
const [query, setQuery] = useState("");
const [results, setResults] = useState<Result[]>([]);
const [searching, setSearching] = useState(false);
const [busy, setBusy] = useState(false);
const [error, setError] = useState("");
const [form, setForm] = useState({
title: album?.title ?? "", artist: album?.artist ?? "",
year: album?.year ? String(album.year) : "", artUrl: album?.artUrl ?? "",
appleUrl: album?.appleUrl ?? "", spotifyUrl: album?.spotifyUrl ?? "",
ytmUrl: album?.ytmUrl ?? "", month: album?.month ?? month,
chosenBy: album?.chosenBy ?? me ?? "", tracks: album?.tracks ?? ([] as string[]),
releaseDate: album?.releaseDate ?? "",
});
const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => {
if (query.trim().length < 2) { setResults([]); return; }
setSearching(true);
if (timer.current) clearTimeout(timer.current);
timer.current = setTimeout(async () => {
const res = await api(`/api/search?q=${encodeURIComponent(query.trim())}`);
setResults((res.data.results as Result[]) ?? []);
setSearching(false);
}, 320);
return () => { if (timer.current) clearTimeout(timer.current); };
}, [query]);

useEffect(() => {
const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
window.addEventListener("keydown", onKey);
return () => window.removeEventListener("keydown", onKey);
}, [onClose]);

async function choose(r: Result) {
set({
title: r.title, artist: r.artist, year: r.year ? String(r.year) : "",
artUrl: r.artUrl ?? "", appleUrl: r.appleUrl ?? "",
releaseDate: r.releaseDate ?? "",
});
setQuery("");
setResults([]);
const res = await api(`/api/search?tracks=${encodeURIComponent(r.sourceId)}`);
const tracks = (res.data.tracks as string[]) ?? [];
if (tracks.length) set({ tracks });
}

async function save() {
if (!form.title.trim() || !form.artist.trim()) { setError("An album needs a title and an artist."); return; }
if (form.releaseDate && !RELEASE_RE.test(form.releaseDate)) {
setError("Release date should look like 2026-09-18, or 2026-09 if the day isn't known.");
return;
}
if (tooLate) {
setError(`${form.title || "That album"} isn't out until ${releaseLabel(form.releaseDate)}, so nobody could score it in ${monthLabel(form.month).name}. Pick ${monthLabel(form.releaseDate.slice(0, 7)).name} as the month instead.`);
return;
}
setBusy(true); setError("");
const res = await api("/api/albums", {
method: editing ? "PATCH" : "POST",
body: JSON.stringify({
...(editing ? { id: album!.id } : {}),
title: form.title, artist: form.artist,
year: form.releaseDate ? Number(form.releaseDate.slice(0, 4)) : form.year ? Number(form.year) : null,
artUrl: form.artUrl || null, appleUrl: form.appleUrl || null,
spotifyUrl: form.spotifyUrl || null, ytmUrl: form.ytmUrl || null,
month: form.month, chosenBy: form.chosenBy || null, tracks: form.tracks,
releaseDate: form.releaseDate || null,
}),
});
setBusy(false);
if (!res.ok) { setError(String(res.data.error ?? "Could not save that")); return; }
onSaved(); onClose();
}

async function remove() {
if (!album) return;
if (!window.confirm(`Remove "${album.title}" and every score and review attached to it? This can't be undone.`)) return;
setBusy(true);
const res = await api(`/api/albums?id=${encodeURIComponent(album.id)}`, { method: "DELETE" });
setBusy(false);
if (res.ok) { onSaved(); onClose(); }
}

const months = [shiftMonth(thisMonth(), 1), thisMonth(), shiftMonth(thisMonth(), -1), shiftMonth(thisMonth(), -2), shiftMonth(thisMonth(), -3)];
if (!months.includes(form.month)) months.push(form.month);
const tooLate = releaseTooLate(form.releaseDate, form.month);
const dueLater = !tooLate && notOutYet(form.releaseDate);

return (
<div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
<div className="modal" role="dialog" aria-modal="true">
<h2>{editing ? "Edit album" : "Add an album"}</h2>
<p className="lede sm">
{editing
? "Fix the details, swap the artwork, or move it to another month."
: "Search and the artwork, year and tracklist come with it. Or fill it in by hand."}
</p>

{!editing && (
<label className="field">
<span>Search</span>
<input type="text" autoFocus value={query} placeholder="Artist and album — e.g. Burial Untrue"
onChange={(e) => setQuery(e.target.value)} />
{(results.length > 0 || searching) && (
<div className="results">
{searching && results.length === 0 && <div className="pad14 muted">Looking…</div>}
{results.map((r) => (
<button key={r.sourceId} type="button" className="result" onClick={() => choose(r)}>
{r.artUrl ? <img src={r.artUrl} alt="" />
: <span className="res-blank" style={{ background: fallbackArt(r.artist + r.title) }} />}
<span className="min0">
<span className="res-title">{r.title}</span>
<span className="res-sub">
{r.artist}{r.year ? ` · ${r.year}` : ""}{r.trackCount ? ` · ${r.trackCount} tracks` : ""}
</span>
</span>
</button>
))}
</div>
)}
</label>
)}

{(form.title || form.artist || editing) && (
<div className="edit-head">
<div className="edit-art" style={form.artUrl ? undefined : { background: fallbackArt(form.artist + form.title) }}>
{form.artUrl && <img src={form.artUrl} alt="" />}
</div>
<div className="grow min0">
<label className="field">
<span>Album</span>
<input type="text" value={form.title} onChange={(e) => set({ title: e.target.value })} />
</label>
<label className="field">
<span>Artist</span>
<input type="text" value={form.artist} onChange={(e) => set({ artist: e.target.value })} />
</label>
</div>
</div>
)}

<div className="grid3">
<label className="field">
<span>Release date</span>
<input type="date" value={form.releaseDate.length === 7 ? `${form.releaseDate}-01` : form.releaseDate}
onChange={(e) => set({ releaseDate: e.target.value })} />
</label>
<label className="field">
<span>Club month</span>
<select value={form.month} onChange={(e) => set({ month: e.target.value })}>
{months.map((m) => {
const l = monthLabel(m);
return <option key={m} value={m}>{l.name} {l.year}</option>;
})}
</select>
</label>
<label className="field">
<span>Chosen by</span>
<select value={form.chosenBy} onChange={(e) => set({ chosenBy: e.target.value })}>
<option value="">Nobody</option>
{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
</select>
</label>
</div>

{(tooLate || dueLater) && (
<div className={`notice ${tooLate ? "bad" : "warn"} mb16`}>
<span className="badge">{tooLate ? "Too late" : "Not out yet"}</span>
<div>
{tooLate
? <>Out {releaseLabel(form.releaseDate)}, which is after {monthLabel(form.month).name} finishes.
Nobody could score it in time — put it in {monthLabel(form.releaseDate.slice(0, 7)).name} instead.</>
: <>Out {releaseLabel(form.releaseDate)}. Fine for {monthLabel(form.month).name} — everyone just
has less of the month to get through it.</>}
</div>
</div>
)}

<details className="more">
<summary>Artwork &amp; links</summary>
<div className="pt14">
<label className="field">
<span>Artwork URL</span>
<input type="text" value={form.artUrl} placeholder="https://…  (filled in automatically when you search)"
onChange={(e) => set({ artUrl: e.target.value })} />
</label>
<label className="field">
<span>Spotify album link</span>
<input type="text" value={form.spotifyUrl} placeholder="Leave blank to link to a Spotify search"
onChange={(e) => set({ spotifyUrl: e.target.value })} />
</label>
<label className="field">
<span>YouTube Music link</span>
<input type="text" value={form.ytmUrl} placeholder="Leave blank to link to a YouTube Music search"
onChange={(e) => set({ ytmUrl: e.target.value })} />
</label>
<p className="muted nomb">
{form.tracks.length
? `${form.tracks.length} tracks stored — they show up as one-tap favourites.`
: "No tracklist stored. You can still type favourite tracks by hand on the album."}
</p>
</div>
</details>

{error && <p className="error">{error}</p>}

<div className="flex gap10 mt18">
<button className="btn primary" onClick={save} disabled={busy}>
{busy ? "Saving…" : editing ? "Save changes" : "Add to the month"}
</button>
<button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
{editing && <button className="btn ghost danger right" onClick={remove} disabled={busy}>Delete</button>}
</div>
</div>
</div>
);
}

/* ------------------------------ archive ------------------------------ */

function Archive({ albums, members, ratings, currentMonth }: {
albums: Album[]; members: Member[]; ratings: Rating[]; currentMonth: string;
}) {
const [open, setOpen] = useState<string | null>(null);
const [view, setView] = useState<"rows" | "wall">("rows");
const past = albums.filter((a) => a.month < currentMonth);
const months = Array.from(new Set(past.map((a) => a.month))).sort((a, b) => (a < b ? 1 : -1));

if (!months.length)
return (
<div className="empty">
<div className="display">Nothing in the archive yet</div>
<p>When this month rolls over, its three albums land here with every score and review attached.</p>
</div>
);

return (
<div className="pt34">
<div className="arch-head">
<div className="up-views">
{(["rows", "wall"] as const).map((v) => (
<button key={v} className="up-view" aria-selected={view === v} onClick={() => setView(v)}>
{v === "rows" ? "List" : "Sleeves"}
</button>
))}
</div>
</div>
{months.map((m) => {
const l = monthLabel(m);
const list = past.filter((a) => a.month === m)
.map((a) => ({ a, s: albumStats(a, ratings, members.length) }))
.sort((x, y) => (y.s.avg ?? -1) - (x.s.avg ?? -1));
return (
<section className="month-block" key={m}>
<h3>{l.name} <span className="dim">{l.year}</span></h3>
{view === "wall" ? (
<>
<div className="wall">
{list.map(({ a, s }, i) => {
const chooser = members.find((x) => x.id === a.chosenBy);
return (
<button className="wall-item" key={a.id} aria-selected={open === a.id}
style={accentVars(chooser?.color)}
onClick={() => setOpen(open === a.id ? null : a.id)}>
<Cover album={a} />
<span className="wall-meta">
<span className="wall-title">{a.title}</span>
<span className="wall-sub">{a.artist}</span>
</span>
{s.avg !== null && <span className="wall-avg">{fmt(s.avg)}{i === 0 && <i className="wall-crown" title="Month's best" />}</span>}
</button>
);
})}
</div>
{(() => {
const picked = list.find(({ a }) => a.id === open);
if (!picked) return null;
const { a, s } = picked;
return (
<div className="expanded wall-detail">
<div className="mb16"><ListenRow album={a} /></div>
{s.visible.filter((r) => r.score !== null || r.review).length === 0 ? (
<p className="muted">No verdicts were recorded for this one.</p>
) : (
members.map((mem) => {
const r = s.visible.find((x) => x.memberId === mem.id);
if (!r || (r.score === null && !r.review)) return null;
return <Take key={mem.id} member={mem} r={r} />;
})
)}
</div>
);
})()}
</>
) : (
<div className="rows">
{list.map(({ a, s }, i) => {
const chooser = members.find((x) => x.id === a.chosenBy);
const isOpen = open === a.id;
return (
<div key={a.id}>
<div className="row" role="button" tabIndex={0}
onClick={() => setOpen(isOpen ? null : a.id)}
onKeyDown={(e) => e.key === "Enter" && setOpen(isOpen ? null : a.id)}>
<Thumb album={a} />
<div className="min0">
<div className="row-title">{a.title}</div>
<div className="row-sub">
{a.artist}{a.year ? ` · ${a.year}` : ""}{chooser ? ` · ${chooser.name}'s pick` : ""}
</div>
</div>
<div className="avg">{fmt(s.avg)}{s.avg !== null && <small>{i === 0 ? "winner" : "average"}</small>}</div>
</div>
{isOpen && (
<div className="expanded">
<div className="mb16"><ListenRow album={a} /></div>
{s.visible.filter((r) => r.score !== null || r.review).length === 0 ? (
<p className="muted">No verdicts were recorded for this one.</p>
) : (
members.map((mem) => {
const r = s.visible.find((x) => x.memberId === mem.id);
if (!r || (r.score === null && !r.review)) return null;
return <Take key={mem.id} member={mem} r={r} />;
})
)}
</div>
)}
</div>
);
})}
</div>
)}
</section>
);
})}
</div>
);
}

/* ---------------------------- leaderboard ---------------------------- */

const mean = (ns: number[]) => (ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10 : null);

function Leaderboard({ albums, members, ratings }: { albums: Album[]; members: Member[]; ratings: Rating[] }) {
const [open, setOpen] = useState<string | null>(null);
const scored = albums
.map((a) => ({ a, s: albumStats(a, ratings, members.length) }))
.filter((x) => x.s.avg !== null)
.sort((x, y) => (y.s.avg ?? 0) - (x.s.avg ?? 0));

const perMember = members.map((m) => {
const given = ratings.filter((r) => r.memberId === m.id && r.score !== null).map((r) => r.score as number);
const picks = albums.filter((a) => a.chosenBy === m.id);
const pickAvgs = picks.map((a) => albumStats(a, ratings, members.length).avg).filter((v): v is number => v !== null);
const best = picks.map((a) => ({ a, avg: albumStats(a, ratings, members.length).avg }))
.filter((x) => x.avg !== null).sort((x, y) => (y.avg ?? 0) - (x.avg ?? 0))[0];
return {
m, picks: picks.length, avgGiven: mean(given), avgReceived: mean(pickAvgs),
reviews: ratings.filter((r) => r.memberId === m.id && r.review).length,
best: best?.a ?? null, bestAvg: best?.avg ?? null,
};
});

if (!albums.length)
return (
<div className="empty">
<div className="display">No records yet</div>
<p>Add a few albums and the standings will build themselves.</p>
</div>
);

return (
<div className="pt34">
<p className="eyebrow mb14">Who picks well, who scores generously</p>
<div className="stat-grid">
{perMember.map((p) => (
<div className="stat" key={p.m.id}>
<div className="flex gap8 vc">
<i className="pip" style={{ background: p.m.color }} />
<strong className="stat-name">{p.m.name}</strong>
</div>
<div className="stat-value" style={{ color: p.m.color }}>{fmt(p.avgReceived)}</div>
<div className="stat-note">
average their picks score<br />
{p.picks} {p.picks === 1 ? "pick" : "picks"} · gives {fmt(p.avgGiven)} on average · {p.reviews} {p.reviews === 1 ? "review" : "reviews"}
</div>
{p.best && (
<div className="stat-best">
Best pick: <span className="bright">{p.best.title} ({fmt(p.bestAvg)})</span>
</div>
)}
</div>
))}
</div>

<p className="eyebrow mb14">
All-time table · {scored.length} {scored.length === 1 ? "album" : "albums"} with a settled average
</p>
<div className="rows">
{scored.map(({ a, s }, i) => {
const chooser = members.find((x) => x.id === a.chosenBy);
const l = monthLabel(a.month);
const isOpen = open === a.id;
return (
<div key={a.id}>
<div className="row lb" role="button" tabIndex={0} aria-expanded={isOpen}
onClick={() => setOpen(isOpen ? null : a.id)}
onKeyDown={(e) => e.key === "Enter" && setOpen(isOpen ? null : a.id)}>
<span className="rank">{i + 1}</span>
<div className="flex gap14 vc min0">
<Thumb album={a} size={48} />
<div className="min0">
<div className="row-title sm">{a.title}</div>
<div className="row-sub">{a.artist} · {l.name} {l.year}{chooser ? ` · ${chooser.name}` : ""}</div>
</div>
</div>
<div className="flex gap18 vc">
<div className="flex gap10 hide-sm">
{members.map((m) => {
const r = s.visible.find((x) => x.memberId === m.id);
return (
<span key={m.id} className="mini-score mono-num"
title={`${m.name}: ${fmt(r?.score ?? null)}`}
style={{ color: r?.score != null ? m.color : "var(--muted-2)" }}>
{fmt(r?.score ?? null)}
</span>
);
})}
</div>
<div className="avg w58">{fmt(s.avg)}</div>
</div>
</div>
{isOpen && (
<div className="expanded lb">
<div className="mb16"><ListenRow album={a} /></div>
{s.visible.filter((r) => r.score !== null || r.review).length === 0 ? (
<p className="muted">No verdicts were recorded for this one.</p>
) : (
members.map((mem) => {
const r = s.visible.find((x) => x.memberId === mem.id);
if (!r || (r.score === null && !r.review)) return null;
return <Take key={mem.id} member={mem} r={r} />;
})
)}
</div>
)}
</div>
);
})}
</div>
</div>
);
}

/* ------------------------------ settings ------------------------------ */

/* Albums typed in by hand — or imported from the spreadsheet — have no sleeve.
   This looks each one up in the same Apple catalogue the add-album search uses.
   It only accepts a result whose artist agrees: a wrong sleeve is worse than
   the gradient, and it would be silently wrong forever. */
function ArtworkFinder({ albums, onChanged }: { albums: Album[]; onChanged: () => void }) {
const missing = useMemo(() => albums.filter((a) => !a.artUrl), [albums]);
const [busy, setBusy] = useState(false);
const [note, setNote] = useState("");
const [report, setReport] = useState<{ found: number; skipped: number } | null>(null);
const [picking, setPicking] = useState<Album | null>(null);

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const run = async () => {
setBusy(true); setReport(null);
let found = 0;
let skipped = 0;
for (let i = 0; i < missing.length; i++) {
const a = missing[i];
setNote(`Looking up ${i + 1} of ${missing.length} — ${a.title}`);
const res = await api(`/api/search?q=${encodeURIComponent(`${a.artist} ${a.title}`)}`);
const results = ((res.data.results ?? []) as Result[]).filter((r) => r.artUrl);
const want = norm(a.artist);
const hit =
results.find((r) => norm(r.artist) === want) ??
results.find((r) => norm(r.artist).includes(want) || want.includes(norm(r.artist)));
if (!hit) { skipped += 1; continue; }
const saved = await api("/api/albums", {
method: "PATCH",
body: JSON.stringify({
id: a.id, artUrl: hit.artUrl,
appleUrl: a.appleUrl ?? hit.appleUrl,
year: a.year ?? hit.year,
}),
});
if (saved.ok) found += 1; else skipped += 1;
await new Promise((r) => setTimeout(r, 300)); /* Apple rate-limits bursts */
}
setBusy(false); setNote("");
setReport({ found, skipped });
onChanged();
};

if (!albums.length) return null;

return (
<>
<p className="eyebrow mt34 mb16">Artwork</p>
{missing.length === 0 ? (
<p className="muted">Every album has a sleeve.</p>
) : (
<>
<p className="muted mb12">
{missing.length} {missing.length === 1 ? "album has" : "albums have"} no sleeve and fall
back to a gradient. This searches Apple&rsquo;s catalogue and fills in the ones it can
match with confidence.
</p>
<button className="btn" disabled={busy} onClick={run}>
{busy ? "Searching…" : `Find artwork for ${missing.length}`}
</button>
</>
)}
{note && <p className="muted mt8">{note}</p>}
{report && (
<p className="muted mt14">
Found {report.found} sleeve{report.found === 1 ? "" : "s"}.
{report.skipped > 0 && ` ${report.skipped} still to do — pick those below.`}
</p>
)}

{/* Whatever the automatic pass can't place is listed here to sort out by
    eye, rather than left as a list of names you can do nothing with. */}
{missing.length > 0 && (
<div className="art-todo">
{missing.map((a) => (
<button className="art-todo-row" key={a.id} onClick={() => setPicking(a)}>
<Thumb album={a} size={40} />
<span className="min0">
<span className="art-todo-title">{a.title}</span>
<span className="art-todo-sub">{a.artist}</span>
</span>
<span className="art-todo-cta">Choose&hellip;</span>
</button>
))}
</div>
)}
{picking && (
<ArtworkPicker album={picking} onClose={() => setPicking(null)} onSaved={onChanged} />
)}
</>
);
}

function ClubSettings({ clubName, members, me, albums, onChanged }: {
clubName: string; members: Member[]; me: string | null;
albums: Album[]; onChanged: () => void;
}) {
const albumCount = albums.length;
const [name, setName] = useState(clubName);
const [newMember, setNewMember] = useState("");
const [editing, setEditing] = useState<string | null>(null);
const [colouring, setColouring] = useState<string | null>(null);
const [draft, setDraft] = useState("");
const [error, setError] = useState("");
const [busy, setBusy] = useState(false);

async function post(body: Record<string, unknown>) {
setBusy(true); setError("");
const res = await api("/api/members", { method: "POST", body: JSON.stringify(body) });
setBusy(false);
if (!res.ok) setError(String(res.data.error ?? "Could not save")); else onChanged();
}
async function removeMember(id: string) {
setBusy(true); setError("");
const res = await api(`/api/members?id=${encodeURIComponent(id)}`, { method: "DELETE" });
setBusy(false);
if (!res.ok) setError(String(res.data.error ?? "Could not remove")); else onChanged();
}

return (
<div className="pt34 narrow">
<p className="eyebrow mb16">Backups</p>
<div className="notice">
<div>
Everything lives in the database behind this app, and you can pull the whole lot out at any
time. The JSON file is the complete record — albums, scores, reviews, favourite tracks,
artwork links. The CSV opens straight in a spreadsheet.
<div className="flex gap10 mt14 wrap">
<a className="btn sm" href="/api/export?format=json"><DownloadIcon /> Download JSON</a>
<a className="btn sm" href="/api/export?format=csv"><DownloadIcon /> Download CSV</a>
</div>
</div>
</div>

<p className="eyebrow mt34 mb16">Members</p>
{members.map((m) => (
<div className="member-line" key={m.id}>
<i className="pip" style={{ background: m.color }} />
{editing === m.id ? (
<>
<input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} className="w220" />
<button className="btn sm primary" disabled={busy}
onClick={async () => { await post({ id: m.id, name: draft }); setEditing(null); }}>Save</button>
<button className="btn sm ghost" onClick={() => setEditing(null)}>Cancel</button>
</>
) : (
<>
<span className="grow">
{m.name}{m.id === me && <span className="muted"> — that&rsquo;s you</span>}
</span>
<button className="btn sm ghost" onClick={() => setColouring(colouring === m.id ? null : m.id)}>Colour</button>
<button className="btn sm ghost" onClick={() => { setEditing(m.id); setDraft(m.name); }}>Rename</button>
<button className="btn sm ghost danger" disabled={busy} onClick={() => removeMember(m.id)}>Remove</button>
</>
)}
{colouring === m.id && (
<div className="swatches">
{PALETTE.map((c) => (
<button key={c} className={`swatch${m.color === c ? " on" : ""}`} style={{ background: c }}
aria-label={`Use this colour for ${m.name}`} aria-pressed={m.color === c}
onClick={async () => { await post({ id: m.id, color: c }); setColouring(null); }} />
))}
</div>
)}
</div>
))}
<div className="flex gap8 mt16">
<input type="text" value={newMember} placeholder="Add someone"
onChange={(e) => setNewMember(e.target.value)}
onKeyDown={(e) => { if (e.key === "Enter" && newMember.trim()) { post({ name: newMember.trim() }); setNewMember(""); } }} />
<button className="btn" disabled={busy || !newMember.trim()}
onClick={() => { post({ name: newMember.trim() }); setNewMember(""); }}><Plus /> Add</button>
</div>

<p className="eyebrow mt34 mb16">How the club runs</p>
<label className="field">
<span>Club name</span>
<div className="flex gap8">
<input type="text" value={name} onChange={(e) => setName(e.target.value)} />
<button className="btn" disabled={busy || name === clubName} onClick={() => post({ clubName: name })}>Save</button>
</div>
</label>

{error && <p className="error">{error}</p>}

<ArtworkFinder albums={albums} onChanged={onChanged} />

<p className="eyebrow mt34 mb16">This device</p>
<div className="flex gap10 wrap">
<button className="btn" onClick={async () => {
await api("/api/me", { method: "POST", body: JSON.stringify({ memberId: null }) });
onChanged();
}}>Switch member</button>
</div>
<p className="muted mt26">{albumCount} {albumCount === 1 ? "album" : "albums"} on record.</p>
</div>
);
}

/* -------------------------------- gates -------------------------------- */

function SetupScreen({ onDone }: { onDone: () => void }) {
const [clubName, setClubName] = useState("Album Club");
const [names, setNames] = useState(["Will", "Oli", "Flik"]);
const [error, setError] = useState("");
const [busy, setBusy] = useState(false);

return (
<div className="gate">
<div className="gate-card">
<p className="eyebrow mb12">First run</p>
<h1>Set up the club</h1>
<p className="lede">Send the others the link and they&rsquo;re in — no passcode, no accounts, no sign-ups.</p>
<label className="field">
<span>Club name</span>
<input type="text" value={clubName} onChange={(e) => setClubName(e.target.value)} />
</label>
<div className="field">
<span className="lbl">Members</span>
{names.map((n, i) => (
<input key={i} type="text" value={n} className="mb8" placeholder={`Member ${i + 1}`}
onChange={(e) => setNames((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
))}
<button className="btn sm ghost" onClick={() => setNames((p) => [...p, ""])}>Add another</button>
</div>
{error && <p className="error">{error}</p>}
<button className="btn primary wfull mt14" disabled={busy || !names.some((n) => n.trim())}
onClick={async () => {
setBusy(true); setError("");
const res = await api("/api/setup", {
method: "POST",
body: JSON.stringify({ clubName, members: names.map((n) => n.trim()).filter(Boolean) }),
});
setBusy(false);
if (!res.ok) setError(String(res.data.error ?? "Could not set up the club")); else onDone();
}}>{busy ? "Setting up…" : "Open the club"}</button>
</div>
</div>
);
}

function ProblemScreen({ onDone }: { onDone: () => void }) {
return (
<div className="gate">
<div className="gate-card">
<h1>Album <em className="gold-i">Club</em></h1>
<p className="lede">Couldn&rsquo;t load the club just now.</p>
<button className="btn primary wfull mt14" onClick={onDone}>Try again</button>
</div>
</div>
);
}

function MemberScreen({ members, clubName, onDone }: { members: Member[]; clubName: string; onDone: () => void }) {
const [busy, setBusy] = useState(false);
return (
<div className="gate">
<div className="gate-card">
<p className="eyebrow mb12">{clubName}</p>
<h1>Who&rsquo;s this?</h1>
<p className="lede">Your scores and reviews get filed under this name. You can switch later.</p>
<div className="stack">
{members.map((m) => (
<button key={m.id} className="btn big" disabled={busy}
onClick={async () => {
setBusy(true);
await api("/api/me", { method: "POST", body: JSON.stringify({ memberId: m.id }) });
onDone();
}}>
<i className="pip" style={{ background: m.color }} />{m.name}
</button>
))}
</div>
{members.length === 0 && <p className="muted">No members yet — add them in the club settings.</p>}
</div>
</div>
);
}

/* -------------------------------- shell -------------------------------- */

export default function Page() {
const [wire, setWire] = useState<Wire | null>(null);
const [tab, setTab] = useState<Tab>(() =>
typeof window !== "undefined" && new URLSearchParams(window.location.search).has("code") ? "upcoming" : "month",
);
const [cursor, setCursor] = useState(thisMonth());
const [openAlbum, setOpenAlbum] = useState<string | null>(null);
const [adding, setAdding] = useState(false);

const load = useCallback(async () => {
const res = await api("/api/state");
setWire(res.data as Wire);
}, []);

useEffect(() => { load(); }, [load]);
useEffect(() => {
const onFocus = () => load();
window.addEventListener("focus", onFocus);
return () => window.removeEventListener("focus", onFocus);
}, [load]);

const state = wire && wire.ok ? (wire as State) : null;
const monthAlbums = useMemo(
() => (state ? state.albums.filter((a) => a.month === cursor) : []),
[state, cursor],
);
/* One album on screen at a time; the strip above switches between them. */
const shown = useMemo(
() => monthAlbums.find((a) => a.id === openAlbum) ?? monthAlbums[0] ?? null,
[monthAlbums, openAlbum],
);

/* The nudge follows the current month, not wherever the cursor is parked, so
   it can flag an unmade pick from any tab. */
const owesPick = Boolean(
state?.me && !state.albums.some((a) => a.month === state.currentMonth && a.chosenBy === state.me),
);

const scoredByMe = useMemo(() => {
if (!state) return 0;
return monthAlbums.filter((a) =>
state.ratings.some((r) => r.albumId === a.id && r.memberId === state.me && (r.score !== null || r.skipped)),
).length;
}, [state, monthAlbums]);

if (!wire) return <div className="gate"><p className="eyebrow">Loading…</p></div>;

if (!wire.ok && wire.dbError)
return (
<div className="gate">
<div className="gate-card">
<h1>Database unreachable</h1>
<p className="lede">The app found a database connection string but couldn&rsquo;t connect with it.</p>
<div className="notice"><code className="code">{wire.message}</code></div>
<button className="btn primary" onClick={load}>Try again</button>
</div>
</div>
);
if (!wire.ok && wire.needsSetup) return <SetupScreen onDone={load} />;
if (!wire.ok || !state) return <ProblemScreen onDone={load} />;
if (!state.me) return <MemberScreen members={state.members} clubName={state.clubName} onDone={load} />;

const meMember = state.members.find((m) => m.id === state.me);
const label = monthLabel(cursor);

return (
<div style={accentVars(meMember?.color)}>
<header className="topbar">
<div className="topbar-inner">
<div className="brand">
{state.clubName.replace(/\s*club\s*$/i, "")}<span className="dot"> Club</span>
</div>
<nav className="tabs" role="tablist">
{([["month", "This month"], ["upcoming", "Upcoming"], ["archive", "Archive"], ["table", "Leaderboard"], ["club", "Club"], ["admin", "Admin"]] as [Tab, string][]).map(
([id, text]) => (
<button key={id} className="tab" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
{text}
{id === "month" && owesPick && (
<i className="tab-dot" title="You haven't picked for this month" />
)}
</button>
),
)}
</nav>
<button className="whoami" onClick={() => setTab("club")}>
<i className="pip" style={{ background: meMember?.color ?? "var(--muted)" }} />
{meMember?.name ?? "Pick a name"}
</button>
</div>
</header>

<main className="shell">
{state.mode === "preview" && (
<div className="notice warn mt22">
<span className="badge">Preview</span>
<div>
<strong className="semi">No database attached yet.</strong> What you see is sample data, and
nothing you change here is kept. To make it real: open this project on Vercel →{" "}
<em>Storage</em> → <em>Create Database</em> → Neon (Postgres, free tier) → <em>Connect</em>.
Redeploy and the club sets itself up on the next load.
</div>
</div>
)}

{tab === "month" && (
<>
<div className="month-head">
<h1 className="month-title display">{label.name} <em>{label.year}</em></h1>
<div className="month-nav">
<button className="icon-btn" aria-label="Previous month" onClick={() => setCursor((c) => shiftMonth(c, -1))}>
<Chevron left />
</button>
<button className="icon-btn" aria-label="Next month" onClick={() => setCursor((c) => shiftMonth(c, 1))}>
<Chevron />
</button>
{cursor !== state.currentMonth && (
<button className="btn sm ghost" onClick={() => setCursor(state.currentMonth)}>Today</button>
)}
</div>
</div>

{owesPick && cursor === state.currentMonth && state.me && (
<PickPrompt month={state.currentMonth} members={state.members} me={state.me}
monthAlbums={monthAlbums} shortlist={state.myShortlist ?? []}
onAdd={() => setAdding(true)} onBrowse={() => setTab("upcoming")} onPicked={load} />
)}

<div className="month-meta">
<span className="eyebrow">{monthAlbums.length} {monthAlbums.length === 1 ? "album" : "albums"}</span>
{monthAlbums.length > 0 && (
<>
<span className="progress-track" aria-hidden="true">
<span className="progress-fill" style={{ width: `${(scoredByMe / monthAlbums.length) * 100}%` }} />
</span>
<span className="eyebrow">you&rsquo;ve done {scoredByMe} of {monthAlbums.length}</span>
</>
)}
<button className="btn sm right" onClick={() => setAdding(true)}><Plus /> Add album</button>
</div>

{monthAlbums.length === 0 ? (
owesPick && cursor === state.currentMonth ? null : (
<div className="empty">
<div className="display">Nothing picked for {label.name} yet</div>
<p className="mb22">Everyone puts one album in and you&rsquo;ve got the month to get through them.</p>
<button className="btn primary" onClick={() => setAdding(true)}>
<Plus /> Add the first one
</button>
</div>
)
) : (
<>
{monthAlbums.length > 1 && (
<div className="album-tabs" role="tablist">
{monthAlbums.map((a) => {
const mine = state.ratings.find((r) => r.albumId === a.id && r.memberId === state.me);
const done = Boolean(mine && (mine.score !== null || mine.skipped));
const by = state.members.find((m) => m.id === a.chosenBy);
return (
<button key={a.id} className="album-tab" role="tab" aria-selected={shown?.id === a.id}
style={accentVars(by?.color)}
onClick={() => setOpenAlbum(a.id)}>
<span className={`album-tab-dot${done ? " done" : ""}`}
title={done ? "You've scored this" : "You haven't scored this yet"} />
<Thumb album={a} size={34} />
<span className="album-tab-text">
<span className="album-tab-who">
{by ? `${by.name}${by.id === state.me ? " (you)" : ""}` : "Unclaimed"}
</span>
<span className="album-tab-title">{a.title}</span>
<span className="album-tab-sub">{a.artist}</span>
</span>
</button>
);
})}
</div>
)}
{shown && (
<AlbumCard key={shown.id} album={shown} members={state.members} ratings={state.ratings}
me={state.me} onChanged={load} />
)}
</>
)}
</>
)}

{tab === "upcoming" && (
<Upcoming currentMonth={state.currentMonth} onPicked={() => { load(); setTab("month"); }} />
)}

{tab === "archive" && (
<Archive albums={state.albums} members={state.members} ratings={state.ratings} currentMonth={state.currentMonth} />
)}
{tab === "table" && <Leaderboard albums={state.albums} members={state.members} ratings={state.ratings} />}
{tab === "admin" && (
<Admin albums={state.albums} members={state.members} ratings={state.ratings} onChanged={load} />
)}

{tab === "club" && (
<ClubSettings clubName={state.clubName} members={state.members} me={state.me}
albums={state.albums} onChanged={load} />
)}
</main>

{adding && (
<AlbumModal album={null} month={cursor} members={state.members} me={state.me}
onClose={() => setAdding(false)} onSaved={load} />
)}
</div>
);
}
