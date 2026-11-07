// The connector's tools. Ring math mirrors hub/rings.js; writes match what the site itself saves (rings/rings.js
// "Log time", tasks/tasks.js newTask) and stay inside the limits firestore.rules sets.

import { query, getDoc, setDoc, patchDoc, deleteDoc } from './firestore.js';
import { dayKey, clock, weekday, localToEpoch, parseDate, parseClock, startOfDay, addDays, daysBetween, fmtExact } from './time.js';

const RINGS = ['body', 'mind', 'spirit'];
const DEFAULT_GOALS = { body: 30, mind: 30, spirit: 15 };
const PRACTICE_RING = { 'Breathwork Toolkit': 'spirit', 'Neuro-Ocular Activation': 'spirit', 'Mudras': 'body', 'Lower Body Innervation': 'body', 'Upper Body Innervation': 'body', 'Head Innervation': 'body' };
const practiceRing = (section) => PRACTICE_RING[section] || 'body';
const tzOf = (env) => env.TZ_NAME || 'America/Los_Angeles';
const RO = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

function needDate(s, name) {
  if (s === undefined || s === null || s === '') return null;
  if (!parseDate(s)) throw new Error(`${name} must be a date like 2026-11-07.`);
  return String(s).trim();
}
async function goalsOf(env) {
  const prefs = await getDoc(env, 'prefs', 'main');
  const g = prefs?.goals || {};
  return Object.fromEntries(RINGS.map((r) => [r, Number(g[r]) > 0 ? Number(g[r]) : DEFAULT_GOALS[r]]));
}
/** Every timed entry since `since` (epoch ms): Watch, Scroll and logged time from `activity`, practice from `sessions`. */
async function entriesSince(env, since) {
  const [activity, sessions] = await Promise.all([
    query(env, 'activity', { field: 'startedAt', value: since }),
    query(env, 'sessions', { field: 'timestamp', value: since }),
  ]);
  const out = [];
  for (const a of activity) if (a.seconds > 0 && RINGS.includes(a.ring)) out.push({ id: a.id, source: a.source, ring: a.ring, seconds: a.seconds, at: a.startedAt, title: a.title || (a.source === 'scroll' ? 'The Scroll' : a.source === 'manual' ? 'Logged time' : 'Video'), extra: a.extra || {} });
  const seen = new Set();
  for (const s of sessions) {
    const key = `${s.timestamp}|${s.section}|${s.movement}|${s.duration}`;
    if (seen.has(key) || !(Number(s.duration) > 0)) continue;
    seen.add(key);
    out.push({ source: 'practice', ring: practiceRing(s.section), seconds: Number(s.duration), at: Number(s.timestamp), title: s.movement || s.routine || s.section, section: s.section, routine: s.routine || null });
  }
  return out;
}
function byDay(entries, tz) {
  const days = {};
  for (const e of entries) { const d = days[dayKey(e.at, tz)] ||= { body: 0, mind: 0, spirit: 0 }; d[e.ring] += e.seconds; }
  return days;
}
function streak(days, today, met) {
  let n = 0, k = met(today) ? today : addDays(today, -1);
  while (met(k)) { n++; k = addDays(k, -1); }
  return n;
}
/** Practice movements of the same section and routine under 15 minutes apart become one session, like the Rings page. */
function sessionsOf(entries, tz) {
  const out = [];
  for (const e of [...entries].sort((a, b) => a.at - b.at)) {
    const end = e.at + e.seconds * 1000, last = out[out.length - 1];
    if (e.source === 'practice' && last?.source === 'practice' && last.section === e.section && last.routine === e.routine && e.at - last._end < 15 * 60000) {
      last.seconds += e.seconds; last._end = Math.max(last._end, end); last.movements++; continue;
    }
    out.push(e.source === 'practice'
      ? { source: 'practice', ring: e.ring, title: e.section + (e.routine && e.routine !== e.section ? ` · ${e.routine}` : ''), section: e.section, routine: e.routine, seconds: e.seconds, at: e.at, _end: end, movements: 1 }
      : { id: e.id, source: e.source, ring: e.ring, title: e.title, seconds: e.seconds, at: e.at, _end: end, tags: e.extra.tags || undefined, notes: e.extra.notes || undefined });
  }
  return out.reverse().map(({ _end, section, routine, ...s }) => ({ ...s, date: dayKey(s.at, tz), start: clock(s.at, tz), end: clock(_end, tz), length: fmtExact(s.seconds), at: undefined }));
}

