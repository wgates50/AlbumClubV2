"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fallbackArt } from "./lib/art";

type Album = {
  id: string; title: string; artist: string; artUrl: string | null; appleUrl: string | null;
};
type Hit = { sourceId: string; title: string; artist: string; year: number | null; artUrl: string | null; appleUrl: string | null };

/* Fixing a sleeve used to mean finding a direct image URL yourself and pasting
   it in, which is awkward on a laptop and hopeless on a phone. This searches the
   same catalogue the add-album box uses and lets you pick the cover by eye —
   and it only ever writes the artwork, never the title or artist. */
export default function ArtworkPicker({ album, onClose, onSaved }: {
  album: Album; onClose: () => void; onSaved: () => void;
}) {
  /* Titles carried over from the spreadsheet are often abbreviated — "The
     Miseducation of..." — and the trailing dots turn a good search into a bad
     one. Trim those and any parenthetical before seeding the box. */
  const seed = `${album.artist} ${album.title}`
    .replace(/\s*[([{][^)\]}]*[)\]}]/g, " ")
    .replace(/\s*(\.{2,}|…)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const [query, setQuery] = useState(seed);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setHits([]); return; }
    setSearching(true); setError("");
    try {
      const res = await fetch(`/api/search?limit=24&q=${encodeURIComponent(q.trim())}`);
      const d = (await res.json()) as { results?: Hit[]; warning?: string };
      setHits((d.results ?? []).filter((r) => r.artUrl));
      if (d.warning) setError(d.warning);
    } catch {
      setError("Couldn't reach the artwork search — check your connection.");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(query), 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, run]);

  const choose = async (hit: Hit) => {
    setSaving(hit.sourceId); setError("");
    const res = await fetch("/api/albums", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: album.id, artUrl: hit.artUrl, appleUrl: album.appleUrl ?? hit.appleUrl }),
    });
    setSaving(null);
    if (!res.ok) { setError("Couldn't save that one — try again."); return; }
    onSaved();
    onClose();
  };

  const clear = async () => {
    setSaving("clear");
    await fetch("/api/albums", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: album.id, artUrl: null }),
    });
    setSaving(null);
    onSaved();
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Artwork for ${album.title}`}>
        <h2>Artwork</h2>
        <p className="lede sm">
          {album.title} — {album.artist}. Search however you like and click the sleeve you want;
          nothing else about the album changes.
        </p>

        <label className="field">
          <span>Search</span>
          <input type="text" autoFocus value={query}
            placeholder="Try the artist alone if the album title is unusual"
            onChange={(e) => setQuery(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        {searching && hits.length === 0 && <p className="muted">Looking…</p>}
        {!searching && !hits.length && query.trim().length >= 2 && (
          <p className="muted">
            Nothing with artwork came back. Try just the artist&rsquo;s name, or a different spelling.
          </p>
        )}

        <div className="pick-grid">
          {hits.map((h) => (
            <button key={h.sourceId} type="button" className="pick" disabled={Boolean(saving)}
              onClick={() => choose(h)} title={`${h.title} — ${h.artist}`}>
              <span className="pick-art" style={h.artUrl ? undefined : { background: fallbackArt(h.artist + h.title) }}>
                {h.artUrl && <img src={h.artUrl} alt="" loading="lazy" />}
                {saving === h.sourceId && <span className="pick-saving">Saving…</span>}
              </span>
              <span className="pick-title">{h.title}</span>
              <span className="pick-sub">{h.artist}{h.year ? ` · ${h.year}` : ""}</span>
            </button>
          ))}
        </div>

        <div className="modal-actions">
          {album.artUrl && (
            <button className="btn ghost" disabled={Boolean(saving)} onClick={clear}>Remove artwork</button>
          )}
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
