import { db } from './index.js';

// The lesson catalog. All searching happens here against indexed columns —
// never against the storage backend directly. Every query is parameterized,
// so user-supplied filter values can never alter the SQL structure.

export interface Lesson {
  id: number;
  storage_key: string;
  provider: string;
  title: string;
  rabbi: string | null;
  parasha: string | null;
  lesson_date: string | null;
  duration: number | null;
  extra: Record<string, unknown>;
  created_at: string;
}

export interface NewLesson {
  storage_key: string;
  provider: string;
  title: string;
  rabbi?: string | null;
  parasha?: string | null;
  lesson_date?: string | null;
  duration?: number | null;
  extra?: Record<string, unknown>;
}

export interface SearchFilter {
  rabbi?: string;
  parasha?: string;
  date?: string; // exact match, ISO YYYY-MM-DD
  hyear?: string; // Hebrew year as written, e.g. "תשפו" (stored in extra)
  q?: string; // keyword in title
}

// Columns a client is allowed to edit, mapped to validators. Anything not
// listed here is ignored — clients cannot touch id, storage_key, or provider.
const EDITABLE = ['title', 'rabbi', 'parasha', 'lesson_date', 'duration', 'extra'] as const;
type Editable = (typeof EDITABLE)[number];

function rowToLesson(row: any): Lesson {
  return { ...row, extra: safeParse(row.extra) };
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

// Title/honorific words ignored when matching a rabbi by name (compared with
// geresh/gershayim/dots removed, so "שליט״א" → "שליטא").
const RABBI_STOPWORDS = new Set(['הרב', 'ראש', 'הישיבה', 'המשגיח', 'הגאון', 'רבי', 'שליטא', 'הרהג']);
function rabbiNameWords(value: string): string[] {
  const stripMarks = (t: string) => t.replace(/[׳״'".]/g, '');
  return value
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t && !RABBI_STOPWORDS.has(stripMarks(t)));
}

export const lessons = {
  search(f: SearchFilter): Lesson[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    // Match by name words, ignoring titles/honorifics. We strip words like
    // "הרב", "ראש הישיבה", "המשגיח", "שליט״א" and require each remaining word
    // (e.g. first/last name) to appear in the stored rabbi. This makes a
    // decorated config name like "ראש הישיבה הרב יוסף ברוק שליט״א" match the
    // stored "הרב יוסף ברוק". Each word is its own parameter — no injection risk.
    if (f.rabbi) {
      for (const [i, word] of rabbiNameWords(f.rabbi).entries()) {
        where.push(`rabbi LIKE @rb${i}`);
        params[`rb${i}`] = `%${word}%`;
      }
    }
    if (f.parasha) { where.push('parasha = @parasha'); params.parasha = f.parasha; }
    if (f.date) { where.push('lesson_date = @date'); params.date = f.date; }
    if (f.hyear) { where.push("json_extract(extra, '$.hebrew_year_str') = @hyear"); params.hyear = f.hyear; }
    // Keyword searches across title, rabbi, and parasha — so typing a rabbi's
    // name finds his lessons even though it isn't in the title.
    if (f.q) { where.push('(title LIKE @q OR rabbi LIKE @q OR parasha LIKE @q)'); params.q = `%${f.q}%`; }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT * FROM lessons ${clause} ORDER BY lesson_date DESC, id DESC`;
    return db.prepare(sql).all(params).map(rowToLesson);
  },

  get(id: number): Lesson | undefined {
    const row = db.prepare('SELECT * FROM lessons WHERE id = ?').get(id);
    return row ? rowToLesson(row) : undefined;
  },

  getByKey(storageKey: string): Lesson | undefined {
    const row = db.prepare('SELECT * FROM lessons WHERE storage_key = ?').get(storageKey);
    return row ? rowToLesson(row) : undefined;
  },

  create(data: NewLesson): Lesson {
    const info = db
      .prepare(
        `INSERT INTO lessons (storage_key, provider, title, rabbi, parasha, lesson_date, duration, extra)
         VALUES (@storage_key, @provider, @title, @rabbi, @parasha, @lesson_date, @duration, @extra)`
      )
      .run({
        storage_key: data.storage_key,
        provider: data.provider,
        title: data.title,
        rabbi: data.rabbi ?? null,
        parasha: data.parasha ?? null,
        lesson_date: data.lesson_date ?? null,
        duration: data.duration ?? null,
        extra: JSON.stringify(data.extra ?? {}),
      });
    return this.get(Number(info.lastInsertRowid))!;
  },

  // Updates only whitelisted columns. Unknown keys are silently dropped.
  update(id: number, patch: Record<string, unknown>): Lesson | undefined {
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };
    for (const key of EDITABLE) {
      if (!(key in patch)) continue;
      const col = key as Editable;
      const value = patch[col];
      sets.push(`${col} = @${col}`);
      params[col] = col === 'extra' ? JSON.stringify(value ?? {}) : (value as any);
    }
    if (sets.length === 0) return this.get(id);
    db.prepare(`UPDATE lessons SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return this.get(id);
  },

  remove(id: number): boolean {
    return db.prepare('DELETE FROM lessons WHERE id = ?').run(id).changes > 0;
  },

  // Distinct values for the filter dropdowns. `field` is restricted to a
  // hardcoded set so the column name can never come from user input.
  distinct(field: 'rabbi' | 'parasha'): string[] {
    if (field !== 'rabbi' && field !== 'parasha') return [];
    const rows = db
      .prepare(`SELECT DISTINCT ${field} AS v FROM lessons WHERE ${field} IS NOT NULL AND ${field} <> '' ORDER BY v`)
      .all() as Array<{ v: string }>;
    return rows.map((r) => r.v);
  },

  // Distinct Hebrew years (stored inside the extra JSON) for the year dropdown.
  distinctYears(): string[] {
    const rows = db
      .prepare(
        `SELECT DISTINCT json_extract(extra, '$.hebrew_year_str') AS v
         FROM lessons WHERE v IS NOT NULL AND v <> '' ORDER BY v DESC`
      )
      .all() as Array<{ v: string }>;
    return rows.map((r) => r.v);
  },
};
