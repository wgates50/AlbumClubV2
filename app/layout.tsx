import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
title: "Album Club",
description: "Three albums a month. Scored, reviewed, kept.",
};

export const viewport: Viewport = {
themeColor: "#0b0a09",
width: "device-width",
initialScale: 1,
};

const CSS = `
:root {
  color-scheme: dark;
  --bg: #0b0a09;
  --bg-2: #100f0d;
  --surface: #16140f;
  --surface-2: #1e1b16;
  --surface-3: #262219;
  --line: #2c281f;
  --line-soft: #221f19;
  --text: #f4eee2;
  --text-dim: #cfc6b4;
  --muted: #948a76;
  --muted-2: #6a6252;
  --accent: #e0b25c;
  --accent-2: #f0d08a;
  --accent-soft: rgba(224, 178, 92, 0.13);
  --accent-line: rgba(224, 178, 92, 0.34);
  --warn: #e8804f;
  --spotify: #1ed760;
  --ytm: #ff4e45;
  --apple: #fa586a;
  --radius: 3px;
  --font-display: "Instrument Serif", "Iowan Old Style", Georgia, serif;
  --font-ui: "Space Grotesk", "Helvetica Neue", Arial, sans-serif;
  --shadow: 0 18px 50px -20px rgba(0, 0, 0, 0.85);
  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
}

* {
  box-sizing: border-box;
}

html,
body {
  padding: 0;
  margin: 0;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-weight: 300;
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}

/* warm vignette + fine grain, so the black has some paper in it */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(1100px 700px at 12% -8%, rgba(224, 178, 92, 0.09), transparent 62%),
    radial-gradient(900px 600px at 96% 4%, rgba(122, 90, 200, 0.06), transparent 60%);
}

body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

#app {
  position: relative;
  z-index: 1;
}

a {
  color: inherit;
}

::selection {
  background: var(--accent);
  color: #16130c;
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: 2px;
}

/* ---------------- type ---------------- */

.display {
  font-family: var(--font-display);
  font-weight: 400;
  letter-spacing: 0.01em;
  line-height: 1.02;
}

.eyebrow {
  font-size: 10.5px;
  letter-spacing: 0.19em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 500;
}

.mono-num {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
}

/* ---------------- shell ---------------- */

.shell {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px 120px;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  backdrop-filter: blur(14px);
  background: linear-gradient(180deg, rgba(11, 10, 9, 0.96), rgba(11, 10, 9, 0.82));
  border-bottom: 1px solid var(--line-soft);
}

.topbar-inner {
  max-width: 1120px;
  margin: 0 auto;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  gap: 22px;
}

.brand {
  font-family: var(--font-display);
  font-size: 25px;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.brand .dot {
  color: var(--accent);
}

.tabs {
  display: flex;
  gap: 4px;
  margin-left: auto;
  flex-wrap: wrap;
}

.tab-short { display: none; }

.tab {
  background: none;
  border: 0;
  color: var(--muted);
  font-family: var(--font-ui);
  font-size: 12px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  font-weight: 500;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 2px;
  transition: color 0.18s var(--ease), background 0.18s var(--ease);
}

.tab:hover {
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.03);
}

.tab[aria-selected="true"] {
  color: var(--accent);
  background: var(--accent-soft);
}

.whoami {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 1px solid var(--line);
  color: var(--text-dim);
  padding: 6px 11px;
  border-radius: 100px;
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 12.5px;
  transition: border-color 0.18s var(--ease);
}

.whoami:hover {
  border-color: var(--muted-2);
}

.pip {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}

/* ---------------- month header ---------------- */

.month-head {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  padding: 52px 0 10px;
  flex-wrap: wrap;
}

.month-title {
  font-size: clamp(46px, 8.5vw, 88px);
  margin: 0;
}

.month-title em {
  font-style: italic;
  color: var(--accent);
}

.month-nav {
  display: flex;
  gap: 6px;
  margin-left: auto;
  align-items: center;
  padding-bottom: 10px;
}

.icon-btn {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  background: none;
  color: var(--text-dim);
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.18s var(--ease);
  font-size: 15px;
}

.icon-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.icon-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.month-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--line-soft);
  padding-bottom: 22px;
  margin-bottom: 8px;
}

.progress-track {
  width: 92px;
  height: 3px;
  background: var(--surface-2);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.5s var(--ease);
}

/* ---------------- album card ---------------- */

.album {
  border-bottom: 1px solid var(--line-soft);
  padding: 34px 0;
  animation: rise 0.5s var(--ease) both;
}

.album:nth-child(2) { animation-delay: 0.06s; }
.album:nth-child(3) { animation-delay: 0.12s; }
.album:nth-child(4) { animation-delay: 0.18s; }

@keyframes rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}

.album-top {
  display: grid;
  grid-template-columns: 208px 1fr;
  gap: 28px;
  align-items: start;
}

.sleeve {
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface-2);
  box-shadow: var(--shadow);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.sleeve img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sleeve-fallback {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
  padding: 14px;
  font-family: var(--font-display);
  font-size: 19px;
  line-height: 1.15;
  color: rgba(255, 255, 255, 0.78);
}

.sleeve-fallback span {
  display: block;
  font-family: var(--font-ui);
  font-size: 9.5px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  margin-top: 9px;
  opacity: 0.75;
}

.album-artist {
  font-size: 12px;
  letter-spacing: 0.17em;
  text-transform: uppercase;
  color: var(--accent);
  font-weight: 500;
  margin: 0 0 6px;
}

.album-title {
  font-size: clamp(30px, 4.6vw, 46px);
  margin: 0 0 12px;
}

.album-sub {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 18px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 100px;
  padding: 3px 10px;
  font-size: 11.5px;
  color: var(--text-dim);
  white-space: nowrap;
}

.listen-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.listen {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border: 1px solid var(--line);
  border-radius: 100px;
  text-decoration: none;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-dim);
  background: var(--surface);
  transition: all 0.18s var(--ease);
  white-space: nowrap;
}

.listen:hover {
  color: var(--text);
  transform: translateY(-1px);
}

.listen.sp:hover { border-color: var(--spotify); box-shadow: 0 0 0 1px var(--spotify) inset; }
.listen.yt:hover { border-color: var(--ytm); box-shadow: 0 0 0 1px var(--ytm) inset; }
.listen.ap:hover { border-color: var(--apple); box-shadow: 0 0 0 1px var(--apple) inset; }

.listen svg { flex: none; }

/* ---------------- rating panel ---------------- */

.panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 26px;
  margin-top: 26px;
}

.panel {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  padding: 20px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.score-row {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 16px;
}

.big-score {
  font-family: var(--font-display);
  font-size: 62px;
  line-height: 0.85;
  color: var(--accent);
  min-width: 96px;
  font-variant-numeric: tabular-nums;
}

.big-score.unset {
  color: var(--muted-2);
}

.big-score small {
  font-size: 18px;
  color: var(--muted-2);
}

input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 22px;
  background: transparent;
  cursor: pointer;
  margin: 0;
}

input[type="range"]::-webkit-slider-runnable-track {
  height: 2px;
  background: var(--line);
}

input[type="range"]::-moz-range-track {
  height: 2px;
  background: var(--line);
}

input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent);
  margin-top: -7px;
  box-shadow: 0 0 0 4px rgba(224, 178, 92, 0.16);
  transition: box-shadow 0.18s var(--ease);
}

input[type="range"]::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 7px rgba(224, 178, 92, 0.2);
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 50%;
  background: var(--accent);
}

.ticks {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--muted);
  letter-spacing: 0.08em;
  margin-top: -2px;
}

textarea,
input[type="text"],
input[type="password"],
input[type="number"],
input[type="month"],
select {
  width: 100%;
  background: var(--bg-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 300;
  padding: 11px 13px;
  border-radius: var(--radius);
  transition: border-color 0.18s var(--ease);
}

textarea {
  resize: vertical;
  min-height: 92px;
  line-height: 1.6;
}

textarea:focus,
input:focus,
select:focus {
  border-color: var(--accent);
  outline: none;
}

::placeholder {
  color: var(--muted-2);
}

label.field {
  display: block;
  margin-bottom: 14px;
}

label.field > span {
  display: block;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 500;
  margin-bottom: 7px;
}

/* ---------------- tracks ---------------- */

.tracks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.track {
  border: 1px solid var(--line);
  background: none;
  color: var(--muted);
  border-radius: 100px;
  padding: 5px 11px;
  font-size: 12px;
  font-family: var(--font-ui);
  font-weight: 300;
  cursor: pointer;
  transition: all 0.16s var(--ease);
  text-align: left;
}

.track:hover {
  color: var(--text-dim);
  border-color: var(--muted-2);
}

.track.on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
  font-weight: 400;
}

.track.on::before {
  content: "★ ";
  font-size: 10px;
}

/* ---------------- club takes ---------------- */

.take {
  padding: 13px 0;
  border-top: 1px dashed var(--line);
}

.take:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.take-head {
  display: flex;
  align-items: baseline;
  gap: 9px;
  margin-bottom: 5px;
}

.take-name {
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.take-score {
  font-family: var(--font-display);
  font-size: 25px;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.take-review {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-dim);
  font-weight: 300;
}

.take-favs {
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--muted);
}

.locked {
  text-align: center;
  padding: 26px 16px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
  background:
    repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 7px,
      rgba(255, 255, 255, 0.014) 7px,
      rgba(255, 255, 255, 0.014) 14px
    );
  border-radius: var(--radius);
}

.locked strong {
  color: var(--text-dim);
  font-weight: 500;
  display: block;
  margin-bottom: 5px;
  font-family: var(--font-display);
  font-size: 19px;
}

/* ---------------- buttons ---------------- */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  padding: 10px 18px;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.18s var(--ease);
  text-decoration: none;
}

.btn:hover:not(:disabled) {
  border-color: var(--muted-2);
  background: var(--surface-3);
}

.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #17120a;
  font-weight: 600;
}

.btn.primary:hover:not(:disabled) {
  background: var(--accent-2);
  border-color: var(--accent-2);
}

.btn.ghost {
  background: none;
}

.btn.danger {
  border-color: rgba(232, 128, 79, 0.42);
  color: var(--warn);
}

.btn.danger:hover:not(:disabled) {
  border-color: var(--warn);
  background: rgba(232, 128, 79, 0.1);
  color: #f0a184;
}

.btn.sm {
  padding: 6px 12px;
  font-size: 12px;
}

.saved {
  font-size: 11px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--muted-2);
  transition: opacity 0.3s var(--ease);
}

.saved.on {
  color: var(--accent);
}

/* ---------------- archive + tables ---------------- */

.month-block {
  margin-bottom: 46px;
}

.month-block h3 {
  font-family: var(--font-display);
  font-size: 30px;
  margin: 0 0 4px;
  font-weight: 400;
}

.rows {
  border-top: 1px solid var(--line-soft);
}

.row {
  display: grid;
  grid-template-columns: 62px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 13px 0;
  border-bottom: 1px solid var(--line-soft);
  cursor: pointer;
  transition: background 0.16s var(--ease);
}

.row:hover {
  background: rgba(255, 255, 255, 0.017);
}

.thumb {
  border-radius: 2px;
  overflow: hidden;
  background: var(--surface-2);
  position: relative;
  flex: none;
}

.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

.row .thumb {
  width: 62px;
  height: 62px;
}

.row .thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.row-title {
  font-family: var(--font-display);
  font-size: 21px;
  line-height: 1.15;
}

.row-sub {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}

.avg {
  font-family: var(--font-display);
  font-size: 32px;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  text-align: right;
}

.avg small {
  display: block;
  font-family: var(--font-ui);
  font-size: 9.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted-2);
  margin-top: 4px;
}

.rank {
  font-family: var(--font-display);
  font-size: 22px;
  color: var(--muted);
  width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.expanded {
  padding: 4px 0 22px 78px;
  border-bottom: 1px solid var(--line-soft);
}

/* ---------------- stats ---------------- */

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
  gap: 14px;
  margin-bottom: 42px;
}

.stat {
  background: var(--surface);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius);
  padding: 18px;
}

.stat-value {
  font-family: var(--font-display);
  font-size: 40px;
  line-height: 1;
  margin: 8px 0 4px;
  font-variant-numeric: tabular-nums;
}

.stat-note {
  font-size: 12px;
  color: var(--muted);
}

/* ---------------- gate / modal ---------------- */

.gate {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 30px 24px;
  position: relative;
  z-index: 1;
}

.gate-card {
  width: 100%;
  max-width: 430px;
  animation: rise 0.6s var(--ease) both;
}

.gate-card h1 {
  font-family: var(--font-display);
  font-size: 58px;
  margin: 0 0 6px;
  font-weight: 400;
  line-height: 1;
}

.gate-card p.lede {
  color: var(--muted);
  margin: 0 0 30px;
  font-size: 14px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(6, 5, 4, 0.78);
  backdrop-filter: blur(6px);
  z-index: 90;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 20px;
  overflow-y: auto;
  animation: fade 0.22s var(--ease);
}

@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 4px;
  width: 100%;
  max-width: 620px;
  padding: 28px;
  box-shadow: var(--shadow);
  animation: rise 0.28s var(--ease) both;
}

.modal h2 {
  font-family: var(--font-display);
  font-size: 34px;
  margin: 0 0 4px;
  font-weight: 400;
}

.results {
  border: 1px solid var(--line);
  border-radius: var(--radius);
  max-height: 292px;
  overflow-y: auto;
  margin-top: 10px;
}

.result {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 9px 11px;
  cursor: pointer;
  border-bottom: 1px solid var(--line-soft);
  background: none;
  border-left: 0;
  border-right: 0;
  border-top: 0;
  width: 100%;
  text-align: left;
  color: var(--text);
  font-family: var(--font-ui);
  transition: background 0.15s var(--ease);
}

.result:last-child { border-bottom: 0; }
.result:hover { background: var(--surface-2); }

.result img {
  width: 46px;
  height: 46px;
  border-radius: 2px;
  object-fit: cover;
  flex: none;
  background: var(--surface-2);
}

.notice {
  border: 1px solid var(--line);
  background: var(--surface);
  border-radius: var(--radius);
  padding: 14px 16px;
  font-size: 13px;
  color: var(--text-dim);
  line-height: 1.6;
  margin-bottom: 22px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.notice.warn {
  border-color: rgba(224, 178, 92, 0.4);
  background: rgba(224, 178, 92, 0.05);
}

/* A record that cannot make its month at all, as against one that is merely
   still to come. */
.notice.bad { border-color: var(--warn); background: rgba(232, 128, 79, 0.06); }
.notice.bad .badge { border-color: var(--warn); color: var(--warn); }

/* Pinned to the warning colour rather than --accent: this sits on an album
   card, where the accent is whoever picked the record, and a caution wearing
   the chooser's colour reads as decoration. */
.notice.soon { border-color: var(--warn); background: rgba(232, 128, 79, 0.06); }
.notice.soon .badge { border-color: var(--warn); color: var(--warn); }

.chip.soon { border-color: var(--warn); color: var(--warn); }

.notice .badge {
  font-size: 9.5px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  border: 1px solid var(--accent);
  color: var(--accent);
  padding: 2px 7px;
  border-radius: 100px;
  flex: none;
  margin-top: 2px;
  font-weight: 600;
}

.error {
  color: #ee9179;
  font-size: 13px;
  margin: 10px 0 0;
}

.empty {
  text-align: center;
  padding: 70px 20px;
  color: var(--muted);
}

.empty .display {
  font-size: 34px;
  color: var(--text-dim);
  margin-bottom: 10px;
}

.member-line {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 0;
  border-bottom: 1px solid var(--line-soft);
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 820px) {
  .album-top { grid-template-columns: 132px 1fr; gap: 18px; }
  .panels { grid-template-columns: 1fr; gap: 16px; }
  .shell { padding: 0 16px 90px; }
  .topbar-inner { padding: 12px 16px; gap: 12px; flex-wrap: wrap; }
  .month-head { padding-top: 32px; }
  .expanded { padding-left: 0; }
  .row { grid-template-columns: 50px 1fr auto; }
  .row .thumb { width: 50px; height: 50px; }
}

@media (max-width: 560px) {
  .album-top { grid-template-columns: 1fr; }
  .sleeve { width: 210px; max-width: 100%; justify-self: start; }
  .brand { font-size: 21px; }
  /* One scrolling row, not two stacked ones. The topbar is sticky, so a
     wrapped nav would cost ~130px of every screen for as long as you use it. */
  .tabs {
    order: 3; width: 100%; margin-left: 0;
    flex-wrap: nowrap; overflow-x: visible;
    gap: 0; justify-content: space-between;
  }
  .tab {
    flex: 1 1 0; min-width: 0; text-align: center;
    font-size: 11px; letter-spacing: 0.05em; padding: 8px 2px;
  }
  .tab-long { display: none; }
  .tab-short { display: inline; }
  .tab-dot { margin-left: 4px; }
  /* Safari zooms the whole page when you focus a field under 16px, and never
     zooms back out — writing a review on a phone shouldn't do that. */
  textarea,
  input[type="text"],
  input[type="password"],
  input[type="number"],
  input[type="month"],
  select { font-size: 16px; }
  .month-meta { gap: 10px; }
  .month-meta .right { margin-left: 0; width: 100%; justify-content: center; }
  .up-row-actions { padding-left: 0; }
  .up-connect h2 { font-size: 32px; }
  .wall { grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 14px; }
  .pick-grid { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
  .album-glow { left: -16px; right: -16px; height: 300px; }
  .album-tab { max-width: 200px; }
}

/* Touch input, whatever the screen width: the score slider is the thing people
   actually come here to use, and a 16px thumb is too small to place a 7.4 with
   a thumb. Widening the control also makes the whole strip grabbable. */
@media (pointer: coarse) {
  input[type="range"] { height: 36px; }
  input[type="range"]::-webkit-slider-thumb {
    width: 26px; height: 26px; margin-top: -12px;
    box-shadow: 0 0 0 5px rgba(224, 178, 92, 0.18);
  }
  input[type="range"]::-moz-range-thumb { width: 26px; height: 26px; }
  .btn { min-height: 42px; }
  .btn.sm { min-height: 36px; }
  .track, .up-view, .up-filter { min-height: 36px; }
}

/* ---------------- utilities ---------------- */

.muted { color: var(--muted); font-size: 13px; }
.dim { color: var(--muted-2); }
.bright { color: var(--text-dim); }
.gold { border-color: var(--accent) !important; color: var(--accent) !important; }
.gold-i { font-style: italic; color: var(--accent); }
.semi { font-weight: 500; }
.grow { flex: 1; }
.min0 { min-width: 0; }
.right { margin-left: auto; }
.flex { display: flex; }
.vc { align-items: center; }
.wrap { flex-wrap: wrap; }
.stack { display: grid; gap: 8px; }
.gap8 { gap: 8px; }
.gap10 { gap: 10px; }
.gap14 { gap: 14px; }
.gap18 { gap: 18px; }
.wfull { width: 100%; }
.narrow { max-width: 620px; }
.w220 { max-width: 220px; }
.w58 { min-width: 58px; }
.pad14 { padding: 14px; }
.nomb { margin: 0; }
.mt8 { margin-top: 8px; }
.mt14 { margin-top: 14px; }
.mt16 { margin-top: 16px; }
.mt18 { margin-top: 18px; }
.mt22 { margin-top: 22px; }
.mt26 { margin-top: 26px; }
.mt34 { margin-top: 34px; }
.mb8 { margin-bottom: 8px; }
.mb9 { margin-bottom: 9px; }
.mb12 { margin-bottom: 12px; }
.mb14 { margin-bottom: 14px; }
.mb16 { margin-bottom: 16px; }
.mb22 { margin-bottom: 22px; }
.pt14 { padding-top: 14px; }
.pt34 { padding-top: 34px; }
.grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.lbl { display: block; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted); font-weight: 500; margin-bottom: 7px; }
.lede.sm { font-size: 13px; margin: 0 0 22px; }
/* Lines up under the sleeve, the way the archive's does. */
.expanded.lb { padding-left: 50px; }
.row-title.sm { font-size: 19px; }
.mini-score { font-size: 12px; min-width: 26px; text-align: right; }
.stat-name { font-size: 14px; }
.stat-best { margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--line); font-size: 12px; color: var(--muted); }
.btn.big { justify-content: flex-start; padding: 14px 18px; font-size: 15px; }
.member-line.topline { border-top: 1px solid var(--line-soft); }
.code { font-size: 12px; color: var(--muted); word-break: break-all; }
.edit-head { display: flex; gap: 16px; align-items: flex-start; padding: 16px 0 4px; border-top: 1px solid var(--line-soft); margin-top: 4px; }
.edit-art { width: 84px; height: 84px; border-radius: 2px; flex: none; overflow: hidden; background: var(--surface-2); }
.edit-art img { width: 100%; height: 100%; object-fit: cover; }
.res-blank { width: 46px; height: 46px; border-radius: 2px; flex: none; }
.res-title { display: block; font-size: 14px; }
.res-sub { display: block; font-size: 12px; color: var(--muted); }
.more { margin: 4px 0 18px; }
.more summary { cursor: pointer; font-size: 12px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--muted); }
.grid3 .field { margin-bottom: 14px; }

/* ---- Upcoming ---- */

.up-connect { max-width: 460px; padding: 56px 0 40px; }
.up-connect h2 { font-family: var(--font-display); font-size: 40px; font-weight: 400; line-height: 1.05; margin: 0 0 10px; }
.up-connect .lede { margin-bottom: 26px; }

.up-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--line-soft); margin-bottom: 22px; }
.up-views { display: flex; gap: 4px; }
.up-view { background: none; border: 0; cursor: pointer; white-space: nowrap; color: var(--muted); font-family: var(--font-ui); font-size: 12px; letter-spacing: 0.13em; text-transform: uppercase; padding: 8px 12px; border-radius: var(--radius); transition: color 0.18s var(--ease), background 0.18s var(--ease); }
.up-view:hover { color: var(--text-dim); }
.up-view[aria-selected="true"] { color: var(--accent); background: var(--accent-soft); }
.up-actions { display: flex; gap: 8px; }

.up-busy { display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--muted); letter-spacing: 0.06em; margin-bottom: 18px; }
.up-bar { width: 34px; height: 2px; background: var(--surface-3); border-radius: 2px; overflow: hidden; position: relative; flex: none; }
.up-bar::after { content: ""; position: absolute; inset: 0; width: 40%; background: var(--accent); animation: up-slide 1.1s var(--ease) infinite; }
@keyframes up-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }

.up-note { margin: -6px 0 18px; }
.up-empty { color: var(--muted); font-size: 14px; padding: 40px 0; max-width: 460px; line-height: 1.6; }

.up-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 20px; }
.up-filter { background: none; border: 1px solid var(--line); cursor: pointer; color: var(--muted); font-family: var(--font-ui); font-size: 12px; padding: 6px 13px; border-radius: 999px; transition: all 0.18s var(--ease); }
.up-filter:hover { color: var(--text-dim); border-color: var(--muted-2); }
.up-filter[aria-selected="true"] { color: var(--bg); background: var(--accent); border-color: var(--accent); }

.up-group { margin-bottom: 30px; }
.up-group-date { font-family: var(--font-ui); font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--muted-2); margin: 0 0 10px; padding-bottom: 8px; border-bottom: 1px solid var(--line-soft); }

.up-row { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
.up-row:last-child { border-bottom: 0; }
.up-art { width: 52px; height: 52px; flex: none; border-radius: 2px; overflow: hidden; background: var(--surface-2); }
.up-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.up-row-body { flex: 1; min-width: 0; }
.up-title { font-family: var(--font-display); font-size: 19px; margin: 0 0 1px; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.up-artist { font-size: 13px; color: var(--text-dim); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.up-meta { display: flex; align-items: center; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.up-pill { font-size: 10px; letter-spacing: 0.11em; text-transform: uppercase; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 3px 9px; }
.up-pill.soft { color: var(--muted); background: var(--surface-2); }
.up-when { font-size: 12px; color: var(--muted); }
.up-row-actions { display: flex; gap: 6px; flex: none; }

.up-artists { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 2px 24px; }
.up-artist-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line-soft); }
.up-artist-row .up-art { width: 36px; height: 36px; border-radius: 50%; }
.up-artist-name { flex: 1; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.up-artist-row.muted-row { opacity: 0.42; }
.up-disconnect { margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--line); }
.up-reset { margin-top: 34px; padding-top: 18px; border-top: 1px solid var(--line); }
.up-reset-panel { border: 1px solid var(--warn); border-radius: var(--radius);
  background: rgba(232, 128, 79, 0.05); padding: 16px 18px; max-width: 620px; }
.up-reset-title { margin: 0 0 6px; font-family: var(--font-display); font-size: 20px; color: var(--text); }
.up-reset-note { margin: 0 0 14px; font-size: 13.5px; line-height: 1.6; color: var(--text-dim); }
.up-reset-check { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 16px;
  font-size: 13px; color: var(--text-dim); cursor: pointer; }
.up-reset-check input { accent-color: var(--warn); width: 15px; height: 15px; flex: none; margin-top: 2px; }
.up-help { margin-top: 22px; }
.up-help .muted { margin: 10px 0; line-height: 1.6; }
.up-uri { display: block; padding: 10px 12px; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius); color: var(--accent); user-select: all; }
.up-picker { max-width: 560px; }
.up-picker .up-artist-row { cursor: pointer; }
.up-picker input[type="checkbox"] { accent-color: var(--accent); width: 15px; height: 15px; flex: none; }
.up-stats { display: flex; gap: 22px; margin-bottom: 16px; font-size: 12px; color: var(--muted); letter-spacing: 0.04em; }
.up-stats b { color: var(--text); font-family: var(--font-display); font-size: 17px; margin-right: 5px; font-weight: 400; }
.up-checked { margin-left: auto; color: var(--muted-2); }
.up-search { width: 100%; max-width: 320px; margin-bottom: 8px; }
.btn.ghost.on { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
/* ---- choosing a sleeve ---- */
.pick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr)); gap: 14px; margin: 4px 0 6px; }
.pick { display: flex; flex-direction: column; gap: 6px; text-align: left; cursor: pointer;
  background: none; border: 0; padding: 0; color: var(--text-dim); transition: color 0.16s var(--ease); }
.pick:hover:not(:disabled) { color: var(--text); }
.pick:disabled { opacity: 0.5; cursor: default; }
.pick-art { position: relative; width: 100%; aspect-ratio: 1; border-radius: 2px; overflow: hidden;
  background: var(--surface-2); display: block; outline: 2px solid transparent;
  transition: outline-color 0.16s var(--ease), transform 0.18s var(--ease); }
.pick-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pick:hover:not(:disabled) .pick-art { outline-color: var(--accent); outline-offset: 2px; transform: translateY(-2px); }
.pick-saving { position: absolute; inset: 0; display: grid; place-items: center;
  background: rgba(11,10,9,0.7); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
.pick-title { font-size: 12.5px; line-height: 1.3; color: inherit;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.pick-sub { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 18px;
  padding-top: 16px; border-top: 1px solid var(--line-soft); }

/* ---- the still-to-do list in Club settings ---- */
.art-todo { display: flex; flex-direction: column; margin-top: 14px; }
.art-todo-row { display: flex; align-items: center; gap: 13px; width: 100%; cursor: pointer; text-align: left;
  background: none; border: 0; border-bottom: 1px solid var(--line-soft); padding: 9px 2px;
  color: var(--text-dim); transition: color 0.16s var(--ease); }
.art-todo-row:hover { color: var(--text); }
.art-todo-row .min0 { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.art-todo-title { font-family: var(--font-display); font-size: 16px; line-height: 1.2; color: inherit;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-todo-sub { font-size: 11.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-todo-cta { flex: none; font-size: 12px; color: var(--accent); }

/* ---- artwork in the interface ---- */

/* The sleeve, enlarged and blurred behind the album header. Masked so it fades
   out before the panels rather than stopping at an edge. */
.album { position: relative; }
.album > *:not(.album-glow) { position: relative; z-index: 1; }
.album-glow {
  position: absolute; top: -60px; left: -80px; right: -80px; height: 520px;
  overflow: hidden; pointer-events: none; z-index: 0;
  /* closest-side reaches full transparency at every edge, so the wash has no
     boundary of its own — it just stops existing. */
  -webkit-mask-image: radial-gradient(ellipse closest-side at 50% 40%, #000 0%, rgba(0,0,0,0.5) 52%, transparent 100%);
  mask-image: radial-gradient(ellipse closest-side at 50% 40%, #000 0%, rgba(0,0,0,0.5) 52%, transparent 100%);
}
.album-glow img {
  width: 100%; height: 100%; object-fit: cover; display: block;
  filter: blur(64px) saturate(1.4); opacity: 0.38; transform: scale(1.3);
}

.album-tab .thumb { width: 34px; height: 34px; }

/* ---- the archive as a wall of sleeves ---- */
.arch-head { display: flex; justify-content: flex-end; margin-bottom: 8px; }
.wall { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 20px; }
.wall-item {
  display: flex; flex-direction: column; gap: 9px; cursor: pointer; text-align: left;
  background: none; border: 0; padding: 0; color: var(--text-dim); position: relative;
  transition: color 0.18s var(--ease);
}
.wall-item:hover, .wall-item[aria-selected="true"] { color: var(--text); }
.cover { width: 100%; aspect-ratio: 1; border-radius: 2px; overflow: hidden; background: var(--surface-2); }
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.wall-item .cover { transition: transform 0.22s var(--ease), outline-color 0.18s var(--ease); outline: 2px solid transparent; }
.wall-item:hover .cover { transform: translateY(-3px); }
.wall-item[aria-selected="true"] .cover { outline-color: var(--accent); outline-offset: 3px; }
.wall-meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.wall-title { font-family: var(--font-display); font-size: 16px; line-height: 1.2; color: inherit;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wall-sub { font-size: 11.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wall-avg { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 5px;
  font-family: var(--font-display); font-size: 17px; color: var(--text);
  background: rgba(11, 10, 9, 0.72); backdrop-filter: blur(6px);
  border-radius: 999px; padding: 3px 10px; }
.wall-crown { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); }
.wall-detail { margin-top: 24px; }
.swatches { display: flex; flex-wrap: wrap; gap: 7px; width: 100%; padding: 12px 0 4px; }
.swatch { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; padding: 0;
  border: 2px solid transparent; box-shadow: 0 0 0 1px var(--line) inset;
  transition: transform 0.15s var(--ease), border-color 0.15s var(--ease); }
.swatch:hover { transform: scale(1.12); }
.swatch.on { border-color: var(--text); }
.member-line { flex-wrap: wrap; }

/* ---- one album at a time ---- */
.album-tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 26px; scrollbar-width: none; }
.album-tabs::-webkit-scrollbar { display: none; }
/* A button does not inherit colour, so this has to be stated — leaving it off
   fell back to the UA's black on a near-black ground. */
.album-tab { flex: none; display: flex; align-items: center; gap: 11px; cursor: pointer; text-align: left;
  color: var(--text-dim); font-family: var(--font-ui);
  background: var(--surface); border: 1px solid var(--line); border-left-width: 2px;
  border-radius: var(--radius); padding: 11px 16px; max-width: 260px;
  transition: color 0.18s var(--ease), border-color 0.18s var(--ease), background 0.18s var(--ease); }
.album-tab:hover { color: var(--text); border-color: var(--muted-2); }
.album-tab[aria-selected="true"] { color: var(--text); background: var(--accent-soft);
  border-color: var(--accent-line); border-left-color: var(--accent); }
/* Hollow until you have scored or skipped it, so "not done" is a visible state
   rather than an absent one. */
.album-tab-dot { width: 7px; height: 7px; border-radius: 50%; flex: none;
  border: 1px solid var(--muted-2); box-sizing: border-box; }
.album-tab-dot.done { background: var(--accent); border-color: var(--accent); }
.album-tab-text { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.album-tab-who { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 500;
  color: var(--accent); margin-bottom: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-tab-title { font-family: var(--font-display); font-size: 17px; line-height: 1.2; color: inherit;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.album-tab-sub { font-size: 11.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- whose pick this is ---- */
.album-chooser { display: inline-flex; align-items: center; gap: 7px; margin: 0 0 12px;
  font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; font-weight: 500;
  color: var(--accent); border: 1px solid var(--accent-line); background: var(--accent-soft);
  border-radius: 100px; padding: 4px 12px 4px 10px; }
.album-chooser .dim { color: var(--muted); letter-spacing: inherit; }

/* ---- nudging a blank pick ---- */
.tab-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex: none;
  background: var(--warn); margin-left: 7px; vertical-align: 1px; animation: nudge-pulse 2.4s var(--ease) infinite; }
@keyframes nudge-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .tab-dot { animation: none; } }

.nudge { display: flex; margin: 22px 0 8px; border: 1px solid var(--accent);
  border-radius: var(--radius); overflow: hidden; background: var(--surface);
  animation: rise 0.5s var(--ease) both; }
.nudge-bar { width: 4px; flex: none; background: var(--accent); }
.nudge-body { flex: 1; min-width: 0; padding: 20px 22px 22px;
  background: linear-gradient(100deg, var(--accent-soft), transparent 62%); }
.nudge-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; margin-bottom: 7px; }
.nudge-title { font-size: clamp(25px, 3.6vw, 34px); line-height: 1.1; margin: 0; color: var(--text); }
.nudge-days { flex: none; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
  font-weight: 600; color: var(--accent); border: 1px solid var(--accent-line);
  border-radius: 100px; padding: 3px 10px; white-space: nowrap; }
.nudge-line { margin: 0 0 18px; max-width: 56ch; font-size: 14.5px; color: var(--text-dim); }

/* Last few days: the whole panel changes colour rather than shouting louder. */
.nudge.urgent { border-color: var(--warn); }
.nudge.urgent .nudge-bar { background: var(--warn); }
.nudge.urgent .nudge-body { background: linear-gradient(100deg, rgba(232, 128, 79, 0.1), transparent 62%); }
.nudge.urgent .nudge-days { color: var(--warn); border-color: var(--warn); }

.nudge-picks { display: flex; flex-direction: column; gap: 6px; }
.nudge-pick { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; cursor: pointer;
  background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 8px 14px 8px 8px; color: var(--text); font-family: var(--font-ui); font-weight: 300;
  transition: border-color 0.16s var(--ease), background 0.16s var(--ease); }
.nudge-pick:hover:not(:disabled) { border-color: var(--accent); background: var(--surface-2); }
.nudge-pick:disabled { opacity: 0.5; cursor: default; }
.nudge-pick-art { width: 40px; height: 40px; flex: none; border-radius: 2px; overflow: hidden;
  background: var(--surface-2); }
.nudge-pick-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nudge-pick-title { display: block; font-family: var(--font-display); font-size: 17px; line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nudge-pick-sub { display: block; font-size: 12px; color: var(--muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nudge-pick-go { margin-left: auto; flex: none; font-size: 10.5px; letter-spacing: 0.13em;
  text-transform: uppercase; font-weight: 500; color: var(--accent); }

/* ---- admin ---- */
.adm-list { display: flex; flex-direction: column; margin-top: 6px; }
.adm-item { border-bottom: 1px solid var(--line-soft); }
.adm-item:last-child { border-bottom: 0; }
.adm-item.open { background: var(--surface); border-radius: var(--radius); border-bottom-color: transparent; }

/* A button never inherits colour, so every text colour in here is stated outright. */
.adm-row { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left;
  background: none; border: 0; padding: 10px 12px; cursor: pointer; color: var(--text);
  font-family: var(--font-ui); font-size: 15px; font-weight: 300; border-radius: var(--radius);
  transition: background 0.16s var(--ease); }
.adm-row:hover { background: var(--surface-2); }
.adm-item.open .adm-row { background: none; }

.adm-art { width: 46px; height: 46px; flex: none; border-radius: 2px; overflow: hidden;
  background: var(--surface-2); display: flex; align-items: center; justify-content: center; }
.adm-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.adm-art.none { box-shadow: inset 0 0 0 1px var(--muted-2); }
.adm-art-tag { font-size: 9px; letter-spacing: 0.09em; text-transform: uppercase; color: #f7f2e8;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7); }

.adm-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.adm-title { font-family: var(--font-display); font-size: 18px; line-height: 1.25; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.adm-sub { font-size: 12.5px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.adm-scores { display: flex; gap: 6px; flex: none; }
.adm-score { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; padding: 3px 9px 3px 7px;
  border-radius: 999px; color: var(--text-dim); background: var(--surface-2); font-variant-numeric: tabular-nums; }
.adm-score.skip { color: var(--muted); }
.adm-score.zero { color: var(--warn); background: rgba(232, 128, 79, 0.12); }
.adm-flag { flex: none; display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%;
  font-size: 11px; color: var(--warn); box-shadow: inset 0 0 0 1px var(--warn); }

.adm-edit { padding: 2px 12px 18px; }
.adm-edit .admin-row:first-child { border-top: 1px solid var(--line-soft); }

.admin-row { display: grid; grid-template-columns: 120px 1fr; gap: 10px 16px; align-items: center;
  padding: 14px 0; border-bottom: 1px solid var(--line-soft); }
.admin-who { display: flex; align-items: center; gap: 9px; font-size: 14px; }
.admin-fields { display: flex; gap: 8px; align-items: center; }
.admin-fields .admin-score { width: 92px; flex: none; }
.admin-fields .btn { white-space: nowrap; }
.admin-row textarea { grid-column: 2; min-height: 62px; }
.admin-album { display: flex; gap: 18px; align-items: flex-start; }
.admin-art { width: 108px; height: 108px; flex: none; border-radius: 2px; overflow: hidden; background: var(--surface-2); }
.admin-art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.admin .field { margin-bottom: 14px; }
.mb12 { margin-bottom: 12px; }
.mt14 { margin-top: 14px; }
.take-score.dim { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted-2); }
input[type="range"]:disabled { opacity: 0.35; cursor: not-allowed; }
.mb16 { margin-bottom: 16px; }

@media (max-width: 700px) {
  .grid3 { grid-template-columns: 1fr; }
  .hide-sm { display: none; }
  .up-head { flex-direction: column; flex-wrap: nowrap; align-items: stretch; gap: 12px; }
  .up-views { flex-wrap: wrap; overflow-x: visible; min-width: 0; }
  .up-view { font-size: 11px; letter-spacing: 0.06em; padding: 7px 9px; }
  .up-actions { min-width: 0; align-items: center; flex-wrap: wrap; }
  .up-row { flex-wrap: wrap; }
  .up-row-actions { width: 100%; padding-left: 68px; }
  .up-artists { grid-template-columns: minmax(0, 1fr); }
  .up-artist-row { min-width: 0; }
  .adm-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; gap: 6px 12px; padding: 12px 8px; }
  .adm-art { grid-row: span 2; align-self: start; }
  .adm-scores { grid-column: 2 / -1; }
  .adm-edit { padding: 2px 8px 18px; }
  .up-stats { flex-wrap: wrap; gap: 10px 20px; }
  .up-checked { margin-left: 0; width: 100%; }
  .nudge-body { padding: 16px 16px 18px; }
  .expanded.lb { padding-left: 0; }
}

/* Everything below overrides a rule declared further down the sheet than the
   main 560px block near the top. At equal specificity the later declaration
   wins, so those overrides have to live here, after their base rules, or they
   silently do nothing. Three separate rules were dead this way. */
@media (max-width: 560px) {
  .admin-row { grid-template-columns: minmax(0, 1fr); }
  .admin-row textarea { grid-column: 1; }
  .admin-fields { flex-wrap: wrap; }
  .admin-album { flex-direction: column; }
  /* Three tabs never fit side by side legibly, so they stack full width and
     nothing has to be dragged into view. */
  .album-tabs { flex-wrap: wrap; overflow-x: visible; gap: 6px; margin-bottom: 20px; }
  .album-tab { flex: 1 1 100%; min-width: 0; max-width: none; padding: 9px 12px; }
}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
return (
<html lang="en">
<head>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@300;400;500;600;700&display=swap" />
<style dangerouslySetInnerHTML={{ __html: CSS }} />
</head>
<body>
<div id="app">{children}</div>
</body>
</html>
);
}
