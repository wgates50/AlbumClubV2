"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fallbackArt } from "./lib/art";
import {
  completeAuth, fetchFollowedArtists, fetchReleases, startAuth,
  type Release, type SpotifyArtist,
} from "./lib/spotify";
import { fetchUpcoming, matchToArtists } from "./lib/musicbrainz";

type Tracked = { id: string; name: string; imageUrl: string | null; source: string; excluded: boolean };
type ShortlistItem = {
  id: string; month: string; title: string; artist: string;
  releaseDate: string | null; artUrl: string | null; spotifyUrl: string | null; source: string | null;
};
type Wire = { ok: true; connected: boolean; service: string | null; scannedAt: string | null; artists: Tracked[]; shortlist: ShortlistItem[] };

type Props = { currentMonth: string; onPicked: () => void };
type View = "releases" | "shortlist" | "artists";
type Filter = "upcoming" | "recent";

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

function releaseMonth(r: Release): string {
  return `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;
}

function dateLabel(r: Release): string {
  if (r.precision === "year") return r.date.getFullYear().toString();
  if (r.precision === "month") return r.date.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return r.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function whenLabel(r: Release): string {
  const days = Math.round((r.date.getTime() - Date.now()) / 86400000);
  if (days === 0) return "Out today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 0) return `In ${days} day${days === 1 ? "" : "s"}`;
  return `${Math.abs(days)} days ago`;
}

/* "Failed to fetch" is what the browser says when it cannot reach a host at all
   — offline, blocked, or Spotify down. None of that is worth showing raw. */
function humanError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Couldn't reach Spotify just now — check your connection and try Refresh.";
  }
  return msg || fallback;
}

function formatDay(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr.length === 7 ? `${dateStr}-01` : dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return dateStr.length === 7
    ? d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

function Art({ url, seed, alt }: { url: string | null; seed: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  const show = Boolean(url) && !broken;
  return (
    <div className="up-art" style={show ? undefined : { background: fallbackArt(seed) }}>
      {show && <img src={url!} alt={alt} loading="lazy" onError={() => setBroken(true)} />}
    </div>
  );
}

export default function Upcoming({ currentMonth, onPicked }: Props) {
  const [wire, setWire] = useState<Wire | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [view, setView] = useState<View>("releases");
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const abort = useRef<AbortController | null>(null);
  const refreshed = useRef(false);

  const load = useCallback(async () => {
    const res = await call("/api/upcoming");
    if (res.ok) setWire(res.data as unknown as Wire);
    return res.data as unknown as Wire;
  }, []);

  /* Pull releases for the artists we already have on file. This is the
     "refresh on login" path — it needs no rescan of the Spotify library. */
  const refreshReleases = useCallback(async (artists: Tracked[]) => {
    const live = artists.filter((a) => !a.excluded);
    if (!live.length) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError("");

    try {
      setBusy("Checking Spotify for new releases…");
      const spotifyArtists: SpotifyArtist[] = live.map((a) => ({
        id: a.id, name: a.name, imageUrl: a.imageUrl, source: a.source,
      }));
      const fromSpotify = await fetchReleases(spotifyArtists, (done, total) =>
        setBusy(`Checking Spotify… ${done}/${total} artists`),
      );
      if (controller.signal.aborted) return;
      setReleases(fromSpotify);

      setBusy("Asking MusicBrainz about announced records…");
      const groups = await fetchUpcoming(spotifyArtists, controller.signal, (b, t) =>
        setBusy(`MusicBrainz… batch ${b}/${t}`),
      );
      if (controller.signal.aborted) return;
      const extra = matchToArtists(groups, spotifyArtists, fromSpotify);
      setReleases([...fromSpotify, ...extra].sort((a, b) => a.date.getTime() - b.date.getTime()));
      setNote(extra.length ? `${extra.length} more found via MusicBrainz` : "");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError(humanError(err, "Couldn't load releases"));
    } finally {
      if (!controller.signal.aborted) setBusy("");
    }
  }, []);

  /* On mount: finish an OAuth return if that is why we are here, then load
     what is on file and refresh it once. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (new URLSearchParams(window.location.search).has("code")) {
          setBusy("Finishing the Spotify connection…");
          await completeAuth();
        }
      } catch (err) {
        setError(humanError(err, "Spotify connection failed"));
      }
      const w = await load();
      if (cancelled || !w?.ok) { setBusy(""); return; }
      if (w.connected && w.artists.length && !refreshed.current) {
        refreshed.current = true;
        await refreshReleases(w.artists);
      } else {
        setBusy("");
      }
    })();
    return () => { cancelled = true; abort.current?.abort(); };
  }, [load, refreshReleases]);

  /* A full rescan re-reads the Spotify library itself, then the releases. */
  const rescan = useCallback(async () => {
    setError("");
    try {
      setBusy("Reading your Spotify library…");
      const artists = await fetchFollowedArtists((m) => setBusy(m));
      if (!artists.length) {
        setError("Spotify returned no artists — follow a few, then try again.");
        setBusy("");
        return;
      }
      setBusy(`Saving ${artists.length} artists…`);
      const saved = await call("/api/upcoming", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artists }),
      });
      if (!saved.ok) throw new Error(String(saved.data.error ?? "Couldn't save your artists"));
      const w = await load();
      await refreshReleases((w?.artists ?? []) as Tracked[]);
    } catch (err) {
      setError(humanError(err, "Couldn't read your Spotify library"));
      setBusy("");
    }
  }, [load, refreshReleases]);

  const excludedIds = useMemo(
    () => new Set((wire?.artists ?? []).filter((a) => a.excluded).map((a) => a.id)),
    [wire],
  );

  const visible = useMemo(() => {
    const shown = releases.filter((r) => !r.artistIds.some((id) => excludedIds.has(id)));
    return shown.filter((r) => (filter === "upcoming" ? r.isUpcoming : !r.isUpcoming));
  }, [releases, excludedIds, filter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Release[]>();
    for (const r of visible) {
      const key = dateLabel(r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    return Array.from(groups.entries());
  }, [visible]);

  const shortlisted = useMemo(
    () => new Set((wire?.shortlist ?? []).map((s) => `${s.title.toLowerCase()}::${s.artist.toLowerCase()}`)),
    [wire],
  );

  const addToShortlist = useCallback(async (r: Release) => {
    const month = r.isUpcoming ? releaseMonth(r) : currentMonth;
    const res = await call("/api/shortlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        month, title: r.title, artist: r.artist, releaseDate: r.releaseDate,
        artUrl: r.artUrl, spotifyUrl: r.url, source: r.source,
      }),
    });
    if (res.ok) setWire((p) => (p ? { ...p, shortlist: res.data.shortlist as ShortlistItem[] } : p));
    else setError(String(res.data.error ?? "Couldn't add that"));
  }, [currentMonth]);

  const removeFromShortlist = useCallback(async (id: string) => {
    const res = await call(`/api/shortlist?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setWire((p) => (p ? { ...p, shortlist: res.data.shortlist as ShortlistItem[] } : p));
  }, []);

  const promote = useCallback(async (item: ShortlistItem) => {
    const res = await call("/api/shortlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ promote: item.id, month: item.month }),
    });
    if (!res.ok) { setError(String(res.data.error ?? "Couldn't make that your pick")); return; }
    await load();
    onPicked();
  }, [load, onPicked]);

  const toggleArtist = useCallback(async (id: string, excluded: boolean) => {
    const res = await call("/api/upcoming", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artistId: id, excluded }),
    });
    if (res.ok) setWire((p) => (p ? { ...p, artists: res.data.artists as Tracked[] } : p));
  }, []);

  const disconnect = useCallback(async () => {
    await call("/api/spotify", { method: "DELETE" });
    setReleases([]);
    refreshed.current = false;
    await load();
  }, [load]);

  if (!wire) return <p className="up-empty">Loading…</p>;

  if (!wire.connected) {
    return (
      <div className="up-connect">
        <p className="eyebrow mb12">Upcoming</p>
        <h2>What&rsquo;s coming out</h2>
        <p className="lede">
          Connect Spotify and this fills with records your artists have announced. It&rsquo;s yours
          alone — everyone in the club connects their own.
        </p>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={Boolean(busy)} onClick={() => { setError(""); startAuth().catch((e) => setError(String(e))); }}>
          {busy || "Connect Spotify"}
        </button>
      </div>
    );
  }

  const shortlist = wire.shortlist ?? [];
  const byMonth = new Map<string, ShortlistItem[]>();
  for (const s of shortlist) {
    if (!byMonth.has(s.month)) byMonth.set(s.month, []);
    byMonth.get(s.month)!.push(s);
  }

  return (
    <div className="up">
      <div className="up-head">
        <div className="up-views">
          {(["releases", "shortlist", "artists"] as View[]).map((v) => (
            <button key={v} className="up-view" aria-selected={view === v} onClick={() => setView(v)}>
              {v === "releases" ? "Releases" : v === "shortlist" ? `Shortlist${shortlist.length ? ` (${shortlist.length})` : ""}` : `Artists (${wire.artists.length})`}
            </button>
          ))}
        </div>
        <div className="up-actions">
          <button className="btn sm" disabled={Boolean(busy)} onClick={() => refreshReleases(wire.artists)}>
            {busy ? "Working…" : "Refresh"}
          </button>
          <button className="btn sm ghost" disabled={Boolean(busy)} onClick={rescan}>Rescan library</button>
        </div>
      </div>

      {busy && <div className="up-busy"><span className="up-bar" />{busy}</div>}
      {error && <p className="error">{error}</p>}
      {!busy && note && <p className="muted up-note">{note}</p>}

      {view === "releases" && (
        <>
          <div className="up-filters">
            {(["upcoming", "recent"] as Filter[]).map((f) => (
              <button key={f} className="up-filter" aria-selected={filter === f} onClick={() => setFilter(f)}>
                {f === "upcoming" ? "Announced" : "Last 6 months"}
              </button>
            ))}
          </div>
          {!visible.length && !busy && (
            <p className="up-empty">
              {filter === "upcoming"
                ? "Nothing announced yet. Hit Refresh, or check back — labels announce late."
                : "Nothing out in the last six months from your artists."}
            </p>
          )}
          {grouped.map(([label, items]) => (
            <section className="up-group" key={label}>
              <p className="up-group-date">{label}</p>
              {items.map((r) => {
                const already = shortlisted.has(`${r.title.toLowerCase()}::${r.artist.toLowerCase()}`);
                return (
                  <article className="up-row" key={r.id}>
                    <Art url={r.artUrl} seed={r.artist + r.title} alt={`${r.title} by ${r.artist}`} />
                    <div className="up-row-body">
                      <p className="up-title">{r.title}</p>
                      <p className="up-artist">{r.artist}</p>
                      <div className="up-meta">
                        <span className="up-pill">{r.albumType}</span>
                        {r.source === "musicbrainz" && <span className="up-pill soft">MusicBrainz</span>}
                        <span className="up-when">{whenLabel(r)}</span>
                      </div>
                    </div>
                    <div className="up-row-actions">
                      <button className="btn sm" disabled={already} onClick={() => addToShortlist(r)}>
                        {already ? "Shortlisted" : "Shortlist"}
                      </button>
                      {r.url && <a className="btn sm ghost" href={r.url} target="_blank" rel="noopener noreferrer">Open</a>}
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </>
      )}

      {view === "shortlist" && (
        <>
          {!shortlist.length && (
            <p className="up-empty">
              Nothing shortlisted. Add records from Releases and they&rsquo;ll gather here by month,
              ready to become your pick.
            </p>
          )}
          {Array.from(byMonth.entries()).sort().map(([month, items]) => (
            <section className="up-group" key={month}>
              <p className="up-group-date">{monthLabel(month)}</p>
              {items.map((s) => (
                <article className="up-row" key={s.id}>
                  <Art url={s.artUrl} seed={s.artist + s.title} alt={`${s.title} by ${s.artist}`} />
                  <div className="up-row-body">
                    <p className="up-title">{s.title}</p>
                    <p className="up-artist">{s.artist}</p>
                    {s.releaseDate && <div className="up-meta"><span className="up-when">{formatDay(s.releaseDate)}</span></div>}
                  </div>
                  <div className="up-row-actions">
                    <button className="btn sm primary" onClick={() => promote(s)}>Make this my pick</button>
                    <button className="btn sm ghost" onClick={() => removeFromShortlist(s.id)}>Remove</button>
                  </div>
                </article>
              ))}
            </section>
          ))}
        </>
      )}

      {view === "artists" && (
        <>
          <p className="muted up-note">
            {wire.scannedAt ? `Library last read ${new Date(wire.scannedAt).toLocaleDateString("en-GB")}.` : "Not scanned yet."}
            {" "}Muting an artist hides their releases without losing them.
          </p>
          <div className="up-artists">
            {wire.artists.map((a) => (
              <div className={`up-artist-row${a.excluded ? " muted-row" : ""}`} key={a.id}>
                <Art url={a.imageUrl} seed={a.name} alt={a.name} />
                <span className="up-artist-name">{a.name}</span>
                <button className="btn sm ghost" onClick={() => toggleArtist(a.id, !a.excluded)}>
                  {a.excluded ? "Unmute" : "Mute"}
                </button>
              </div>
            ))}
          </div>
          <div className="up-disconnect">
            <button className="btn sm ghost" onClick={disconnect}>Disconnect Spotify</button>
          </div>
        </>
      )}
    </div>
  );
}
