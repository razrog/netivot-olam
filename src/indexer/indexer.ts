import { storage } from '../storage/index.js';
import { lessons } from '../db/lessons.js';
import { config } from '../config.js';
import { parseFilename } from './parseFilename.js';
import { toHebrewDateString } from './hebrewCalendar.js';

// Scans the active storage backend and adds any file that isn't in the catalog
// yet. Idempotent: files already indexed (matched by storage_key) are skipped,
// so it is safe to run as often as you like.

export interface IndexResult {
  added: number;
  total: number;
}

export async function runIndex(): Promise<IndexResult> {
  const files = await storage.listFiles();
  let added = 0;

  for (const file of files) {
    if (lessons.getByKey(file.key)) continue; // already known

    const meta = parseFilename(file.name);

    // Enrich with the Hebrew calendar date (best-effort; never blocks indexing).
    if (meta.lesson_date) {
      const hebrewDate = await toHebrewDateString(meta.lesson_date);
      if (hebrewDate) meta.extra.hebrew_date = hebrewDate;
    }

    const duration = config.readDuration ? await readDuration(file.key, file.size) : null;

    lessons.create({
      storage_key: file.key,
      provider: storage.name,
      title: meta.title,
      rabbi: meta.rabbi,
      parasha: meta.parasha,
      lesson_date: meta.lesson_date,
      duration,
      extra: meta.extra,
    });
    added++;
  }

  return { added, total: files.length };
}

// Reads MP3 duration (seconds) via music-metadata. Best-effort and isolated:
// any failure returns null so a single odd file never aborts the scan.
async function readDuration(key: string, size?: number): Promise<number | null> {
  try {
    const stream = await storage.open(key);
    const { parseStream } = await import('music-metadata');
    const { Readable } = await import('node:stream');
    const { format } = await parseStream(
      stream as unknown as InstanceType<typeof Readable>,
      { mimeType: 'audio/mpeg', size },
      { duration: true }
    );
    return format.duration ? Math.round(format.duration) : null;
  } catch {
    return null;
  }
}
