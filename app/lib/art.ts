/* A sleeve that always renders: when there is no artwork URL, or the URL dies,
   the same artist+title string always yields the same two-tone gradient. */
export function fallbackArt(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(145deg, hsl(${h} 34% 24%), hsl(${(h + 48) % 360} 40% 13%))`;
}
