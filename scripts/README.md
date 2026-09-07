# Importing the spreadsheet history

`import-history.mjs` loads the years of album club kept in the old spreadsheet
into the database — albums, who chose them, every score and every review.

It needs `history.json` beside it. That file holds everyone's reviews, so it is
deliberately **not** committed: this repository is public. Drop the copy you
were sent into this folder before running.

```bash
DATABASE_URL="postgres://…" node scripts/import-history.mjs --dry-run   # look first
DATABASE_URL="postgres://…" node scripts/import-history.mjs             # then do it
```

`DATABASE_URL` is in the Vercel project under Settings → Environment Variables.

Running it twice is safe. Album ids are derived from the month, title and
artist, so a second run updates the same rows instead of creating duplicates,
and nothing outside those albums and ratings is touched.
