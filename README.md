# Album Club

Three albums a month, one picked by each member. Score them out of 10, change your
mind all month, leave a review, star the tracks that got you. Everything is kept,
and next month starts a new selection.

Built for Will, Oli and Flik. Next.js (App Router) + Postgres, deployed on Vercel.

There is a click-by-click setup guide for getting this live without a terminal —
see the guide Claude produced alongside this file. The short version:

1. Put these files in a GitHub repo (drag and drop through github.com works).
2. Import the repo into Vercel and deploy.
3. In the Vercel project: **Storage → Create Database → Neon (Postgres)**, free
   plan, connected to this project. Vercel adds `DATABASE_URL` for you.
4. Redeploy so the app picks up the variable.
5. Open the URL. You get a one-time setup screen — club name, a shared passcode,
   and the member names. Tables create themselves; there is no migration step.

Send the others the URL and the passcode. They type it once, pick their name, done.
No accounts, no sign-ups.

---

## How it works

**Adding a month's albums.** On *This month*, hit **Add album** and type the artist
and album. It searches the iTunes catalogue and fills in the artwork, year and the
full tracklist for you. Everything stays editable by hand if the lookup gets it
wrong, and you can paste a direct Spotify or YouTube Music album link if you'd
rather not use the search links.

**Scores** are out of 10 to one decimal place, on a slider, changeable as often as
you like all month. Reviews and favourite tracks save themselves about a second
after you stop typing. Everyone can see everyone's scores and reviews at all times.

**Favourite tracks** are one tap when a tracklist was fetched. If not, type them in.

**Archive** holds every past month, ranked by average, with all the reviews.

**Leaderboard** is the all-time table plus a card per member: the average their
picks score (are you picking well?), the average they give (are you generous?),
and their best pick to date.

**Listen buttons** go to Spotify and YouTube Music. Where no direct album link is
stored they open a search for the artist and album, which lands in the right place
and never breaks.

---

## Backups

*Club* → **Download JSON** is the complete record: members, albums, every score,
review, favourite track and artwork link. **Download CSV** is the same data
flattened, one row per person per album, which opens straight in a spreadsheet.

Worth pulling a copy every few months and dropping it somewhere safe.

---

## The shape of the code

```
app/
  layout.tsx            shell + fonts
  page.tsx              the entire UI (one client component)
  globals.css           design system
  api/[[...slug]]/      every endpoint, one file
lib/
  core.ts               Postgres access, schema, sessions, helpers
```

**Data model.** `members`, `albums` (with `month` as `YYYY-MM`), `ratings` (one row
per member per album) and a `settings` key/value table. Tables are created on first
connection — `init()` in `lib/core.ts`.

**Auth** is one shared passcode, HMAC-signed into a cookie. The passcode hash and
signing secret live in the `settings` table, set during first-run setup. Setting a
`CLUB_PASSCODE` environment variable overrides the stored one (and invalidates
existing sessions, which is how you'd rotate it).

**Artwork** is stored as a URL from Apple's CDN rather than a copy of the image. If
a URL ever dies, the sleeve falls back to a generated gradient built from the artist
and title, so the layout never breaks.

---

## Changing things later

Edit a file in GitHub — either in the browser, or by dragging a replacement in —
and Vercel rebuilds and redeploys on its own within a minute or so.

## Local development

```bash
npm install
DATABASE_URL="postgres://..." npm run dev
```

Without `DATABASE_URL` the app runs in preview mode: sample albums, nothing saved.

## Adding or removing members

*Club* → Members. Renaming is safe at any time and keeps all history attached.
Removing is blocked for anyone who has picks or reviews on record — rename them
instead, so the archive stays intact.
