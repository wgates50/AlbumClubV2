"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fallbackArt } from "./lib/art";
import {
  completeAuth as completeSpotify, fetchArtistsFromPlaylists as spotifyArtistsFromPlaylists,
  fetchFollowedArtists, fetchPlaylists as spotifyPlaylists, fetchReleases,
  redirectUri as spotifyRedirect, startAuth as startSpotify,
  type Playlist, type Release, type SpotifyArtist,
} from "./lib/spotify";
import {
  GOOGLE_CLIENT_ID, completeAuth as completeYouTube,
  fetchArtistsFromPlaylists as youtubeArtistsFromPlaylists,
  fetchPlaylists as youtubePlaylists, redirectUri as youtubeRedirect,
  startAuth as startYouTube,
} from "./lib/youtube";
import { fetchRecent, fetchUpcoming, matchToArtists } from "./lib/musicbrainz";

type Service = "spotify" | "youtube";
type Tracked = { id: string; name: string; imageUrl: string | null; source: string; excluded: boolean };
type ShortlistItem = {
  id: string; month: string; title: string; artist: string;
  releaseDate: string | null; artUrl: string | null; spotifyUrl: string | null; source: string | null;
};
type Wire = {
  ok: true; connected: boolean; service: Service | null; scannedAt: string | null;
  playlistIds: string[]; artists: Tracked[]; shortlist: ShortlistItem[];
};

type Props = { currentMonth: string; onPicked: () => void };
type View = "releases" | "shortlist" | "artists";
type Filter = "all" | "upcoming" | "recent" | "albums" | "singles";
const FILTERS: [Filter, string][] = [
  ["all", "All"], ["upcoming", "Announced"], ["recent", "Recent"],
  ["albums", "Albums"], ["singles", "Singles"],
];

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

const releaseMonth = (r: Release) =>
  `${r.date.getFullYear()}-${String(r.date.getMonth() + 1).padStart(2, "0")}`;

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
   — offline, blocked, or the service down. None of that is worth showing raw. */
