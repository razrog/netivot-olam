import { Router } from 'express';
import { lessons } from '../../db/lessons.js';
import { runIndex } from '../../indexer/indexer.js';

// Full CRUD on lesson metadata + manual reindex. Mounted behind requireAdmin.

export const adminRouter = Router();

// GET /api/admin/lessons — all lessons for the editor table
adminRouter.get('/lessons', (_req, res) => {
  res.json(lessons.search({}));
});

// PATCH /api/admin/lessons/:id — edit metadata. Only whitelisted fields are
// applied (see lessons.update); unknown keys are ignored.
adminRouter.patch('/lessons/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!lessons.get(id)) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const body = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim();
  if ('rabbi' in body) patch.rabbi = nullableStr(body.rabbi);
  if ('parasha' in body) patch.parasha = nullableStr(body.parasha);
  if ('lesson_date' in body) patch.lesson_date = nullableDate(body.lesson_date);
  if ('duration' in body) patch.duration = nullableInt(body.duration);
  if ('extra' in body && body.extra && typeof body.extra === 'object') patch.extra = body.extra;

  res.json(lessons.update(id, patch));
});

// DELETE /api/admin/lessons/:id — removes the catalog row only (never the file)
adminRouter.delete('/lessons/:id', (req, res) => {
  const ok = lessons.remove(Number(req.params.id));
  res.status(ok ? 204 : 404).end();
});

// POST /api/admin/reindex — scan storage now instead of waiting for the cron
adminRouter.post('/reindex', async (_req, res) => {
  try {
    res.json(await runIndex());
  } catch (err) {
    console.error('[reindex] failed:', err);
    res.status(500).json({ error: 'reindex failed' });
  }
});

function nullableStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function nullableInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function nullableDate(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
