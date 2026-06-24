# Netivot Olam

A lightweight web app for browsing and streaming Torah lessons (shiurim). Search
by rabbi, parasha, or date and play any lesson in the browser. Audio is read
from a **swappable storage backend** (Google Drive today, S3/anything later) and
metadata lives in a small SQLite catalog kept in sync by a background indexer.

## Architecture

The design keeps each concern in its own folder, with one clear seam between them:

```
Storage (Drive / local / …)  →  Indexer  →  SQLite catalog  →  API  →  Web UI + Player
```

- **Search runs against the catalog, never against storage.** Fast, and totally
  independent of where audio lives.
- **Storage is behind one interface** (`src/storage/types.ts`). Swapping backends
  = one new class + a config value. Nothing else changes.
- **Filename parsing lives in one file** (`src/indexer/parseFilename.ts`). The
  naming convention is the only fragile part, so it's isolated.

```
src/
  config.ts              env-driven config (no hardcoded secrets)
  db/
    index.ts             SQLite connection + schema
    lessons.ts           lesson catalog: search + CRUD (parameterized SQL)
    users.ts             login accounts
  storage/
    types.ts             StorageProvider interface  ← the swap seam
    local.ts             reads a local folder
    googleDrive.ts       reads a Google Drive folder
    index.ts             factory: picks backend from config
  indexer/
    parseFilename.ts     filename → metadata (the naming convention)
    indexer.ts           scan storage, add new files to the catalog
    scheduler.ts         run the indexer on a schedule
  auth/
    password.ts          scrypt password hashing
  api/
    server.ts            express wiring + sessions
    middleware.ts        requireAuth / requireAdmin
    routes/              auth, lessons (search + stream), admin (CRUD)
  index.ts               entry point
public/                  static frontend (no build step)
```

## Filename convention

```
<CODE>-<D1>-<D2>-<Parasha>-<Year>[-<TAG>...] - <Hebrew description>_<Hebrew rabbi name>.mp3
```

Examples:

```
AR-04-06-Chukat-TSFV - חוקת תשפו_ארנון הרב ישראל.mp3
BRK-04-06-Chukat-TSFV-Vaad - חוקת תשפו-ועד_ברוק הרב יוסף.mp3
DMN-04-06-Chukat-TSFV-VD-GNRL - תפילה-חוקת תשפו-כללי_דיאמנט הרב נחום.mp3
```

Parsed into: rabbi code, date code, parasha, Hebrew year, optional tags, a Hebrew
description, and the Hebrew rabbi name (reformatted to `הרב <given> <surname>`).
The rabbi code, year, date code, and tags are kept in the `extra` JSON column.

The date code is **day-month** (e.g. `04-06` = 4 June). Combined with the Hebrew
year from the description (`תשפו` → 5786, via gematria) the indexer builds a real
Gregorian `lesson_date`, then computes the matching **Hebrew calendar date**
(`@hebcal/core`) and stores it in `extra.hebrew_date`. The Hebrew-date step is
lazy-loaded and wrapped in try/catch, so it can never break indexing.

If the format ever changes, edit `src/indexer/parseFilename.ts` — that's the only
place that needs to change.

## Rabbi picker (editable config)

The home screen shows a row of rabbis as circular avatars. The list is driven by
`public/rabbis.json` — edit it freely:

```json
[
  { "rabbi_name": "יוסף ברוק", "pic": "public/bruk.png" },
  { "rabbi_name": "נחום דיאמנט", "pic": "public/diamant.png" }
]
```

- `rabbi_name` — matched against each lesson's rabbi (substring), so the short
  name `יוסף ברוק` matches the stored `הרב יוסף ברוק`.
- `pic` — path to the photo. Drop the image in `public/` (e.g. `public/bruk.png`).
  Until a photo exists, the circle shows the rabbi's name instead.

Clicking a circle filters the list to that rabbi; clicking it again clears it.
The interface is Hebrew, right-to-left.

## Quick start (local, no cloud needed)

```bash
npm install
cp .env.example .env
# set SESSION_SECRET and SEED_ADMIN_PASSWORD in .env
npm run seed:media      # creates a few sample lessons in ./media
npm run dev
```

Open http://localhost:3000 and sign in with `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`.

## Switching to Google Drive

1. Create a Google Cloud service account and download its JSON key.
2. Share the Drive folder of lessons with the service account's email (viewer).
3. In `.env`:

   ```
   STORAGE_PROVIDER=gdrive
   GDRIVE_FOLDER_ID=<the folder id from its URL>
   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
   ```

4. Restart. The indexer scans Drive on boot and on the `INDEX_CRON` schedule.

## Streaming from R2 / S3 (recommended for production)

Set `STORAGE_PROVIDER=r2` (or `s3`) and fill the `S3_*` vars in `.env`. The app
then issues short-lived signed URLs and the browser streams audio **directly from
the bucket** — audio bytes never pass through the app server. Local and Google
Drive backends fall back to proxy streaming automatically.

See `docs/streaming-architecture.md` for the full rationale and config.

## Adding another backend later

Create a class implementing `StorageProvider` (`listFiles`, `stat`, `open`,
`getSignedUrl`), then add a `case` to `src/storage/index.ts`. No other code changes.

## Security notes

- Passwords hashed with salted scrypt; login is generic to avoid user enumeration.
- All SQL is parameterized; editable fields are whitelisted.
- Sessions use httpOnly + sameSite cookies; `secure` is on in production.
- Local file access is guarded against path traversal.
- No secrets in source — everything comes from `.env` (git-ignored).

## Deploying cheaply

Runs as a single always-on process with a persistent disk for the SQLite file
(e.g. a small VPS or Fly.io with a volume). `npm run build && npm start`.
Avoid pure-serverless hosts — their filesystem is ephemeral and SQLite needs to persist.
