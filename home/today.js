// Home's "Today": where you stand at a glance, above the tiles. Today's three rings to the second with what's left of
// each goal, one quiet "Next up" suggestion, the last check-in against your 7-day average, the next tasks due, and on
// Sundays and Mondays a look back at the week. Suggests, never nags. Signed out, only the tiles show.
//
// Kept light: it listens to the last 15 days of time, 30 days of check-ins and the task list, all from the account's
// copy on this device first (account.js keeps one), so it fills in at once and then stays live.
import { hub } from '../hub/nav.js';
import { RINGS, DEFAULT_GOALS, byDay, activityEntries, practiceEntries, ringsSVG, today, fmtExact, dayKey, daysBack, sessionsOf, allStreak } from '../hub/rings.js';
import { METRICS, averageOf, trend, fmtMetric, median } from '../checkin/logic.js';
import { sectionOf, byDue, formatDue, isLate } from '../tasks/logic.js';

const account = hub.account;
const box = document.getElementById('today');
const state = { uid: null, activity: [], sessions: [], goals: { ...DEFAULT_GOALS }, checkins: [], tasks: null, unsubs: [] };
const CACHE_KEY = 'tolnri.home.today.v1';

// Where each kind of time can be done, for "Next up".
const PLACES = {
  'Breathwork Toolkit': ['../wellness/breathwork.html', 'Breathwork'],
  'Neuro-Ocular Activation': ['../wellness/eyes.html', 'Eyes'],
  'Mudras': ['../wellness/mudras.html', 'Mudras'],
  'Lower Body Innervation': ['../wellness/lower.html', 'Lower body'],
  'Upper Body Innervation': ['../wellness/upper.html', 'Upper body'],
  'Head Innervation': ['../wellness/head.html', 'Head'],
  scroll: ['../scroll/', 'The Scroll'],
  watch: ['../watch/', 'Watch'],
};
const FALLBACK = { body: 'Lower Body Innervation', mind: 'scroll', spirit: 'Breathwork Toolkit' };
const CHECK_SCORES = ['feel.clarity', 'math.correct', 'reaction.medianMs', 'breath.holdS'].map((id) => METRICS.find((m) => m.id === id));

const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(Am|Pm)\b/g, (x) => x.toUpperCase());
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Last visit's picture shows at once while the account loads.
try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c?.html && localStorage.getItem('tolnri.account.v1') === '1') { box.innerHTML = c.html; box.hidden = false; } } catch {}

hub.onUser((user) => {
  if ((user?.uid || null) === state.uid) return;
  state.unsubs.forEach((u) => u()); state.unsubs = [];
  state.uid = user?.uid || null;
  Object.assign(state, { activity: [], sessions: [], checkins: [], tasks: null, goals: { ...DEFAULT_GOALS } });
  if (!user) { box.hidden = true; box.replaceChildren(); return; }
  const sub = (p) => p.then((u) => state.unsubs.push(u)).catch(console.error);
  const since = daysBack(15).getTime();
  sub(account.watchCollection(state.uid, 'activity', (d) => { state.activity = d; render(); }, console.error, 'startedAt', since));
  sub(account.watchCollection(state.uid, 'sessions', (d) => { state.sessions = d; render(); }, console.error, 'timestamp', since));
  sub(account.watchCollection(state.uid, 'prefs', (d) => { state.goals = { ...DEFAULT_GOALS, ...(d.find((x) => x.id === 'main')?.goals || {}) }; render(); }, console.error));
  sub(account.watchCollection(state.uid, 'checkins', (d) => { state.checkins = d.sort((a, b) => b.startedAt - a.startedAt); render(); }, console.error, 'startedAt', daysBack(30).getTime()));
  sub(account.watchTasks(state.uid, (d) => { state.tasks = d; render(); }, console.error));
});
// The day turns over while the page is open: start the new day.
setInterval(() => { if (state.uid && render.day && render.day !== today()) render(); }, 60000);

