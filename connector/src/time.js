// Local-time helpers. Workers run in UTC, so days and clock times are worked out in Brian's own time zone.

const pad = (n) => String(n).padStart(2, '0');
const fmtCache = new Map();
function parts(ts, tz) {
  if (!fmtCache.has(tz)) fmtCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }));
  const o = {}; for (const p of fmtCache.get(tz).formatToParts(new Date(ts))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: o.weekday };
}
export const dayKey = (ts, tz) => { const p = parts(ts, tz); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; };
export const clock = (ts, tz) => { const p = parts(ts, tz); return `${pad(p.h)}:${pad(p.mi)}`; };
export const weekday = (ts, tz) => parts(ts, tz).wd;

/** Epoch ms for a wall-clock time in tz. */
export function localToEpoch(y, m, d, h, mi, tz) {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = parts(guess, tz);
    const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
    guess += Date.UTC(y, m - 1, d, h, mi) - asUTC;
  }
  return guess;
}
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null;
}
export function parseClock(s) {
  const t = String(s || '').trim().toLowerCase();
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  let h = +m[1]; const mi = +(m[2] || 0);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return h < 24 && mi < 60 ? { h, mi } : null;
}
export const startOfDay = (key, tz) => { const p = parseDate(key); return localToEpoch(p.y, p.m, p.d, 0, 0, tz); };
export function addDays(key, n) { const p = parseDate(key); const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
export function daysBetween(a, b) { const pa = parseDate(a), pb = parseDate(b); return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000); }

export function fmtExact(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  if (h) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}