/* ---------- tasks ---------- */
function bucketOf(t, today, nowClock) {
  if (t.completed) return 'done';
  if (!t.due) return 'needs a date';
  const n = daysBetween(today, t.due);
  if (n < 0 || (n === 0 && t.dueTime && t.dueTime < nowClock)) return 'overdue';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n <= 7) return 'this week';
  return 'later';
}
const BUCKET_ORDER = ['overdue', 'today', 'tomorrow', 'this week', 'later', 'needs a date', 'done'];
function cleanTime(s) { if (s === undefined) return undefined; if (s === null || s === '') return null; const c = parseClock(s); if (!c) throw new Error('due_time must be a time like 14:30 or 2:30pm.'); return `${String(c.h).padStart(2, '0')}:${String(c.mi).padStart(2, '0')}`; }
const autoId = () => { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; const r = crypto.getRandomValues(new Uint8Array(20)); return [...r].map((b) => a[b % a.length]).join(''); };
const taskOut = (t, today, nowClock) => ({ id: t.id, title: t.title, when: bucketOf(t, today, nowClock), due: t.due || null, dueTime: t.dueTime || null, list: t.section || (t.due ? 'due' : 'general'), notes: t.notes || undefined, estMinutes: t.estMinutes ?? undefined, completed: !!t.completed });

/* ---------- check-ins: drop the bulky raw trials, keep the scores ---------- */
function slim(v, depth = 0) {
  if (Array.isArray(v)) return v.length > 12 ? `[${v.length} items]` : v.map((x) => slim(x, depth + 1));
  if (v && typeof v === 'object') { if (depth > 4) return '{…}'; return Object.fromEntries(Object.entries(v).filter(([k]) => !/^(raw|trials|samples|events)$/i.test(k)).map(([k, x]) => [k, slim(x, depth + 1)])); }
  return v;
}

