// Turns a real filename into lesson metadata. This is the ONLY place that
// knows the naming convention — if the format ever changes, edit just this file.
//
// Format:
//
//   <CODE>-<D1>-<D2>-<Parasha>-<Year>[-<TAG>...] - <Hebrew description>_<Hebrew rabbi name>.mp3
//
// Real examples:
//
//   AR-04-06-Chukat-TSFV - חוקת תשפו_ארנון הרב ישראל.mp3
//   BRK-04-06-Chukat-TSFV-Vaad - חוקת תשפו-ועד_ברוק הרב יוסף.mp3
//   DMN-04-06-Chukat-TSFV-VD-GNRL - תפילה-חוקת תשפו-כללי_דיאמנט הרב נחום.mp3
//
// Structure:
//   • Everything before the LAST "_" is the "head"; after it is the Hebrew rabbi name.
//   • The head splits on " - " (space-hyphen-space): a Latin part and a Hebrew description.
//   • The Latin part is "-"-separated:
//       [0]      rabbi code              (AR, BRK, DMN…)
//       [1..]    consecutive numbers     -> the date (e.g. "04-06")
//       next     parasha                 (Chukat)
//       next     year                    (TSFV = תשפ״ו)
//       rest     tags                    (Vaad, VD, GNRL…)
//   • The Hebrew rabbi name is "<surname> הרב <given>", reformatted to "הרב <given> <surname>".
//
// The date code is day-month (e.g. "04-06" = 4 June). Combined with the Hebrew
// year from the description we build an ISO Gregorian `lesson_date`; the Hebrew
// calendar date is added later by the indexer (see hebrewCalendar.ts).

import { hebrewYearFromText, dayMonthToISO } from './hebrewCalendar.js';

export interface ParsedMeta {
  title: string;
  rabbi: string | null;
  parasha: string | null;
  lesson_date: string | null; // ISO Gregorian date, or null if it can't be built
  extra: {
    rabbi_code?: string;
    rabbi_name_raw?: string;
    year?: string; // transliterated Hebrew year, e.g. "TSFV"
    hebrew_year?: number; // numeric Hebrew year, e.g. 5786
    hebrew_year_str?: string; // Hebrew-letter year as written, e.g. "תשפו"
    date_code?: string; // raw date as written in the filename, e.g. "04-06"
    day?: number;
    month?: number;
    tags?: string[]; // Vaad / VD / GNRL …
    hebrew?: string; // the Hebrew description as written
    hebrew_date?: string; // filled in by the indexer via @hebcal/core
  };
}

export function parseFilename(filename: string): ParsedMeta {
  const base = filename.replace(/\.[^.]+$/, '').trim(); // strip extension

  // 1) Split off the Hebrew rabbi name (after the last underscore).
  const us = base.lastIndexOf('_');
  const head = us >= 0 ? base.slice(0, us).trim() : base;
  const rabbiRaw = us >= 0 ? base.slice(us + 1).trim() : '';

  // 2) Split the head into the Latin part and the Hebrew description.
  const sep = head.indexOf(' - ');
  const latin = (sep >= 0 ? head.slice(0, sep) : head).trim();
  const hebrew = sep >= 0 ? head.slice(sep + 3).trim() : '';

  // 3) Parse the Latin part positionally, but robustly.
  const seg = latin.split('-').map((s) => s.trim()).filter(Boolean);
  const rabbiCode = seg[0] || undefined;

  let i = 1;
  const dateParts: string[] = [];
  while (i < seg.length && /^\d+$/.test(seg[i])) dateParts.push(seg[i++]);
  const dateCode = dateParts.length ? dateParts.join('-') : undefined;

  const parasha = seg[i++] || null;
  const year = seg[i++] || undefined;
  const tags = seg.slice(i);

  // 4) Reformat the rabbi name: "<surname> הרב <given>" -> "הרב <given> <surname>".
  const rabbi = formatRabbi(rabbiRaw);

  // 5) Build the date. date_code is day-month; the Hebrew year comes from the
  //    description. Together they give a Gregorian ISO date.
  const day = dateParts[0] ? Number(dateParts[0]) : undefined;
  const month = dateParts[1] ? Number(dateParts[1]) : undefined;
  const hy = hebrewYearFromText(hebrew);
  const lesson_date = day && month ? dayMonthToISO(day, month, hy?.value ?? null) : null;

  // 6) Title: prefer the Hebrew description, else fall back to parasha + year.
  const title = hebrew || [parasha, year].filter(Boolean).join(' ') || base;

  return {
    title,
    rabbi,
    parasha,
    lesson_date,
    extra: {
      rabbi_code: rabbiCode,
      rabbi_name_raw: rabbiRaw || undefined,
      year,
      hebrew_year: hy?.value,
      hebrew_year_str: hy?.token,
      date_code: dateCode,
      day,
      month,
      tags: tags.length ? tags : undefined,
      hebrew: hebrew || undefined,
    },
  };
}

function formatRabbi(raw: string): string | null {
  if (!raw) return null;
  const marker = 'הרב';
  const idx = raw.indexOf(marker);
  if (idx < 0) return raw;
  const surname = raw.slice(0, idx).trim();
  const given = raw.slice(idx + marker.length).trim();
  return `${marker} ${given} ${surname}`.replace(/\s+/g, ' ').trim();
}
