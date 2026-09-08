"use client";

import { useEffect, useMemo, useState } from "react";
import { fallbackArt } from "./lib/art";
import ArtworkPicker from "./artwork";

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

type Props = { albums: Album[]; members: Member[]; ratings: Rating[]; onChanged: () => void };
type Status = { configured: boolean; unlocked: boolean };
type Filter = "all" | "noart" | "nodate" | "zero";

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init?.body ? { headers: { "content-type": "application/json" }, ...init } : init);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });

export default function Admin({ albums, members, ratings, onChanged }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [picking, setPicking] = useState<Album | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    void call("/api/admin").then((r) => setStatus(r.data as unknown as Status));
  }, []);

  const ratingsFor = useMemo(() => {
    const by = new Map<string, Rating[]>();
    for (const r of ratings) {
      if (!by.has(r.albumId)) by.set(r.albumId, []);
      by.get(r.albumId)!.push(r);
    }
    return by;
  }, [ratings]);

  /* Newest first, and every row carries the two things worth spotting at a
     glance: whether it has a sleeve, and whether anyone left a bare zero. */
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return albums
      .map((a) => {
        const rs = ratingsFor.get(a.id) ?? [];
        return { a, rs, noArt: !a.artUrl, noDate: !a.releaseDate,
                 hasZero: rs.some((r) => r.score === 0 && !r.skipped) };
      })
      .filter(({ a, noArt, noDate, hasZero }) => {
        if (filter === "noart" && !noArt) return false;
        if (filter === "nodate" && !noDate) return false;
        if (filter === "zero" && !hasZero) return false;
        if (q && !`${a.title} ${a.artist}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((x, y) => (x.a.month < y.a.month ? 1 : x.a.month > y.a.month ? -1 : x.a.title.localeCompare(y.a.title)));
  }, [albums, ratingsFor, filter, search]);

  const counts = useMemo(() => ({
    all: albums.length,
    noart: albums.filter((a) => !a.artUrl).length,
    nodate: albums.filter((a) => !a.releaseDate).length,
    zero: albums.filter((a) => (ratingsFor.get(a.id) ?? []).some((r) => r.score === 0 && !r.skipped)).length,
  }), [albums, ratingsFor]);

  const unlock = async () => {
    setBusy(true); setError("");
    const res = await call("/api/admin", { method: "POST", body: JSON.stringify({ code: code.trim() }) });
    setBusy(false);
    if (!res.ok) { setError(String(res.data.error ?? "That didn't work")); return; }
    setCode("");
    setStatus({ configured: true, unlocked: true });
  };

  const lock = async () => {
    await call("/api/admin", { method: "DELETE" });
    setStatus({ configured: true, unlocked: false });
  };

  const flash = (m: string) => { setSaved(m); setTimeout(() => setSaved(""), 2200); };

  const saveRating = async (album: Album, memberId: string, patch: { score?: number | null; review?: string; skipped?: boolean }) => {
    const existing = (ratingsFor.get(album.id) ?? []).find((r) => r.memberId === memberId);
    const res = await call("/api/ratings", {
      method: "PUT",
      body: JSON.stringify({
        albumId: album.id, memberId,
        score: patch.score !== undefined ? patch.score : existing?.score ?? null,
        review: patch.review !== undefined ? patch.review : existing?.review ?? "",
        skipped: patch.skipped !== undefined ? patch.skipped : existing?.skipped ?? false,
        favTracks: existing?.favTracks ?? [],
      }),
    });
    if (res.ok) { onChanged(); flash("Saved"); } else setError(String(res.data.error ?? "Couldn't save"));
  };

  const saveAlbum = async (album: Album, patch: Partial<Album>) => {
    const res = await call("/api/albums", { method: "PATCH", body: JSON.stringify({ id: album.id, ...patch }) });
    if (res.ok) { onChanged(); flash("Saved"); } else setError(String(res.data.error ?? "Couldn't save"));
  };

  const removeAlbum = async (album: Album) => {
    if (!confirm(`Delete "${album.title}" and every score and review on it? This can't be undone.`)) return;
    const res = await call(`/api/albums?id=${encodeURIComponent(album.id)}`, { method: "DELETE" });
    if (res.ok) { setOpenId(null); onChanged(); flash("Deleted"); }
    else setError(String(res.data.error ?? "Couldn't delete"));
  };

  if (!status) return <p className="up-empty">Loading…</p>;

  if (!status.configured) {
    return (
      <div className="up-connect">
        <p className="eyebrow mb12">Admin</p>
        <h2>Not switched on</h2>
        <p className="lede">
          Set <code className="code">ADMIN_CODE</code> in the Vercel project&rsquo;s environment
          variables and redeploy. The code is deliberately not kept in the repository, which is
          public.
        </p>
      </div>
    );
  }

  if (!status.unlocked) {
    return (
      <div className="up-connect">
        <p className="eyebrow mb12">Admin</p>
        <h2>Code, please</h2>
        <p className="lede">Editing other people&rsquo;s scores and fixing albums lives behind this.</p>
        <input type="password" inputMode="numeric" autoFocus value={code} placeholder="Code"
          aria-label="Admin code"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void unlock(); }} />
        {error && <p className="error">{error}</p>}
        <button className="btn primary wfull mt14" disabled={busy || !code.trim()} onClick={unlock}>
          {busy ? "Checking…" : "Unlock"}
        </button>
      </div>
    );
  }

  const FILTERS: [Filter, string, number][] = [
    ["all", "Everything", counts.all],
    ["noart", "No artwork", counts.noart],
    ["nodate", "No release date", counts.nodate],
    ["zero", "Scored zero", counts.zero],
  ];

  return (
    <div className="admin">
      <div className="up-head">
        <div className="up-views">
          {FILTERS.map(([f, label, n]) => (
            <button key={f} className="up-view" aria-selected={filter === f} onClick={() => setFilter(f)}>
              {label}{n > 0 && ` (${n})`}
            </button>
          ))}
        </div>
        <div className="up-actions">
          <span className={`saved ${saved ? "on" : ""}`}>{saved}</span>
          <button className="btn sm ghost" onClick={lock}>Lock</button>
        </div>
      </div>

      <input type="text" className="up-search" placeholder="Search albums…"
        value={search} onChange={(e) => setSearch(e.target.value)} />

      {error && !openId && <p className="error">{error}</p>}
      {!rows.length && (
        <p className="up-empty">
          {filter === "noart" ? "Every album has a sleeve."
            : filter === "nodate" ? "Every album has a release date."
            : filter === "zero" ? "Nobody has left a bare zero."
            : "Nothing matches that."}
        </p>
      )}

      <div className="adm-list">
        {rows.map(({ a, rs, noArt, hasZero }) => {
          const isOpen = openId === a.id;
          const chooser = members.find((m) => m.id === a.chosenBy);
          return (
            <div className={`adm-item${isOpen ? " open" : ""}`} key={a.id}>
              <button className="adm-row" onClick={() => { setError(""); setOpenId(isOpen ? null : a.id); }} aria-expanded={isOpen}>
                <span className={`adm-art${noArt ? " none" : ""}`}
                  style={a.artUrl ? undefined : { background: fallbackArt(a.artist + a.title) }}>
                  {a.artUrl ? <img src={a.artUrl} alt="" loading="lazy" /> : <span className="adm-art-tag">no art</span>}
                </span>
                <span className="adm-meta">
                  <span className="adm-title">{a.title}</span>
                  <span className="adm-sub">
                    {a.artist} · {monthLabel(a.month)}{chooser ? ` · ${chooser.name}` : ""}
                    {!a.releaseDate && <em className="adm-gap"> · no release date</em>}
                  </span>
                </span>
                <span className="adm-scores">
                  {members.map((m) => {
                    const r = rs.find((x) => x.memberId === m.id);
                    const zero = r?.score === 0 && !r.skipped;
                    return (
                      <span key={m.id} className={`adm-score${zero ? " zero" : ""}${r?.skipped ? " skip" : ""}`}
                        title={`${m.name}: ${r?.skipped ? "skipped" : r?.score ?? "no score"}`}>
                        <i className="pip" style={{ background: m.color }} />
                        {r?.skipped ? "skip" : r?.score ?? "—"}
                      </span>
                    );
                  })}
                </span>
                {hasZero && <span className="adm-flag" title="Someone scored this zero">0</span>}
              </button>

              {isOpen && (
                <div className="adm-edit">
                  {error && <p className="error mb12">{error}</p>}
                  {members.map((m) => {
                    const r = rs.find((x) => x.memberId === m.id);
                    return (
                      <div className="admin-row" key={m.id}>
                        <div className="admin-who">
                          <i className="pip" style={{ background: m.color }} />
                          <span>{m.name}</span>
                        </div>
                        <div className="admin-fields">
                          <input type="number" min={0} max={10} step={0.1} className="admin-score"
                            aria-label={`${m.name}'s score for ${a.title}`}
                            value={r?.score ?? ""} placeholder="—" disabled={r?.skipped ?? false}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              void saveRating(a, m.id, { score: v === "" ? null : Math.min(10, Math.max(0, Number(v))) });
                            }} />
                          <button className={`btn sm ghost${r?.skipped ? " on" : ""}`}
                            onClick={() => saveRating(a, m.id, { skipped: !r?.skipped, score: null })}>
                            {r?.skipped ? "Skipped" : "Mark skipped"}
                          </button>
                        </div>
                        <textarea defaultValue={r?.review ?? ""} placeholder={`${m.name}'s review`}
                          onBlur={(e) => { if (e.target.value !== (r?.review ?? "")) void saveRating(a, m.id, { review: e.target.value }); }} />
                      </div>
                    );
                  })}

                  <div className="grid3 mt14">
                    <label className="field">
                      <span>Title</span>
                      <input type="text" defaultValue={a.title}
                        onBlur={(e) => { if (e.target.value.trim() && e.target.value !== a.title) void saveAlbum(a, { title: e.target.value.trim() }); }} />
                    </label>
                    <label className="field">
                      <span>Artist</span>
                      <input type="text" defaultValue={a.artist}
                        onBlur={(e) => { if (e.target.value.trim() && e.target.value !== a.artist) void saveAlbum(a, { artist: e.target.value.trim() }); }} />
                    </label>
                    <label className="field">
                      <span>Release date</span>
                      <input type="date" defaultValue={a.releaseDate ?? ""}
                        onBlur={(e) => { if ((e.target.value || null) !== a.releaseDate) void saveAlbum(a, { releaseDate: e.target.value || null }); }} />
                    </label>
                  </div>
                  <div className="grid3">
                    <label className="field">
                      <span>Month</span>
                      <input type="month" defaultValue={a.month}
                        onBlur={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value) && e.target.value !== a.month) void saveAlbum(a, { month: e.target.value }); }} />
                    </label>
                    <label className="field">
                      <span>Chosen by</span>
                      <select value={a.chosenBy ?? ""} onChange={(e) => void saveAlbum(a, { chosenBy: e.target.value || null })}>
                        <option value="">Nobody</option>
                        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </label>
                    <label className="field">
                      <span>Spotify link</span>
                      <input type="text" defaultValue={a.spotifyUrl ?? ""} placeholder="https://open.spotify.com/…"
                        onBlur={(e) => { if (e.target.value !== (a.spotifyUrl ?? "")) void saveAlbum(a, { spotifyUrl: e.target.value || null }); }} />
                    </label>
                  </div>

                  <div className="flex gap8 wrap">
                    <button className="btn sm" onClick={() => setPicking(a)}>
                      {a.artUrl ? "Change artwork" : "Find artwork"}
                    </button>
                    <button className="btn sm danger" onClick={() => removeAlbum(a)}>Delete album</button>
                  </div>
                  <p className="muted mt14">Every field saves when you click away from it.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {picking && (
        <ArtworkPicker album={picking} onClose={() => setPicking(null)} onSaved={onChanged} />
      )}
    </div>
  );
}