function humanError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "Couldn't reach the music service just now — check your connection and try Refresh.";
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
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const refreshed = useRef(false);

  const load = useCallback(async () => {
    const res = await call("/api/upcoming");
    if (res.ok) setWire(res.data as unknown as Wire);
    return res.data as unknown as Wire;
  }, []);

  /* Refresh releases for the artists already on file — the "open the tab" path,
     which needs no rescan. Spotify reports its own catalogue and MusicBrainz
     adds what has been announced; for YouTube there is no release API at all,
     so MusicBrainz covers both directions. */
  const refreshReleases = useCallback(async (artists: Tracked[], service: Service) => {
    const live = artists.filter((a) => !a.excluded);
    if (!live.length) { setBusy(""); return; }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError("");

    const asArtists: SpotifyArtist[] = live.map((a) => ({
      id: a.id, name: a.name, imageUrl: a.imageUrl, source: a.source,
    }));

    try {
      let base: Release[] = [];
      if (service === "spotify") {
        setBusy("Checking Spotify for new releases…");
        base = await fetchReleases(asArtists, (done, total) =>
          setBusy(`Checking Spotify… ${done}/${total} artists`),
        );
        if (controller.signal.aborted) return;
        setReleases(base);
      } else {
        setBusy("Looking up recent releases…");
        const recent = await fetchRecent(asArtists, controller.signal, (b, t) =>
          setBusy(`Recent releases… batch ${b}/${t}`),
        );
        if (controller.signal.aborted) return;
        base = matchToArtists(recent, asArtists, [], false);
        setReleases(base);
      }

      setBusy("Asking MusicBrainz about announced records…");
      const groups = await fetchUpcoming(asArtists, controller.signal, (b, t) =>
        setBusy(`MusicBrainz… batch ${b}/${t}`),
      );
      if (controller.signal.aborted) return;
      const extra = matchToArtists(groups, asArtists, base, true);
      setReleases([...base, ...extra].sort((a, b) => a.date.getTime() - b.date.getTime()));
      setNote(extra.length ? `${extra.length} more found via MusicBrainz` : "");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError(humanError(err, "Couldn't load releases"));
    } finally {
      if (!controller.signal.aborted) setBusy("");
    }
  }, []);

  /* Both services offer a playlist pick. For Spotify it is optional extra on
     top of who you follow; for YouTube it is the only way to know anything,
     since it publishes no following list. Previous choices come back ticked. */
  const openPicker = useCallback(async (service: Service) => {
    setError("");
    try {
      setBusy("Loading your playlists…");
      const lists = service === "youtube" ? await youtubePlaylists() : await spotifyPlaylists();
      const known = new Set(lists.map((l) => l.id));
      setChosen(new Set((wire?.playlistIds ?? []).filter((id) => known.has(id))));
      setPlaylists(lists);
    } catch (err) {
      setError(humanError(err, "Couldn't load your playlists"));
    } finally {
      setBusy("");
    }
  }, [wire]);

  /* On mount: finish an OAuth return if that is why we are here, then load what
     is on file and refresh it once. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (new URLSearchParams(window.location.search).has("code")) {
          const service = sessionStorage.getItem("auth_service");
          setBusy("Finishing the connection…");
          if (service === "youtube") await completeYouTube();
          else await completeSpotify();
        }
      } catch (err) {
        setError(humanError(err, "Connection failed"));
      }
      const w = await load();
      if (cancelled || !w?.ok) { setBusy(""); return; }
      if (w.connected && w.artists.length && w.service && !refreshed.current) {
        refreshed.current = true;
        await refreshReleases(w.artists, w.service);
      } else if (w.connected && !w.artists.length && w.service && !refreshed.current) {
        refreshed.current = true;
        await openPicker(w.service);
      } else {
        setBusy("");
      }
    })();
    return () => { cancelled = true; abort.current?.abort(); };
  }, [load, refreshReleases, openPicker]);

  const saveArtists = useCallback(async (artists: SpotifyArtist[], service: Service, playlistIds: string[]) => {
    if (!artists.length) {
      setError(service === "spotify"
        ? "Spotify returned no artists — follow a few, then try again."
        : "No artists could be read from those playlists.");
      setBusy("");
      return;
    }
    setBusy(`Saving ${artists.length} artists…`);
    const saved = await call("/api/upcoming", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ artists, playlistIds }),
    });
    if (!saved.ok) throw new Error(String(saved.data.error ?? "Couldn't save your artists"));
    const w = await load();
    await refreshReleases((w?.artists ?? []) as Tracked[], service);
  }, [load, refreshReleases]);

  const rescan = useCallback(() => { void openPicker(wire?.service ?? "spotify"); }, [openPicker, wire]);

  const scanPlaylists = useCallback(async (ids: string[]) => {
    const service = wire?.service ?? "spotify";
    setPlaylists(null);
    try {
      let artists: SpotifyArtist[];
      if (service === "youtube") {
        setBusy("Reading those playlists…");
        artists = await youtubeArtistsFromPlaylists(ids, (m) => setBusy(m));
      } else {
        setBusy("Reading your Spotify library…");
        const followed = await fetchFollowedArtists((m) => setBusy(m));
        const fromLists = ids.length ? await spotifyArtistsFromPlaylists(ids, (m) => setBusy(m)) : [];
        const merged = new Map(followed.map((a) => [a.id, a]));
        for (const a of fromLists) if (!merged.has(a.id)) merged.set(a.id, a);
        artists = Array.from(merged.values());
      }
      await saveArtists(artists, service, ids);
    } catch (err) {
      setError(humanError(err, "Couldn't read those playlists"));
      setBusy("");
    }
  }, [wire, saveArtists]);

  const excludedIds = useMemo(
    () => new Set((wire?.artists ?? []).filter((a) => a.excluded).map((a) => a.id)),
    [wire],
  );

  const unhidden = useMemo(
    () => releases.filter((r) => !r.artistIds.some((id) => excludedIds.has(id))),
    [releases, excludedIds],
  );

  const visible = useMemo(() => {
    switch (filter) {
      case "upcoming": return unhidden.filter((r) => r.isUpcoming);
      case "recent": return unhidden.filter((r) => !r.isUpcoming);
      case "albums": return unhidden.filter((r) => r.albumType === "album");
      case "singles": return unhidden.filter((r) => r.albumType === "single");
      default: return unhidden;
    }
  }, [unhidden, filter]);

  /* Artists are listed busiest-first, the way the original ordered them. */
  const artistRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of unhidden) for (const id of r.artistIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    const q = search.trim().toLowerCase();
    const all = (wire?.artists ?? []).map((a) => ({ ...a, releaseCount: counts.get(a.id) ?? 0 }));
    return {
      active: all.filter((a) => !a.excluded && (!q || a.name.toLowerCase().includes(q)))
        .sort((x, y) => y.releaseCount - x.releaseCount),
      hidden: all.filter((a) => a.excluded),
      activeTotal: all.filter((a) => !a.excluded).length,
    };
  }, [wire, unhidden, search]);

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
      method: "POST", headers: { "content-type": "application/json" },
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
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ promote: item.id, month: item.month }),
    });
    if (!res.ok) { setError(String(res.data.error ?? "Couldn't make that your pick")); return; }
    await load();
    onPicked();
  }, [load, onPicked]);

  const toggleArtist = useCallback(async (id: string, excluded: boolean) => {
    const res = await call("/api/upcoming", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ artistId: id, excluded }),
    });
    if (res.ok) setWire((p) => (p ? { ...p, artists: res.data.artists as Tracked[] } : p));
  }, []);

  const disconnect = useCallback(async () => {
    await call(`/api/${wire?.service === "youtube" ? "youtube" : "spotify"}`, { method: "DELETE" });
    setReleases([]);
    refreshed.current = false;
    await load();
  }, [wire, load]);

  if (!wire) return <p className="up-empty">Loading…</p>;

  if (!wire.connected) {
    const redirect = typeof window === "undefined" ? "" : spotifyRedirect();
    const googleRedirect = typeof window === "undefined" ? "" : youtubeRedirect();
    return (
      <div className="up-connect">
        <p className="eyebrow mb12">Upcoming</p>
        <h2>What&rsquo;s coming out</h2>
        <p className="lede">
          Connect the service you actually listen on and this fills with records your artists
          have announced. It&rsquo;s yours alone — everyone in the club connects their own.
        </p>
        {error && <p className="error">{error}</p>}
        <div className="flex gap10 wrap">
          <button className="btn primary" disabled={Boolean(busy)}
            onClick={() => { setError(""); startSpotify().catch((e) => setError(humanError(e, "Couldn't open Spotify"))); }}>
            {busy || "Connect Spotify"}
          </button>
          <button className="btn" disabled={Boolean(busy) || !GOOGLE_CLIENT_ID}
            onClick={() => { setError(""); startYouTube().catch((e) => setError(humanError(e, "Couldn't open YouTube"))); }}>
            Connect YouTube Music
          </button>
        </div>
        {!GOOGLE_CLIENT_ID && (
          <p className="muted up-note">
            YouTube Music needs NEXT_PUBLIC_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set on the
            deployment before it can be offered.
          </p>
        )}
        <details className="more up-help">
          <summary>Told the redirect URI doesn&rsquo;t match?</summary>
          <p className="muted">
            Both services only allow sign-ins that come back to an address you have registered,
            and they compare it character for character. Add this exact line to the app&rsquo;s
            redirect URIs, then save:
          </p>
          <code className="code up-uri">{redirect}</code>
          {googleRedirect !== redirect && <code className="code up-uri">{googleRedirect}</code>}
          <p className="muted">
            If the service stored it with a trailing slash, set NEXT_PUBLIC_SPOTIFY_REDIRECT_URI
            (or NEXT_PUBLIC_GOOGLE_REDIRECT_URI) to the exact string it holds and redeploy.
          </p>
        </details>
      </div>
    );
  }

  if (playlists) {
    const isYouTube = wire.service === "youtube";
    return (
      <div className="up-connect up-picker">
        <p className="eyebrow mb12">{isYouTube ? "YouTube Music" : "Spotify"}</p>
        <h2>Which playlists?</h2>
        <p className="lede">
          {isYouTube
            ? "YouTube doesn't publish who you follow, so the artists in the playlists you pick are the ones tracked."
            : "Your followed and most-played artists are tracked either way. Pick playlists to pull in anyone else you listen to."}
        </p>
        <div className="flex gap10 wrap mb16">
          <button className="btn sm ghost" onClick={() => setChosen(new Set(playlists.map((pl) => pl.id)))}>Select all</button>
          <button className="btn sm ghost" onClick={() => setChosen(new Set())}>Select none</button>
        </div>
        <div className="up-artists">
          {playlists.map((pl) => (
            <label className="up-artist-row" key={pl.id}>
              <input type="checkbox" checked={chosen.has(pl.id)}
                onChange={(e) => setChosen((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(pl.id); else next.delete(pl.id);
                  return next;
                })} />
              <span className="up-artist-name">{pl.name}</span>
              <span className="up-when">{pl.trackCount}</span>
            </label>
          ))}
        </div>
        {!playlists.length && <p className="up-empty">No playlists on this account.</p>}
        <div className="flex gap10 wrap up-disconnect">
          <button className="btn primary" disabled={isYouTube && !chosen.size}
            onClick={() => scanPlaylists([...chosen])}>
            {chosen.size ? `Read ${chosen.size} playlist${chosen.size === 1 ? "" : "s"}` : "Scan"}
          </button>
          {!isYouTube && (
            <button className="btn ghost" onClick={() => scanPlaylists([])}>
              Skip — just my artists
            </button>
          )}
          {wire.artists.length > 0 && (
            <button className="btn ghost" onClick={() => setPlaylists(null)}>Cancel</button>
          )}
        </div>
      </div>
    );
  }

  const shortlist = wire.shortlist ?? [];
  const byMonth = new Map<string, ShortlistItem[]>();
  for (const s of shortlist) {
    if (!byMonth.has(s.month)) byMonth.set(s.month, []);
    byMonth.get(s.month)!.push(s);
  }
  const serviceName = wire.service === "youtube" ? "YouTube Music" : "Spotify";

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
          <button className="btn sm" disabled={Boolean(busy)}
            onClick={() => refreshReleases(wire.artists, wire.service ?? "spotify")}>
            {busy ? "Working…" : "Refresh"}
          </button>
          <button className="btn sm ghost" disabled={Boolean(busy)} onClick={rescan}>
            Rescan
          </button>
        </div>
      </div>

      {busy && <div className="up-busy"><span className="up-bar" />{busy}</div>}
      {error && <p className="error">{error}</p>}
      {!busy && note && <p className="muted up-note">{note}</p>}

      {view === "releases" && (
        <>
          <div className="up-stats">
            <span><b>{unhidden.length}</b> releases</span>
            <span><b>{unhidden.filter((r) => r.isUpcoming).length}</b> announced</span>
            <span><b>{artistRows.activeTotal}</b> artists</span>
          </div>
          <div className="up-filters">
            {FILTERS.map(([f, label]) => (
              <button key={f} className="up-filter" aria-selected={filter === f} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
          </div>
          {!visible.length && !busy && (
            <p className="up-empty">
              {filter === "upcoming"
                ? "Nothing announced yet. Hit Refresh, or check back — labels announce late."
                : "Nothing matches this filter."}
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
            {wire.scannedAt ? `Read from ${serviceName} on ${new Date(wire.scannedAt).toLocaleDateString("en-GB")}.` : "Not scanned yet."}
            {" "}Muting an artist hides their releases without losing them.
          </p>
          <input type="text" className="up-search" placeholder="Search artists…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <p className="muted up-note">
            Tracking {artistRows.activeTotal} artist{artistRows.activeTotal === 1 ? "" : "s"}
            {artistRows.hidden.length > 0 && ` · ${artistRows.hidden.length} muted`}
          </p>
          <div className="up-artists">
            {artistRows.active.map((a) => (
              <div className="up-artist-row" key={a.id}>
                <Art url={a.imageUrl} seed={a.name} alt={a.name} />
                <span className="up-artist-name">{a.name}</span>
                {a.releaseCount > 0 && <span className="up-when">{a.releaseCount}</span>}
                <button className="btn sm ghost" onClick={() => toggleArtist(a.id, true)}>Mute</button>
              </div>
            ))}
          </div>
          {!artistRows.active.length && <p className="up-empty">No artists match that.</p>}
          {artistRows.hidden.length > 0 && (
            <details className="more" open={showHidden}
              onToggle={(e) => setShowHidden((e.currentTarget as HTMLDetailsElement).open)}>
              <summary>{artistRows.hidden.length} muted artist{artistRows.hidden.length === 1 ? "" : "s"}</summary>
              <div className="up-artists">
                {artistRows.hidden.map((a) => (
                  <div className="up-artist-row muted-row" key={a.id}>
                    <Art url={a.imageUrl} seed={a.name} alt={a.name} />
                    <span className="up-artist-name">{a.name}</span>
                    <button className="btn sm ghost" onClick={() => toggleArtist(a.id, false)}>Unmute</button>
                  </div>
                ))}
              </div>
            </details>
          )}
          <div className="up-disconnect">
            <button className="btn sm ghost" onClick={disconnect}>Disconnect {serviceName}</button>
          </div>
        </>
      )}
    </div>
  );
}