export const TOOLS = [
  {
    name: 'get_rings', title: 'Rings and streaks', annotations: RO,
    description: "Brian's Body / Mind / Spirit ring time per day (exact seconds), daily goals, which goals were met, totals for the range, and current streaks. Defaults to the last 7 days through today.",
    inputSchema: { type: 'object', properties: { start_date: { type: 'string', description: 'YYYY-MM-DD (default: 6 days before end_date)' }, end_date: { type: 'string', description: 'YYYY-MM-DD (default: today)' } } },
    async run(a, { env }) {
      const tz = tzOf(env), today = dayKey(Date.now(), tz);
      const end = needDate(a.end_date, 'end_date') || today, start = needDate(a.start_date, 'start_date') || addDays(end, -6);
      if (daysBetween(start, end) < 0) throw new Error('start_date is after end_date.');
      if (daysBetween(start, end) > 400) throw new Error('Ask for at most about a year at a time.');
      const from = daysBetween(start, addDays(today, -150)) < 0 ? start : addDays(today, -150);
      const [goals, entries] = await Promise.all([goalsOf(env), entriesSince(env, startOfDay(daysBetween(from, start) < 0 ? from : start, tz))]);
      const days = byDay(entries, tz);
      const metRing = (r) => (k) => (days[k]?.[r] || 0) >= goals[r] * 60;
      const metAll = (k) => RINGS.every((r) => metRing(r)(k));
      const list = [], totals = { body: 0, mind: 0, spirit: 0 };
      for (let k = start; daysBetween(k, end) >= 0; k = addDays(k, 1)) {
        const d = days[k] || { body: 0, mind: 0, spirit: 0 };
        RINGS.forEach((r) => { totals[r] += d[r]; });
        list.push({ date: k, weekday: weekday(startOfDay(k, tz) + 43200000, tz), ...Object.fromEntries(RINGS.map((r) => [r, { seconds: d[r], time: fmtExact(d[r]), goalMet: d[r] >= goals[r] * 60 }])), allThreeClosed: metAll(k) });
      }
      const t = days[today] || { body: 0, mind: 0, spirit: 0 };
      return {
        timeZone: tz, today,
        goalsMinutes: goals,
        todayProgress: Object.fromEntries(RINGS.map((r) => [r, { time: fmtExact(t[r]), percentOfGoal: Math.round((t[r] / (goals[r] * 60)) * 100), remaining: fmtExact(Math.max(0, goals[r] * 60 - t[r])) }])),
        streaksDays: { ...Object.fromEntries(RINGS.map((r) => [r, streak(days, today, metRing(r))])), allThree: streak(days, today, metAll) },
        range: { start, end, totals: Object.fromEntries(RINGS.map((r) => [r, fmtExact(totals[r])])), daysAllThreeClosed: list.filter((d) => d.allThreeClosed).length, days: list.length },
        days: list,
      };
    },
  },
  {
    name: 'list_time', title: 'Where the time went', annotations: RO,
    description: 'Every timed session in a date range, newest first: practice routines (grouped like the Rings page), videos, the Scroll and time logged by hand (with tags, notes and the id needed to delete a logged entry). Defaults to today.',
    inputSchema: { type: 'object', properties: { start_date: { type: 'string', description: 'YYYY-MM-DD (default: today)' }, end_date: { type: 'string', description: 'YYYY-MM-DD (default: start_date)' }, ring: { type: 'string', enum: RINGS } } },
    async run(a, { env }) {
      const tz = tzOf(env), today = dayKey(Date.now(), tz);
      const start = needDate(a.start_date, 'start_date') || today, end = needDate(a.end_date, 'end_date') || start;
      if (daysBetween(start, end) < 0) throw new Error('start_date is after end_date.');
      if (daysBetween(start, end) > 62) throw new Error('Ask for at most two months at a time.');
      const until = startOfDay(addDays(end, 1), tz);
      let entries = (await entriesSince(env, startOfDay(start, tz))).filter((e) => e.at < until);
      if (a.ring) entries = entries.filter((e) => e.ring === a.ring);
      const sessions = sessionsOf(entries, tz);
      return { timeZone: tz, start, end, count: sessions.length, sessions: sessions.slice(0, 200) };
    },
  },
  {
    name: 'log_time', title: 'Log time to a ring', annotations: WRITE,
    description: "Log something Brian did to one of his rings, exactly like '+ Log time' on the Rings page. ring: body (yoga, stretching, lymph drainage, innervation, mudras, exercise), mind (talks, books, learning, uplifting videos) or spirit (meditation, breathwork, neuro-ocular work, prayer). Give start and end clock times, or minutes (with an optional start). Defaults to today; with minutes only, it ends now.",
    inputSchema: { type: 'object', required: ['what', 'ring'], properties: {
      what: { type: 'string', description: 'What he did, e.g. "Lymph drainage"' }, ring: { type: 'string', enum: RINGS },
      date: { type: 'string', description: 'YYYY-MM-DD (default: today)' }, start: { type: 'string', description: 'Start clock time, e.g. 07:15 or 7:15am' }, end: { type: 'string', description: 'End clock time' },
      minutes: { type: 'number', description: 'Length in minutes, if no end time' }, tags: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } } },
    async run(a, { env }) {
      const tz = tzOf(env), now = Date.now(), today = dayKey(now, tz);
      const title = String(a.what || '').trim().slice(0, 200);
      if (!title) throw new Error('Say what was done.');
      if (!RINGS.includes(a.ring)) throw new Error('ring must be body, mind or spirit.');
      const date = needDate(a.date, 'date') || today, p = parseDate(date);
      const st = a.start ? parseClock(a.start) : null, en = a.end ? parseClock(a.end) : null;
      if (a.start && !st) throw new Error('start must be a time like 07:15 or 7:15am.');
      if (a.end && !en) throw new Error('end must be a time like 08:00 or 8pm.');
      const mins = a.minutes === undefined || a.minutes === null ? null : Number(a.minutes);
      if (mins !== null && !(mins > 0)) throw new Error('minutes must be more than 0.');
      let startMs, endMs;
      if (st && en) { startMs = localToEpoch(p.y, p.m, p.d, st.h, st.mi, tz); endMs = localToEpoch(p.y, p.m, p.d, en.h, en.mi, tz); if (endMs <= startMs) endMs = localToEpoch(...Object.values(parseDate(addDays(date, 1))), en.h, en.mi, tz); }
      else if (st && mins) { startMs = localToEpoch(p.y, p.m, p.d, st.h, st.mi, tz); endMs = startMs + mins * 60000; }
      else if (en && mins) { endMs = localToEpoch(p.y, p.m, p.d, en.h, en.mi, tz); startMs = endMs - mins * 60000; }
      else if (mins) { endMs = date === today ? now : localToEpoch(p.y, p.m, p.d, 12, 0, tz) + mins * 60000; startMs = endMs - mins * 60000; }
      else throw new Error('Give a start and end time, or minutes.');
      const seconds = Math.round((endMs - startMs) / 1000);
      if (seconds < 1) throw new Error('That adds up to no time.');
      if (seconds > 86400) throw new Error('One entry can be at most 24 hours.');
      if (startMs > now + 60000) throw new Error("That hasn't happened yet: pick a time in the past.");
      const tags = (Array.isArray(a.tags) ? a.tags : []).map((t) => String(t).trim().replace(/^#/, '').slice(0, 40)).filter(Boolean).slice(0, 12);
      const id = `manual-${startMs}-${Math.random().toString(36).slice(2, 7)}`;
      await setDoc(env, 'activity', id, { source: 'manual', ring: a.ring, ref: null, title, seconds, startedAt: startMs, endedAt: endMs, day: dayKey(startMs, tz), extra: { tags, notes: String(a.notes || '').slice(0, 2000) } });
      return { logged: true, id, ring: a.ring, what: title, date: dayKey(startMs, tz), start: clock(startMs, tz), end: clock(endMs, tz), length: fmtExact(seconds), tags };
    },
  },
  {
    name: 'delete_logged_time', title: 'Delete logged time', annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    description: 'Delete one entry that was logged by hand (source "manual"), by the id from list_time or log_time. Timed Watch, Scroll and practice sessions cannot be deleted here.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    async run(a, { env }) {
      const doc = await getDoc(env, 'activity', String(a.id || ''));
      if (!doc) throw new Error('No logged entry with that id.');
      if (doc.source !== 'manual') throw new Error('Only time logged by hand can be deleted here.');
      await deleteDoc(env, 'activity', doc.id);
      return { deleted: true, id: doc.id, what: doc.title, length: fmtExact(doc.seconds) };
    },
  },
  {
    name: 'list_tasks', title: 'Tasks', annotations: RO,
    description: "Brian's task list from 3D Anatomy's Tasks page, grouped overdue / today / tomorrow / this week / later / needs a date, with ids for update_task. Completed tasks only when include_done is true.",
    inputSchema: { type: 'object', properties: { include_done: { type: 'boolean' } } },
    async run(a, { env }) {
      const tz = tzOf(env), now = Date.now(), today = dayKey(now, tz), nowClock = clock(now, tz);
      const all = (await query(env, 'tasks')).filter((t) => a.include_done || !t.completed);
      const groups = {};
      for (const t of all) (groups[bucketOf(t, today, nowClock)] ||= []).push(taskOut(t, today, nowClock));
      for (const g of Object.values(groups)) g.sort((x, y) => `${x.due || '9'}${x.dueTime || '99'}`.localeCompare(`${y.due || '9'}${y.dueTime || '99'}`));
      return { today, open: all.filter((t) => !t.completed).length, groups: BUCKET_ORDER.filter((k) => groups[k]).map((k) => ({ when: k, tasks: groups[k].slice(0, 100) })) };
    },
  },
  {
    name: 'add_task', title: 'Add a task', annotations: WRITE,
    description: "Add a task to Brian's 3D Anatomy task list. With a due_date it goes under Due on that day; without one it goes under General.",
    inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string' }, due_date: { type: 'string', description: 'YYYY-MM-DD' }, due_time: { type: 'string', description: 'e.g. 14:30' }, notes: { type: 'string' }, est_minutes: { type: 'number' } } },
    async run(a, { env }) {
      const title = String(a.title || '').trim();
      if (!title || title.length > 300) throw new Error('A task needs a title of 1 to 300 characters.');
      const due = needDate(a.due_date, 'due_date'), dueTime = cleanTime(a.due_time) ?? null;
      const now = Date.now(), id = autoId();
      const doc = { title, notes: String(a.notes || '').slice(0, 5000), estMinutes: a.est_minutes > 0 ? Math.round(a.est_minutes) : null, section: due ? 'due' : 'general', due, dueTime: due ? dueTime : null, completed: false, completedAt: null, createdAt: now, updatedAt: now };
      await setDoc(env, 'tasks', id, doc);
      return { added: true, id, title, list: doc.section, due, dueTime: doc.dueTime };
    },
  },
  {
    name: 'update_task', title: 'Change or finish a task', annotations: WRITE,
    description: 'Change a task by id (from list_tasks): rename it, move or clear its due date (empty string clears it, moving it to General), change the time or notes, or mark it done / not done.',
    inputSchema: { type: 'object', required: ['task_id'], properties: { task_id: { type: 'string' }, title: { type: 'string' }, due_date: { type: 'string' }, due_time: { type: 'string' }, notes: { type: 'string' }, est_minutes: { type: 'number' }, done: { type: 'boolean' } } },
    async run(a, { env }) {
      const t = await getDoc(env, 'tasks', String(a.task_id || ''));
      if (!t) throw new Error('No task with that id.');
      const patch = { updatedAt: Date.now() };
      if (a.title !== undefined) { const s = String(a.title).trim(); if (!s || s.length > 300) throw new Error('Title must be 1 to 300 characters.'); patch.title = s; }
      if (a.due_date !== undefined) { const d = a.due_date === '' || a.due_date === null ? null : needDate(a.due_date, 'due_date'); patch.due = d; patch.section = d ? 'due' : 'general'; if (!d) patch.dueTime = null; }
      if (a.due_time !== undefined) patch.dueTime = cleanTime(a.due_time);
      if (a.notes !== undefined) patch.notes = String(a.notes).slice(0, 5000);
      if (a.est_minutes !== undefined) patch.estMinutes = a.est_minutes > 0 ? Math.round(a.est_minutes) : null;
      if (a.done !== undefined) { patch.completed = !!a.done; patch.completedAt = a.done ? Date.now() : null; }
      const after = await patchDoc(env, 'tasks', t.id, patch);
      const tz = tzOf(env);
      return { updated: true, task: taskOut(after, dayKey(Date.now(), tz), clock(Date.now(), tz)) };
    },
  },
  {
    name: 'get_checkins', title: 'Check-ins', annotations: RO,
    description: "Brian's check-ins (how he felt plus test scores such as mental math, reaction time, breath hold, range of motion), newest first, without the raw trial data.",
    inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'How many days back (default 30, max 365)' } } },
    async run(a, { env }) {
      const tz = tzOf(env), days = Math.min(365, Math.max(1, Number(a.days) || 30));
      const rows = await query(env, 'checkins', { field: 'startedAt', value: Date.now() - days * 86400000 });
      return { days, count: rows.length, checkins: rows.reverse().slice(0, 120).map((c) => ({ id: c.id, date: dayKey(c.startedAt, tz), time: clock(c.startedAt, tz), kind: { quick: 'daily', full: 'weekly', single: 'one test' }[c.kind] || c.kind, ...slim(Object.fromEntries(Object.entries(c).filter(([k]) => !['id', 'startedAt', 'kind', 'device'].includes(k)))) })) };
    },
  },
];
