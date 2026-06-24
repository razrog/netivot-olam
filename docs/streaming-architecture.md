# Audio streaming architecture

## Goal

- Users press Play on the Netivot Olam site and audio streams efficiently.
- The app server is not loaded with audio bytes.
- Access stays private (login required).
- The storage backend stays swappable (R2, S3, local, Google Drive).

## How it works

```
User clicks Play on the site
        ↓
Frontend requests a play URL from the backend
        ↓
Backend validates the user session
        ↓
Backend returns a short-lived signed R2/S3 URL
        ↓
Frontend sets audio.src = signed URL
        ↓
Browser streams directly from R2/S3 (range requests / seeking included)
```

The user never leaves the site — the `<audio>` player stays embedded.

### Frontend

```ts
async function playLesson(lessonId) {
  const { url } = await (await fetch(`/api/lessons/${lessonId}/play-url`)).json();
  const audio = document.querySelector('audio');
  audio.src = url;
  await audio.play();
}
```

### Backend

```ts
lessonsRouter.get('/:id/play-url', requireAuth, async (req, res) => {
  const lesson = lessons.get(Number(req.params.id));
  const url = await storage.getSignedUrl(lesson.storage_key, config.signedUrlTtl);
  res.json({ url, expiresIn: config.signedUrlTtl });
});
```

## Why this is preferred

The app server handles only what it should: authentication, authorization,
search, metadata, and admin. R2/S3 handles audio streaming, HTTP range requests
(seeking), large-file delivery, bandwidth, and scaling. The app does not become
a media server.

### What to avoid

Proxying every audio byte through the app server:

```
R2 → App server → Browser
```

increases server bandwidth, CPU, memory, and concurrent-connection load, and
makes scaling more expensive.

## Storage abstraction

Every backend implements one interface (`src/storage/types.ts`):

```ts
interface StorageProvider {
  listFiles(): Promise<StoredFile[]>;
  stat(key): Promise<{ size; contentType }>;
  open(key, range?): Promise<ReadableStream>;        // proxy fallback + indexing
  getSignedUrl(key, expiresSeconds): Promise<string | null>;  // preferred path
}
```

Implementations: `LocalFolderProvider`, `GoogleDriveProvider`, `S3CompatibleProvider`
(used for both `r2` and `s3`).

- `r2` / `s3` return a real signed URL → browser streams directly from the bucket.
- `local` / `gdrive` return `null` from `getSignedUrl`, so `/play-url` falls back
  to proxy streaming via `/api/lessons/:id/stream`. Fine for dev; not recommended
  at scale.

## Metadata vs. audio

SQLite stores only metadata (`id, rabbi, parasha, lesson_date, hebrew_year,
storage_key, duration, …`). The audio files themselves live entirely in the
storage backend.

## Recommendation

Use Cloudflare R2 with short-lived signed URLs:

- Users stay on the site.
- Audio streams directly from R2 (seeking works naturally).
- Private access stays enforced (URLs are short-lived and issued only after auth).
- Very low operating cost.
- Migration to any S3-compatible storage is straightforward (same provider class,
  different endpoint/credentials).

### Configure R2

```
STORAGE_PROVIDER=r2
S3_BUCKET=netivot-shiurim
S3_REGION=auto
S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
SIGNED_URL_TTL=600
```

For AWS S3, set `STORAGE_PROVIDER=s3`, a real `S3_REGION`, and leave `S3_ENDPOINT`
blank.
