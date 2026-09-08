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
type StoredRelease = {
  id: string; title: string; artist: string; artistIds: string[];
  releaseDate: string; sortDate: string; precision: string; albumType: string;
  artUrl: string | null; url: string | null; source: string;
};
type Wire = {
  ok: true; connected: boolean; service: Service | null; scannedAt: string | null;
  refreshedAt: string | null; playlistIds: string[]; artists: Tracked[];
  shortlist: ShortlistItem[]; releases: StoredRelease[];
};

type Props = { currentMonth: string; onPicked: () => void };
type View = "releases" | "shortlist" | "artists";
type Filter = "all" | "upcoming" | "recent" | "albums" | "singles";
const FILTERS: [Filter, string][] = [
  ["all", "All"], ["upcoming", "Announced"], ["recent", "Recent"],
  ["albums", "Albums"], ["singles", "Singles"],
];

/* Labels announce on their own schedule; six hours is plenty often to catch up
   and rare enough that opening the tab is normally instant. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

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
    return "Couldn't reach the music service just now — check your connection and try again.";
  }
  return msg || fallback;
}

function agoLabel(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatDay(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr.length === 7 ? `${dateStr}-01` : dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return dateStr.length === 7
    ? d.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* "Upcoming" is never carried across the wire: it is true only until the date
   passes, so a stored flag would quietly rot. Derive it on the way in. */
function hydrate(r: StoredRelease): Release {
  const date = new Date(`${r.sortDate}T00:00:00`);
  return {
    id: r.id, title: r.title, artist: r.artist, artistIds: r.artistIds,
    releaseDate: r.releaseDate,
    precision: (r.precision === "month" || r.precision === "year" ? r.precision : "day") as Release["precision"],
    date, isUpcoming: date.getTime() > Date.now(),
    albumType: r.albumType, artUrl: r.artUrl, url: r.url,
    source: (r.source === "musicbrainz" ? "musicbrainz" : "spotify") as Release["source"],
  };
}
const dehydrate = (r: Release): StoredRelease => ({
  id: r.id, title: r.title, artist: r.artist, artistIds: r.artistIds,
  releaseDate: r.releaseDate, sortDate: r.date.toISOString().slice(0, 10),
  precision: r.precision, albumType: r.albumType,
  artUrl: r.artUrl, url: r.url, source: r.source,
});

/* A scan only ever looks forward, so anything it does not mention is still
   good and stays. Where both have a record, the fresh one wins. */
