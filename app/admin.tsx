"use client";

import { useMemo, useState } from "react";
import { fallbackArt } from "./lib/art";
import ArtworkPicker from "./artwork";

type Member = { id: string; name: string; color: string; sortOrder: number };
type Album = {
  id: string; month: string; title: string; artist: string; year: number | null;
  chosenBy: string | null; artUrl: string | null; spotifyUrl: string | null;
  ytmUrl: string | null; appleUrl: string | null; tracks: string[]; createdAt: string;
};
type Rating = {
  albumId: string; memberId: string; score: number | null; review: string;
  favTracks: string[]; skipped: boolean; updatedAt: string;
};

type Props = { albums: Album[]; members: Member[]; ratings: Rating[]; onChanged: () => void };
type Status = { configured: boolean; unlocked: boolean };

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
  const [pickedId, setPickedId] = useState<string>("");
  const [saved, setSaved] = useState("");
const [picking, setPicking] = useState(false);

  /* Ask once on first render what the server thinks. */
  useMemo(() => {
    void call("/api/admin").then((r) => setStatus(r.data as unknown as Status));
  }, []);

  const sorted = useMemo(
    () => [...albums].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : a.title.localeCompare(b.title))),
    [albums],
  );
  const album = sorted.find((a) => a.id === pickedId) ?? sorted[0] ?? null;

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

  const saveRating = async (memberId: string, patch: { score?: number | null; review?: string; skipped?: boolean }) => {
    if (!album) return;
    const existing = ratings.find((r) => r.albumId === album.id && r.memberId === memberId);
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

  const saveAlbum = async (patch: Partial<Album>) => {
    if (!album) return;
    const res = await call("/api/albums", { method: "PATCH", body: JSON.stringify({ id: album.id, ...patch }) });
    if (res.ok) { onChanged(); flash("Saved"); } else setError(String(res.data.error ?? "Couldn't save"));
  };

  const removeAlbum = async () => {
    if (!album) return;
    if (!confirm(`Delete "${album.title}" and every score and review on it? This can't be undone.`)) return;
    const res = await call(`/api/albums?id=${encodeURIComponent(album.id)}`, { method: "DELETE" });
    if (res.ok) { setPickedId(""); onChanged(); flash("Deleted"); }
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

  return (
    <div className="admin">
      <div className="up-head">
        <p className="eyebrow">Admin — editing as anyone</p>
        <div className="up-actions">
          <span className={`saved ${saved ? "on" : ""}`}>{saved}</span>
          <button className="btn sm ghost" onClick={lock}>Lock</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!album ? (
        <p className="up-empty">No albums yet.</p>
      ) : (
        <>
          <label className="field">
            <span>Album</span>
            <select value={album.id} onChange={(e) => setPickedId(e.target.value)}>
              {sorted.map((a) => (
                <option key={a.id} value={a.id}>
                  {monthLabel(a.month)} — {a.title} · {a.artist}
                </option>
              ))}
            </select>
          </label>

          <p className="eyebrow mt34 mb16">Scores and reviews</p>
          {members.map((m) => {
            const r = ratings.find((x) => x.albumId === album.id && x.memberId === m.id);
            return (
              <div className="admin-row" key={m.id}>
                <div className="admin-who">
                  <i className="pip" style={{ background: m.color }} />
                  <span>{m.name}</span>
                </div>
                <div className="admin-fields">
                  <input type="number" min={0} max={10} step={0.1} className="admin-score"
                    aria-label={`${m.name}'s score`}
                    value={r?.score ?? ""} placeholder="—"
                    disabled={r?.skipped ?? false}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      void saveRating(m.id, { score: v === "" ? null : Math.min(10, Math.max(0, Number(v))) });
                    }} />
                  <button className={`btn sm ghost${r?.skipped ? " on" : ""}`}
                    onClick={() => saveRating(m.id, { skipped: !r?.skipped, score: null })}>
                    {r?.skipped ? "Skipped" : "Mark skipped"}
                  </button>
                </div>
                <textarea defaultValue={r?.review ?? ""} placeholder={`${m.name}'s review`}
                  onBlur={(e) => { if (e.target.value !== (r?.review ?? "")) void saveRating(m.id, { review: e.target.value }); }} />
              </div>
            );
          })}

          <p className="eyebrow mt34 mb16">This album</p>
          <div className="admin-album">
            <div className="admin-art" style={album.artUrl ? undefined : { background: fallbackArt(album.artist + album.title) }}>
              {album.artUrl && <img src={album.artUrl} alt="" />}
            </div>
            <div className="grow">
              <label className="field">
                <span>Artwork</span>
                <div className="flex gap8">
                  <input type="text" defaultValue={album.artUrl ?? ""} placeholder="Pick one, or paste a URL"
                    onBlur={(e) => { if (e.target.value !== (album.artUrl ?? "")) void saveAlbum({ artUrl: e.target.value || null }); }} />
                  <button className="btn" onClick={() => setPicking(true)}>Find&hellip;</button>
                </div>
              </label>
              <div className="grid3">
                <label className="field">
                  <span>Title</span>
                  <input type="text" defaultValue={album.title}
                    onBlur={(e) => { if (e.target.value.trim() && e.target.value !== album.title) void saveAlbum({ title: e.target.value.trim() }); }} />
                </label>
                <label className="field">
                  <span>Artist</span>
                  <input type="text" defaultValue={album.artist}
                    onBlur={(e) => { if (e.target.value.trim() && e.target.value !== album.artist) void saveAlbum({ artist: e.target.value.trim() }); }} />
                </label>
                <label className="field">
                  <span>Year</span>
                  <input type="number" defaultValue={album.year ?? ""} placeholder="—"
                    onBlur={(e) => void saveAlbum({ year: e.target.value ? Number(e.target.value) : null })} />
                </label>
              </div>
              <div className="grid3">
                <label className="field">
                  <span>Month</span>
                  <input type="month" defaultValue={album.month}
                    onBlur={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value) && e.target.value !== album.month) void saveAlbum({ month: e.target.value }); }} />
                </label>
                <label className="field">
                  <span>Chosen by</span>
                  <select value={album.chosenBy ?? ""} onChange={(e) => void saveAlbum({ chosenBy: e.target.value || null })}>
                    <option value="">Nobody</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Spotify link</span>
                  <input type="text" defaultValue={album.spotifyUrl ?? ""} placeholder="https://open.spotify.com/…"
                    onBlur={(e) => { if (e.target.value !== (album.spotifyUrl ?? "")) void saveAlbum({ spotifyUrl: e.target.value || null }); }} />
                </label>
              </div>
              <button className="btn sm danger" onClick={removeAlbum}>Delete this album</button>
            </div>
          </div>
          <p className="muted mt14">Every field saves when you click away from it.</p>
          {picking && (
            <ArtworkPicker album={album} onClose={() => setPicking(false)} onSaved={onChanged} />
          )}
        </>
      )}
    </div>
  );
}
