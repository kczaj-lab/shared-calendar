'use strict';

/* ==========================================================
   Availability logic — pure functions, no DOM.
   Shared by the app (index.html) and the tests (tests.html).
   ========================================================== */

/* "HH:MM" <-> minutes since midnight */
function toMinutes(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function fromMinutes(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * Dates of a repeating entry, as "YYYY-MM-DD" keys (inclusive range).
 * mode: "none" | "daily" | "weekdays" (Mon–Fri) | "weekly" (same weekday)
 * Uses UTC day arithmetic, so daylight-saving changes cannot shift dates.
 */
function expandRecurrence(startKey, mode, untilKey, maxCount = 366) {
  if (mode === 'none') return [startKey];
  const DAY = 24 * 60 * 60 * 1000;
  const toUtc = key => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const toKey = t => new Date(t).toISOString().slice(0, 10);
  const step = mode === 'weekly' ? 7 * DAY : DAY;
  const out = [];
  for (let t = toUtc(startKey), end = toUtc(untilKey); t <= end && out.length < maxCount; t += step) {
    const dow = new Date(t).getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (mode === 'weekdays' && (dow === 0 || dow === 6)) continue;
    out.push(toKey(t));
  }
  return out;
}

/* Merge overlapping or touching intervals [{s, e}] (minutes) */
function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a.s - b.s);
  const merged = [];
  for (const it of sorted) {
    const last = merged[merged.length - 1];
    if (last && it.s <= last.e) last.e = Math.max(last.e, it.e);
    else merged.push({ s: it.s, e: it.e });
  }
  return merged;
}

/**
 * Find time windows when nobody has a busy entry.
 *
 * @param entries   [{ date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM", ... }] — all users
 * @param dateKeys  dates to check, e.g. the 7 days of the visible week
 * @param opts      dayStartMin / dayEndMin — daily availability window (minutes)
 *                  minDurationMin          — shortest useful meeting (minutes)
 *                  todayKey, nowMin        — optional: skip past days and past hours of today
 *                  slotMinutes             — "now" is rounded up to this grid (default 30)
 * @returns [{ date, start, end }] with start/end in minutes
 */
function findCommonFreeSlots(entries, dateKeys, opts) {
  const { dayStartMin, dayEndMin, minDurationMin, todayKey = null, nowMin = 0, slotMinutes = 30 } = opts;
  const result = [];

  for (const date of dateKeys) {
    if (todayKey && date < todayKey) continue; // past day

    let from = dayStartMin;
    if (todayKey && date === todayKey) {
      from = Math.max(from, Math.ceil(nowMin / slotMinutes) * slotMinutes);
    }
    const to = dayEndMin;
    if (to - from < minDurationMin) continue;

    const busy = mergeIntervals(
      entries
        .filter(e => e.date === date)
        .map(e => ({ s: Math.max(toMinutes(e.start), from), e: Math.min(toMinutes(e.end), to) }))
        .filter(i => i.e > i.s)
    );

    let cursor = from;
    for (const b of busy) {
      if (b.s - cursor >= minDurationMin) result.push({ date, start: cursor, end: b.s });
      cursor = Math.max(cursor, b.e);
    }
    if (to - cursor >= minDurationMin) result.push({ date, start: cursor, end: to });
  }
  return result;
}
