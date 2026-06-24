import { Router } from 'express';
import { lessons, type SearchFilter } from '../../db/lessons.js';
import { storage } from '../../storage/index.js';
import { config } from '../../config.js';

// Read-only routes for browsing and playing. Mounted behind requireAuth.

export const lessonsRouter = Router();

// GET /api/lessons?rabbi=&parasha=&date=&q=
lessonsRouter.get('/', (req, res) => {
  const filter: SearchFilter = {
    rabbi: str(req.query.rabbi),
    parasha: str(req.query.parasha),
    date: str(req.query.date),
    hyear: str(req.query.hyear),
    q: str(req.query.q),
  };
  res.json(lessons.search(filter));
});

// GET /api/lessons/facets -> distinct values for the dropdowns
lessonsRouter.get('/facets', (_req, res) => {
  res.json({
    rabbis: lessons.distinct('rabbi'),
    parshiyot: lessons.distinct('parasha'),
    years: lessons.distinctYears(),
  });
});

// GET /api/lessons/:id/play-url — the preferred way to play. Returns a short-
// lived signed URL the browser streams directly from the bucket (R2/S3), so
// audio bytes never pass through this server. For backends that can't sign
// (local folder, Google Drive) it returns the proxy-stream URL instead.
lessonsRouter.get('/:id/play-url', async (req, res) => {
  const lesson = lessons.get(Number(req.params.id));
  if (!lesson) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  try {
    const signed = await storage.getSignedUrl(lesson.storage_key, config.signedUrlTtl);
    if (signed) {
      res.json({ url: signed, expiresIn: config.signedUrlTtl });
      return;
    }
  } catch (err) {
    console.error('[play-url] sign failed, falling back to proxy:', err);
  }
  res.json({ url: `/api/lessons/${lesson.id}/stream`, expiresIn: null });
});

// GET /api/lessons/:id
lessonsRouter.get('/:id', (req, res) => {
  const lesson = lessons.get(Number(req.params.id));
  if (!lesson) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json(lesson);
});

// GET /api/lessons/:id/stream  — streams audio with HTTP range support so the
// player can seek. The browser never sees the storage backend or its credentials.
lessonsRouter.get('/:id/stream', async (req, res) => {
  const lesson = lessons.get(Number(req.params.id));
  if (!lesson) {
    res.status(404).end();
    return;
  }

  try {
    const { size, contentType } = await storage.stat(lesson.storage_key);
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader);
      if (!match) {
        res.status(416).set('Content-Range', `bytes */${size}`).end();
        return;
      }
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.status(416).set('Content-Range', `bytes */${size}`).end();
        return;
      }
      res.status(206).set({
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
      });
      const stream = await storage.open(lesson.storage_key, { start, end });
      pipe(stream, res);
      return;
    }

    res.status(200).set({
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(size),
    });
    const stream = await storage.open(lesson.storage_key);
    pipe(stream, res);
  } catch (err) {
    console.error('[stream] error:', err);
    if (!res.headersSent) res.status(500).end();
  }
});

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function pipe(stream: NodeJS.ReadableStream, res: import('express').Response): void {
  stream.on('error', (err) => {
    console.error('[stream] read error:', err);
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  stream.pipe(res);
}