function mergeReleases(held: Release[], found: Release[]): Release[] {
  const by = new Map(held.map((r) => [r.id, r]));
  for (const r of found) by.set(r.id, r);
  const now = Date.now();
  return [...by.values()]
    .map((r) => ({ ...r, isUpcoming: r.date.getTime() > now }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
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
  const [resetting, setResetting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [dropShortlist, setDropShortlist] = useState(false);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [libraryNote, setLibraryNote] = useState("");
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const refreshed = useRef(false);

  const load = useCallback(async () => {
    const res = await call("/api/upcoming");
    const w = res.data as unknown as Wire;
    if (res.ok) {
      setWire(w);
      /* Straight onto the screen. A scan, if one is even due, tops this up
         behind it rather than replacing an empty page. */
      setReleases((w.releases ?? []).map(hydrate));
    }
    return w;
  }, []);

  /* Refresh releases for the artists already on file — the "open the tab" path,
     which needs no rescan. Spotify reports its own catalogue and MusicBrainz
     adds what has been announced; for YouTube there is no release API at all,
     so MusicBrainz covers both directions. */
  const refreshReleases = useCallback(async (
    artists: Tracked[], service: Service, held: Release[] = [], since: Date | null = null,
  ) => {
    const live = artists.filter((a) => !a.excluded);
    if (!live.length) { setBusy(""); return; }
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError("");

    const asArtists: SpotifyArtist[] = live.map((a) => ({
      id: a.id, name: a.name, imageUrl: a.imageUrl, source: a.source,
    }));
    let partialNote = "";
    /* One way to bank a set of releases, used by the instalments, by a scan
       that stops early, and at the end — so "what it found is saved" is true
       whenever it is said. */
    const bank = async (list: Release[]) => {
      if (controller.signal.aborted) return;
      const saved = await call("/api/upcoming", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ releases: list.map(dehydrate) }),
      });
      if (saved.ok) setWire((prev) => (prev ? { ...prev, refreshedAt: new Date().toISOString() } : prev));
    };

    try {
      let base = held;
      if (service === "spotify") {
        setBusy("Checking Spotify for new releases…");
        const scan = await fetchReleases(
          asArtists,
          (done, total) => setBusy(`Checking Spotify… ${done} of ${total} artists`),
          controller.signal,
          /* Each instalment goes straight to the screen and to the server, so a
             long scan is useful before it finishes and survives being cut off. */
          (partial) => {
            const soFar = mergeReleases(held, partial);
            setReleases(soFar);
            void bank(soFar);
          },
        );
        if (controller.signal.aborted) return;
        base = mergeReleases(held, scan.releases);
        setReleases(base);
        if (scan.scanned < scan.total) {
          /* Banked here rather than at the end: MusicBrainz still has a minute
             of work to do and may fail, and this much is already worth having. */
          await bank(base);
          partialNote = scan.rateLimited
            ? `Spotify stopped us after ${scan.scanned} of ${scan.total} artists — it limits how fast anyone can ask. What it gave us is saved; try again in a few minutes for the rest.`
            : `Stopped at ${scan.scanned} of ${scan.total} artists. What it found is saved.`;
        }
      } else {
        setBusy("Looking up recent releases…");
        const recent = await fetchRecent(asArtists, controller.signal, (b, t) =>
          setBusy(`Recent releases… batch ${b}/${t}`), since,
        );
        if (controller.signal.aborted) return;
        base = mergeReleases(held, matchToArtists(recent, asArtists, held, false));
        setReleases(base);
      }

      setBusy("Asking MusicBrainz about announced records…");
      const groups = await fetchUpcoming(asArtists, controller.signal, (b, t) =>
        setBusy(`MusicBrainz… batch ${b}/${t}`),
      );
      if (controller.signal.aborted) return;
      const extra = matchToArtists(groups, asArtists, base, true);
      const all = mergeReleases(base, extra);
      setReleases(all);
      const found = extra.length ? `${extra.length} more found via MusicBrainz` : "";
      setNote([partialNote, found].filter(Boolean).join(" "));

      /* Banked, so the next visit opens on this instead of running it again —
         unless this scan has since been abandoned, in which case writing now
         would undo whatever abandoned it. */
      await bank(all);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      if (partialNote) setNote(partialNote);
      setError(humanError(err, "Couldn't load releases"));
    } finally {
      if (!controller.signal.aborted) setBusy("");
    }
  }, []);

  /* Both services offer a playlist pick. For Spotify it is optional extra on
     top of who you follow; for YouTube it is the only way to know anything,
     since it publishes no following list. Previous choices come back ticked. */
  const openPicker = useCallback(async (service: Service, savedIds: string[] = []) => {
    setError("");
    try {
      setBusy("Loading your playlists…");
      const lists = service === "youtube" ? await youtubePlaylists() : await spotifyPlaylists();
      const known = new Set(lists.map((l) => l.id));
      setChosen(new Set(savedIds.filter((id) => known.has(id))));
      setPlaylists(lists);
    } catch (err) {
      setError(humanError(err, "Couldn't load your playlists"));
    } finally {
      setBusy("");
    }
  }, []);

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
        const since = w.refreshedAt ? new Date(w.refreshedAt) : null;
        /* Opening the tab used to mean sitting through a full scan every time.
           Now what is on file is already on screen, and a scan only runs if it
           has gone stale. "Check for releases" forces one whenever you like. */
        if (since && Date.now() - since.getTime() < STALE_AFTER_MS) { setBusy(""); return; }
        await refreshReleases(w.artists, w.service, (w.releases ?? []).map(hydrate), since);
      } else if (w.connected && !w.artists.length && w.service && !refreshed.current) {
        refreshed.current = true;
        await openPicker(w.service, w.playlistIds ?? []);
      } else {
        setBusy("");
      }
    })();
    return () => { cancelled = true; abort.current?.abort(); };
  }, [load, refreshReleases, openPicker]);

  const saveArtists = useCallback(async (
    artists: SpotifyArtist[], service: Service, playlistIds: string[], merge = false,
  ) => {
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
      body: JSON.stringify({ artists, playlistIds, merge }),
    });
    if (!saved.ok) throw new Error(String(saved.data.error ?? "Couldn't save your artists"));
    const w = await load();
    /* The artist list has just been replaced, so this starts from nothing
       rather than from releases belonging to artists that may be gone. */
    await refreshReleases((w?.artists ?? []) as Tracked[], service, [], null);
  }, [load, refreshReleases]);

  const rescan = useCallback(() => {
    void openPicker(wire?.service ?? "spotify", wire?.playlistIds ?? []);
  }, [openPicker, wire]);

  const scanPlaylists = useCallback(async (ids: string[]) => {
    const service = wire?.service ?? "spotify";
    setPlaylists(null);
    try {
      let artists: SpotifyArtist[];
      let partial = false;
      if (service === "youtube") {
        setBusy("Reading those playlists…");
        artists = await youtubeArtistsFromPlaylists(ids, (m) => setBusy(m));
      } else {
        setBusy("Reading your Spotify library…");
        const followed = await fetchFollowedArtists((m) => setBusy(m));
        /* Everyone already on file keeps their name without asking Spotify
           again, which is most of the work on a second run. */
        const known = new Map((wire?.artists ?? []).map((a) => [a.id,
          { id: a.id, name: a.name, imageUrl: a.imageUrl, source: a.source }]));
        const scan = ids.length
          ? await spotifyArtistsFromPlaylists(ids, (m) => setBusy(m), undefined, known)
          : { artists: [], named: 0, total: 0, complete: true };
        const merged = new Map(followed.map((a) => [a.id, a]));
        for (const a of scan.artists) if (!merged.has(a.id)) merged.set(a.id, a);
        artists = Array.from(merged.values());
        partial = !scan.complete;
        setLibraryNote(partial
          ? `Spotify would only name ${scan.named} of ${scan.total} artists this time — it limits how fast `
            + `anyone can ask. Those ${scan.named} are saved and nothing was lost. Give it a few minutes and `
            + `hit "Update my artists" again: it skips everyone already named and carries on from there.`
          : "");
      }
      await saveArtists(artists, service, ids, partial);
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

  /* Wipes the connection, the artists on file and any muting, so the next visit
     starts at the connect screen with nothing carried over. */
  const startOver = useCallback(async (alsoShortlist: boolean) => {
    /* A scan may well be running — that is when you are most likely to give up
       on it. Stop it first, or it would finish and write its results back over
       the rows this is about to delete. */
    abort.current?.abort();
    setClearing(true);
    setBusy("");
    setError("");
    await call(`/api/upcoming${alsoShortlist ? "?shortlist=1" : ""}`, { method: "DELETE" });
    setReleases([]);
    setSearch("");
    setView("releases");
    setResetting(false);
    setDropShortlist(false);
    refreshed.current = false;
    await load();
    setClearing(false);
  }, [load]);

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
          <button className="btn ghost" onClick={() => setPlaylists(null)}>Cancel</button>
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
        {/* Two different jobs that "Refresh" and "Rescan" did not distinguish:
            one re-checks the artists on file, the other rebuilds that list from
            the connected account. */}
        <div className="up-actions">
          <button className="btn sm" disabled={Boolean(busy)}
            title="Re-check the artists you already track for anything new"
            onClick={() => refreshReleases(wire.artists, wire.service ?? "spotify", releases,
              wire.refreshedAt ? new Date(wire.refreshedAt) : null)}>
            {busy ? "Working…" : "Check for releases"}
          </button>
          <button className="btn sm ghost" disabled={Boolean(busy)} onClick={rescan}
            title="Read your library again and rebuild the list of artists you track">
            Update my artists
          </button>
        </div>
      </div>

      {libraryNote && <p className="notice warn up-library-note"><span className="badge">Part way</span><span>{libraryNote}</span></p>}
      {busy && <div className="up-busy"><span className="up-bar" />{busy}</div>}
      {error && <p className="error">{error}</p>}
      {!busy && note && <p className="muted up-note">{note}</p>}

      {view === "releases" && (
        <>
          <div className="up-stats">
            <span><b>{unhidden.length}</b> releases</span>
            <span><b>{unhidden.filter((r) => r.isUpcoming).length}</b> announced</span>
            <span><b>{artistRows.activeTotal}</b> artists</span>
            {wire.refreshedAt && <span className="up-checked">checked {agoLabel(wire.refreshedAt)}</span>}
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
                ? "Nothing announced yet. Check for releases again, or come back later — labels announce late."
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
        </>
      )}

      {/* Reachable from any of the three views, and it says what it takes
          before it takes it. */}
      <div className="up-reset">
        {!resetting ? (
          <button className="btn sm ghost" onClick={() => setResetting(true)}>
            Clear my Upcoming and start over
          </button>
        ) : (
          <div className="up-reset-panel">
            <p className="up-reset-title">Start over?</p>
            <p className="up-reset-note">
              This unlinks {serviceName} and forgets the {wire.artists.length} artist
              {wire.artists.length === 1 ? "" : "s"} it read from your account, muting included.
              You will be back at the connect screen. Nothing about the club — picks, scores,
              reviews — is touched.
            </p>
            {shortlist.length > 0 && (
              <label className="up-reset-check">
                <input type="checkbox" checked={dropShortlist}
                  onChange={(e) => setDropShortlist(e.target.checked)} />
                <span>
                  Also throw away my shortlist ({shortlist.length} record
                  {shortlist.length === 1 ? "" : "s"}). Left alone otherwise.
                </span>
              </label>
            )}
            <div className="flex gap8 wrap">
              <button className="btn sm danger" disabled={clearing}
                onClick={() => startOver(dropShortlist)}>
                {clearing ? "Clearing…" : "Yes, clear it"}
              </button>
              <button className="btn sm ghost"
                onClick={() => { setResetting(false); setDropShortlist(false); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
