// Body / Mind / Spirit: the three rings, shared by Watch, Scroll, Rings and the Dashboard.
//
// Time comes from two places:
//   - users/<id>/activity: one document per Watch or Scroll session, rewritten as it goes (so time already spent is
//     kept even if the page closes mid-video) and never more than the time actually spent.
//   - the practice pages' own records (users/<id>/sessions, and this device's copy in localStorage), mapped to a ring
//     by their section name.

export const RINGS = [
  { id: 'body', label: 'Body', color: '#3fe08f', hint: 'Yoga, stretching, lymph drainage, innervation, mudras' },
  { id: 'mind', label: 'Mind', color: '#e6bd6a', hint: 'Talks, books, the Scroll, uplifting videos' },
  { id: 'spirit', label: 'Spirit', color: '#a77bff', hint: 'Meditation, breathwork, neuro-ocular work' },
];
export const ringOf = (id) => RINGS.find((r) => r.id === id) || RINGS[1];
export const DEFAULT_GOALS = { body: 30, mind: 30, spirit: 15 }; // minutes a day

// Practice page sections → rings. Anything unknown counts toward Body.
const PRACTICE_RING = {
  'Breathwork Toolkit': 'spirit',
  'Neuro-Ocular Activation': 'spirit',
  'Mudras': 'body',
  'Lower Body Innervation': 'body',
  'Upper Body Innervation': 'body',
  'Head Innervation': 'body',
};
export const practiceRing = (section) => PRACTICE_RING[section] || 'body';

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const today = () => dayKey(Date.now());
export function daysBack(n) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; }

export function fmtMin(seconds) {
  if (seconds > 0 && seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
export function fmtClock(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// The practice records on this device, plus any in the account, without counting one twice.
const PRACTICE_KEY = 'innervation-atlas-time-data';
export function practiceEntries(cloudSessions = []) {
  let local = [];
  try { local = JSON.parse(localStorage.getItem(PRACTICE_KEY) || '{}').sessions || []; } catch {}
  const seen = new Set(), out = [];
  for (const s of [...cloudSessions, ...local]) {
    const key = `${s.timestamp}|${s.section}|${s.movement}|${s.duration}`;
    if (seen.has(key) || !(Number(s.duration) > 0)) continue;
    seen.add(key);
    out.push({ source: 'practice', ring: practiceRing(s.section), seconds: Number(s.duration), at: Number(s.timestamp), title: s.movement || s.routine || s.section, section: s.section });
  }
  return out;
}
export function activityEntries(docs = []) {
  return docs.filter((a) => a.seconds > 0).map((a) => ({ source: a.source, ring: a.ring, seconds: a.seconds, at: a.startedAt, title: a.title, ref: a.ref }));
}

/** { 'YYYY-MM-DD': { body, mind, spirit, total } } in seconds */
export function byDay(entries) {
  const days = {};
  for (const e of entries) {
    const k = dayKey(e.at);
    const d = days[k] ||= { body: 0, mind: 0, spirit: 0, total: 0 };
    d[e.ring] = (d[e.ring] || 0) + e.seconds;
    d.total += e.seconds;
  }
  return days;
}

/** Days in a row (ending today, or yesterday if today isn't closed yet) where a ring met its goal. */
export function streak(days, ring, goalMin) {
  const met = (k) => (days[k]?.[ring] || 0) >= goalMin * 60;
  let n = 0, i = met(today()) ? 0 : 1;
  for (;; i++) { if (met(dayKey(daysBack(i).getTime()))) n++; else break; }
  return n;
}
/** Days in a row where every ring met its goal. */
export function allStreak(days, goals) {
  const met = (k) => RINGS.every((r) => (days[k]?.[r.id] || 0) >= goals[r.id] * 60);
  let n = 0, i = met(today()) ? 0 : 1;
  for (;; i++) { if (met(dayKey(daysBack(i).getTime()))) n++; else break; }
  return n;
}

/** Three nested rings as SVG. values: { body, mind, spirit } as 0..1+ of goal. */
export function ringsSVG(values, size = 160, stroke = 14) {
  const c = size / 2;
  const arcs = RINGS.map((r, i) => {
    const rad = c - stroke / 2 - i * (stroke + 4);
    const len = 2 * Math.PI * rad;
    const v = Math.max(0, values[r.id] || 0);
    const shown = Math.min(v, 1) * len;
    return `<circle cx="${c}" cy="${c}" r="${rad}" fill="none" stroke="${r.color}" stroke-opacity="0.16" stroke-width="${stroke}"/>
      <circle cx="${c}" cy="${c}" r="${rad}" fill="none" stroke="${r.color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${shown} ${len}" transform="rotate(-90 ${c} ${c})" style="filter: drop-shadow(0 0 ${v >= 1 ? 6 : 2}px ${r.color})"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Body, Mind and Spirit rings">${arcs}</svg>`;
}

/**
 * Times one session (a video, a Scroll visit) and keeps it in users/<id>/activity. Counts only while running, at most
 * one second per real second, stops when the page is hidden, and rewrites the same document every 20 seconds and on
 * every stop, so time already spent survives a closed tab and is never counted twice.
 */
export class SessionTimer {
  constructor({ account, uid, source, ring, ref = null, title = '', onSave = null, onError = console.error }) {
    Object.assign(this, { account, uid, source, ring, ref, title, onSave, onError });
    this.id = null; this.startedAt = null; this.counted = 0; this.since = null; this.saved = 0; this.extra = {};
    this.tick = setInterval(() => { if (this.since != null) this.save(); }, 20000);
    this.onHide = () => { if (document.hidden) this.pause(); };
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', () => this.pause());
  }
  get seconds() { return this.counted + (this.since != null ? (performance.now() - this.since) / 1000 : 0); }
  get running() { return this.since != null; }
  start() {
    if (this.since != null || document.hidden) return;
    if (!this.startedAt) { this.startedAt = Date.now(); this.id = `${this.source}-${this.startedAt}-${Math.random().toString(36).slice(2, 7)}`; }
    this.since = performance.now();
  }
  pause() {
    if (this.since == null) return;
    this.counted += (performance.now() - this.since) / 1000;
    this.since = null;
    this.save();
  }
  save() {
    const seconds = Math.floor(this.seconds);
    if (!this.id || seconds < 1 || seconds === this.saved) return;
    const delta = seconds - this.saved;
    this.saved = seconds;
    this.account.putDoc(this.uid, 'activity', this.id, {
      source: this.source, ring: this.ring, ref: this.ref, title: String(this.title || '').slice(0, 200),
      seconds: Math.min(seconds, 14400), startedAt: this.startedAt, endedAt: Date.now(), day: dayKey(this.startedAt), extra: this.extra,
    }, this.onError);
    this.onSave?.(delta, seconds);
  }
  end() {
    this.pause();
    clearInterval(this.tick);
    document.removeEventListener('visibilitychange', this.onHide);
  }
}
