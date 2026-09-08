/* Every one of these clears 4.5:1 against both the page ground and a card, so
   whichever a member picks, text drawn in it stays readable. The server checks
   incoming colours against this same list — the palette is the guarantee. */
export const PALETTE = [
  "#e0b25c", "#d9a04a", "#c9a227", "#d4886f", "#e4715a", "#e08fae",
  "#c48fd0", "#a98bd8", "#6f9ce0", "#6fc7d8", "#5fb3a1", "#9fbf7f",
];

import type { CSSProperties } from "react";

/* The whole stylesheet already draws from --accent, so overriding the three
   accent tokens on a wrapper re-themes everything inside it for free: the app
   in the signed-in member's colour, and each album in its chooser's. */
export function accentVars(hex: string | null | undefined): CSSProperties {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return {};
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lift = (v: number) => Math.round(v + (255 - v) * 0.34);
  return {
    "--accent": hex,
    "--accent-2": `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`,
    "--accent-soft": `rgba(${r}, ${g}, ${b}, 0.14)`,
    "--accent-line": `rgba(${r}, ${g}, ${b}, 0.34)`,
  } as CSSProperties;
}
