// Hebrew-calendar helpers, kept separate so the date logic lives in one place.
//
// The filename gives a day-month (e.g. "04-06" = 4 June) plus a Hebrew year
// written in Hebrew letters inside the description (e.g. "תשפו" = 5786). From
// those we build a real Gregorian date, then convert it to a Hebrew date.

const GEMATRIA: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50,
  ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
};

// Numeric value of a Hebrew-letter string (ignores punctuation/Latin).
export function gematria(token: string): number {
  let sum = 0;
  for (const ch of token) sum += GEMATRIA[ch] ?? 0;
  return sum;
}

// Find the Hebrew year token in a piece of text. Modern years are written
// without the thousands (תשפ״ו = 786, meaning 5786), so we look for a token
// whose gematria lands in the current-era band 700–899.
export function hebrewYearFromText(text: string): { value: number; token: string } | null {
  for (const token of text.split(/[\s\-]+/)) {
    const letters = token.replace(/[^א-ת]/g, ''); // keep only Hebrew letters
    if (!letters) continue;
    const g = gematria(letters);
    if (g >= 700 && g <= 899) return { value: 5000 + g, token: letters };
  }
  return null;
}

// Build an ISO Gregorian date from day, month, and the Hebrew year. The Hebrew
// year spans two Gregorian years; months Sep–Dec fall in (hebrewYear-3761),
// Jan–Aug in (hebrewYear-3760). Returns null if the inputs aren't a valid date.
export function dayMonthToISO(day: number, month: number, hebrewYear: number | null): string | null {
  if (!day || !month || !hebrewYear) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const gregYear = month >= 9 ? hebrewYear - 3761 : hebrewYear - 3760;
  const iso = `${gregYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : iso;
}

// Convert an ISO Gregorian date to a Hebrew date string (e.g. "ד׳ סיון תשפ״ו").
// @hebcal/core is imported lazily and any failure degrades to null, so this can
// never break indexing.
export async function toHebrewDateString(iso: string): Promise<string | null> {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    const { HDate } = await import('@hebcal/core');
    return new HDate(new Date(Date.UTC(y, m - 1, d))).renderGematriya();
  } catch {
    return null;
  }
}
