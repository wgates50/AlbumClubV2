/* One-off import of the album club spreadsheet into the database.
 *
 *   DATABASE_URL="postgres://…" node scripts/import-history.mjs [--dry-run]
 *
 * Safe to run more than once: album ids are derived from the month, title and
 * artist, so a second run updates the same rows rather than making new ones.
 * It only ever touches the albums and ratings it is given — nothing else in
 * the database is read or written.
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const dry = process.argv.includes("--dry-run");
const CONN = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
if (!CONN) {
  console.error("Set DATABASE_URL first — copy it from the Vercel project's environment variables.");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const history = JSON.parse(await readFile(join(here, "history.json"), "utf8"));

const albumId = (e) =>
  "hist_" + createHash("sha1").update(`${e.month}|${e.title}|${e.artist}`).digest("hex").slice(0, 12);

const local = CONN.includes("localhost") || CONN.includes("127.0.0.1");
const pool = new pg.Pool({
  connectionString: CONN,
  ssl: local ? undefined : { rejectUnauthorized: false },
  max: 2,
});

try {
  const { rows: members } = await pool.query("select id, name from members");
  if (!members.length) {
    console.error("No members in this database yet — open the app and finish setup first.");
    process.exit(1);
  }
  const byName = new Map(members.map((m) => [m.name.trim().toLowerCase(), m.id]));
  const resolve = (name) => byName.get(String(name ?? "").trim().toLowerCase()) ?? null;

  /* Fail before writing anything if a name in the sheet has no member. */
  const unknown = new Set();
  for (const e of history) {
    if (e.chosenBy && !resolve(e.chosenBy)) unknown.add(e.chosenBy);
    for (const who of Object.keys(e.ratings)) if (!resolve(who)) unknown.add(who);
  }
  if (unknown.size) {
    console.error(`These names in the spreadsheet don't match a member: ${[...unknown].join(", ")}`);
    console.error(`Members in the database: ${members.map((m) => m.name).join(", ")}`);
    process.exit(1);
  }

  let albums = 0, ratings = 0;
  for (const e of history) {
    const id = albumId(e);
    const chosenBy = resolve(e.chosenBy);
    if (!dry) {
      await pool.query(
        `insert into albums (id, month, title, artist, year, chosen_by, tracks, created_at)
         values ($1,$2,$3,$4,null,$5,'[]',$6)
         on conflict (id) do update set month=excluded.month, title=excluded.title,
           artist=excluded.artist, chosen_by=excluded.chosen_by`,
        [id, e.month, e.title, e.artist, chosenBy, new Date(`${e.week}T12:00:00Z`)],
      );
    }
    albums++;

    for (const [who, r] of Object.entries(e.ratings)) {
      const memberId = resolve(who);
      if (!dry) {
        await pool.query(
          `insert into ratings (album_id, member_id, score, review, fav_tracks, updated_at)
           values ($1,$2,$3,$4,'[]',now())
           on conflict (album_id, member_id) do update set score=excluded.score, review=excluded.review`,
          [id, memberId, r.score, r.review ?? ""],
        );
      }
      ratings++;
    }
    console.log(`  ${e.month}  ${e.title} — ${e.artist}  (${Object.keys(e.ratings).length} ratings)`);
  }

  console.log(`\n${dry ? "Would import" : "Imported"} ${albums} albums and ${ratings} ratings.`);
  if (dry) console.log("Dry run — nothing was written. Drop --dry-run to do it for real.");
} finally {
  await pool.end();
}
