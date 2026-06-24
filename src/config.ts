import 'dotenv/config';
import path from 'node:path';

// Single source of truth for configuration. Everything comes from env vars,
// so no secret is ever hardcoded. Each value has a safe default for local dev.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: envInt('PORT', 3000),
  isProd: process.env.NODE_ENV === 'production',

  // Used to sign session cookies. MUST be overridden in production.
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-insecure-secret',

  dbPath: path.resolve(process.env.DB_PATH ?? 'data/netivot.db'),

  // Which storage backend the app reads audio from.
  storageProvider: (process.env.STORAGE_PROVIDER ?? 'local') as 'local' | 'gdrive' | 'r2' | 's3',

  // How long a streaming signed URL stays valid (seconds).
  signedUrlTtl: envInt('SIGNED_URL_TTL', 600),

  local: {
    mediaDir: path.resolve(process.env.LOCAL_MEDIA_DIR ?? 'media'),
  },

  gdrive: {
    folderId: process.env.GDRIVE_FOLDER_ID ?? '',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
  },

  // S3-compatible storage (AWS S3 or Cloudflare R2). Secrets come from env only.
  s3: {
    bucket: process.env.S3_BUCKET ?? '',
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT ?? '', // R2: https://<account>.r2.cloudflarestorage.com
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },

  indexCron: process.env.INDEX_CRON ?? '*/15 * * * *',

  // Read each file's duration during indexing (best-effort). Disable with
  // READ_DURATION=false if you index a huge Drive library and want faster scans.
  readDuration: process.env.READ_DURATION !== 'false',

  seedAdmin: {
    email: (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').toLowerCase().trim(),
    password: process.env.SEED_ADMIN_PASSWORD ?? '',
  },
};

// Fail fast in production if the session secret was left at the insecure default.
if (config.isProd && config.sessionSecret === 'dev-only-insecure-secret') {
  throw new Error('SESSION_SECRET must be set to a strong random value in production.');
}