function render() {
  render.day = today();
  const entries = [...activityEntries(state.activity), ...practiceEntries(state.sessions)];
  const days = byDay(entries);
  const t = days[today()] || {};
  const html = [ringsCard(t, days), nextUp(t, entries), checkCard(), tasksCard(), weekCard(days)].filter(Boolean).join('');
  box.innerHTML = html;
  box.hidden = false;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ html })); } catch {}
}

function ringsCard(t, days) {
  const pct = (id) => (t[id] || 0) / 60 / state.goals[id];
  const s = allStreak(days, state.goals);
  const rows = RINGS.map((r) => {
    const done = t[r.id] || 0, goal = state.goals[r.id] * 60, left = goal - done;
    return `<div class="td-ring" style="--c:${r.color}"><span class="td-dot"></span><b>${r.label}</b>
      <span class="td-time">${fmtExact(done)}<small> / ${state.goals[r.id]}m</small></span>
      <span class="td-left">${left > 0 ? `${fmtExact(left)} left` : 'closed ✦'}</span></div>`;
  }).join('');
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return `<section class="td-card td-rings">
    <a class="td-svg" href="../rings/" aria-label="Open Rings">${ringsSVG({ body: pct('body'), mind: pct('mind'), spirit: pct('spirit') }, 132, 13)}</a>
    <div class="td-ring-list"><div class="td-title">Today <small>${esc(date)}</small></div>${rows}
      <div class="td-streak">${s ? `${s} day${s === 1 ? '' : 's'} in a row closing all three` : 'Close all three to start a streak'}</div></div>
  </section>`;
}

// One suggestion: the ring furthest from its goal, and the thing you usually do for it, with how long that
// usually takes you.
function nextUp(t, entries) {
  const open = RINGS.map((r) => ({ r, frac: (t[r.id] || 0) / 60 / state.goals[r.id], left: state.goals[r.id] * 60 - (t[r.id] || 0) }))
    .filter((x) => x.left > 0).sort((a, b) => a.frac - b.frac);
  if (!open.length) return `<section class="td-card td-next"><b>All three rings are closed today.</b> <span>Anything more is a bonus.</span></section>`;
  const { r, left } = open[0];
  const recent = sessionsOf(entries.filter((e) => e.ring === r.id && e.at >= daysBack(14).getTime()));
  const keyOf = (x) => (x.source === 'practice' ? x.section : x.source);
  const counts = {};
  for (const x of recent) if (PLACES[keyOf(x)]) counts[keyOf(x)] = (counts[keyOf(x)] || 0) + 1;
  const key = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || FALLBACK[r.id];
  const [href, name] = PLACES[key];
  const typical = median(recent.filter((x) => keyOf(x) === key).map((x) => x.seconds));
  return `<section class="td-card td-next" style="--c:${r.color}">
    <span class="td-next-label">Next up</span>
    <span class="td-next-text"><b>${r.label}</b> is ${fmtExact(left)} short. <a href="${href}">${esc(name)}</a>${typical ? `, usually ${fmtExact(typical)} for you` : ''}.</span>
  </section>`;
}

function checkCard() {
  const list = state.checkins, last = list[0];
  if (!last) return `<section class="td-card td-check"><div class="td-title">Check-in</div><p class="td-muted">No check-ins in the last 30 days. <a href="../checkin/">Check in</a> when you like.</p></section>`;
  const when = new Date(last.startedAt);
  const whenText = dayKey(last.startedAt) === today()
    ? `today ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase()}`
    : when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const rows = CHECK_SCORES.map((m) => {
    const latest = list.find((c) => Number.isFinite(m.get(c)));
    if (!latest) return '';
    const v = m.get(latest), avg = averageOf(m, list, 7, latest.startedAt, latest.id);
    const tr = trend(m, v, avg?.avg ?? null);
    const arrow = tr === 'better' ? '▲' : tr === 'worse' ? '▼' : tr === 'same' ? '=' : '';
    return `<div class="td-score"><span>${esc(m.label)}</span><b>${esc(fmtMetric(m, v))}</b><span class="td-trend ${tr || ''}" title="${avg ? `7-day average ${esc(fmtMetric(m, avg.avg))}` : 'No 7-day average yet'}">${arrow}</span></div>`;
  }).join('');
  return `<section class="td-card td-check"><div class="td-title"><a href="../checkin/">Check-in</a> <small>last ${esc(whenText)}</small></div>
    <div class="td-scores">${rows}</div><p class="td-key">Arrows: against your 7-day average.</p></section>`;
}

function tasksCard() {
  if (!state.tasks) return '';
  const due = state.tasks.filter((t) => !t.completed && !t.deleted && sectionOf(t) === 'due' && t.due).sort(byDue).slice(0, 3);
  if (!due.length) return `<section class="td-card td-tasks"><div class="td-title"><a href="../tasks/">Tasks</a></div><p class="td-muted">Nothing due.</p></section>`;
  return `<section class="td-card td-tasks"><div class="td-title"><a href="../tasks/">Tasks</a> <small>next due</small></div>
    ${due.map((t) => `<a class="td-task${isLate(t) ? ' late' : ''}" href="../tasks/"><span>${esc(t.title)}</span><small>${esc(titleCase(formatDue(t)))}</small></a>`).join('')}</section>`;
}

// Sunday and Monday: the week in review (Sunday: this week so far; Monday: the week just finished).
function weekCard(days) {
  const dow = new Date().getDay();
  if (dow !== 0 && dow !== 1) return '';
  const end = dow === 0 ? 0 : 1; // days back to the week's Sunday
  const week = Array.from({ length: 7 }, (_, i) => dayKey(daysBack(end + 6 - i).getTime()));
  const tot = { body: 0, mind: 0, spirit: 0 };
  let best = null, closed = 0;
  for (const k of week) {
    const d = days[k];
    if (!d) continue;
    for (const r of RINGS) tot[r.id] += d[r.id] || 0;
    if (!best || d.total > days[best].total) best = k;
    if (RINGS.every((r) => (d[r.id] || 0) >= state.goals[r.id] * 60)) closed++;
  }
  const label = dow === 0 ? 'This week so far' : 'Last week';
  const bestText = best ? `${new Date(`${best}T12:00`).toLocaleDateString(undefined, { weekday: 'long' })}, ${fmtExact(days[best].total)}` : '–';
  // How check-ins moved: this week's average against the week before.
  const wkStart = daysBack(end + 6).getTime(), wkEnd = daysBack(end - 1).getTime();
  const moves = CHECK_SCORES.map((m) => {
    const vals = (from, to) => state.checkins.filter((c) => c.startedAt >= from && c.startedAt < to).map((c) => m.get(c)).filter(Number.isFinite);
    const a = vals(wkStart, wkEnd), b = vals(wkStart - 7 * 86400000, wkStart);
    if (!a.length || !b.length) return '';
    const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const tr = trend(m, avg(a), avg(b));
    return `<span class="td-move ${tr}">${esc(m.label)} ${tr === 'better' ? '▲' : tr === 'worse' ? '▼' : '='}</span>`;
  }).join('');
  return `<section class="td-card td-week"><div class="td-title">${label}</div>
    <div class="td-week-tot">${RINGS.map((r) => `<span style="--c:${r.color}"><span class="td-dot"></span>${r.label} <b>${fmtExact(tot[r.id])}</b></span>`).join('')}</div>
    <p class="td-muted">Best day: ${esc(bestText)} · all three closed on ${closed} of 7 days</p>
    ${moves ? `<div class="td-moves">${moves}<small> check-ins against the week before</small></div>` : ''}</section>`;
}
