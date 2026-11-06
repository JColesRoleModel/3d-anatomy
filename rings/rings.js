// Rings: every bit of Body / Mind / Spirit time in one place, so the practice stats and the rings are the same
// numbers. Today's rings and streaks; then any stretch of time (this week, a month, all time, or two dates) with its
// totals, a chart of the trend, where the time went (practice by section and routine, each video, the Scroll), and
// every session with its time and length, practice down to each movement. Then the last 12 weeks and the goals.
import { $, $$, h, fill, toast, onError, signedInPage, account } from '../hub/page.js';
import { RINGS, ringOf, DEFAULT_GOALS, byDay, activityEntries, practiceEntries, streak, allStreak, ringsSVG, dayKey, daysBack, today, fmtMin, fmtClock, sessionsOf } from '../hub/rings.js';

const DAY = 864e5;
const SOURCE = { watch: 'Watch', scroll: 'Scroll', practice: 'Practice' };
const state = { uid: null, activity: [], sessions: [], goals: { ...DEFAULT_GOALS }, unsubs: [], range: 'week', offset: 0, from: '', to: '', logDays: 14 };

signedInPage({
  gateText: 'Sign in to see your Body, Mind and Spirit rings and every session behind them.',
  onUser(user) {
    state.unsubs.forEach((u) => u()); state.unsubs = [];
    state.uid = user?.uid || null;
    if (!user) return;
    render();
    account.watchCollection(state.uid, 'activity', (docs) => { state.activity = docs; render(); }, onError).then((u) => state.unsubs.push(u)).catch(onError);
    account.watchCollection(state.uid, 'prefs', (docs) => {
      state.goals = { ...DEFAULT_GOALS, ...(docs.find((d) => d.id === 'main')?.goals || {}) };
      render(); renderGoals();
    }, onError).then((u) => state.unsubs.push(u)).catch(onError);
    // Practice records arrive live too, so a routine done on another device shows up here within seconds
    account.watchCollection(state.uid, 'sessions', (docs) => { state.sessions = docs; render(); }, onError).then((u) => state.unsubs.push(u)).catch(onError);
    renderGoals();
  },
});

const allEntries = () => [...activityEntries(state.activity), ...practiceEntries(state.sessions)];
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmtDate = (d, o = { month: 'short', day: 'numeric' }) => new Date(d).toLocaleDateString(undefined, o);
const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/* ---------- Which stretch of time ---------- */
function rangeBounds(all) {
  const now = new Date();
  if (state.range === 'week') {
    const start = daysBack((now.getDay() + 6) % 7 - state.offset * 7);
    return { start, end: new Date(start.getTime() + 7 * DAY - 1), label: `${fmtDate(start)} – ${fmtDate(start.getTime() + 6 * DAY)}` };
  }
  if (state.range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() + state.offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1, 0, 0, 0, -1);
    return { start, end, label: fmtDate(start, { month: 'long', year: 'numeric' }) };
  }
  if (state.range === 'all') {
    const first = all.length ? Math.min(...all.map((e) => e.at)) : Date.now();
    const start = startOfDay(first);
    return { start, end: new Date(startOfDay(now).getTime() + DAY - 1), label: `Since ${fmtDate(start, { month: 'short', day: 'numeric', year: 'numeric' })}` };
  }
  const from = state.from ? new Date(state.from + 'T00:00') : daysBack(29);
  const to = state.to ? new Date(state.to + 'T00:00') : startOfDay(now);
  const [a, b] = from <= to ? [from, to] : [to, from];
  return { start: a, end: new Date(b.getTime() + DAY - 1), label: `${fmtDate(a)} – ${fmtDate(b)}` };
}

$$('#range-tabs .t-seg-btn').forEach((b) => b.addEventListener('click', () => {
  state.range = b.dataset.range; state.offset = 0; state.logDays = 14;
  if (state.range === 'custom' && !state.from) { state.from = dayKey(daysBack(29).getTime()); state.to = today(); $('#from').value = state.from; $('#to').value = state.to; }
  render();
}));
$('#prev').addEventListener('click', () => { state.offset--; state.logDays = 14; render(); });
$('#next').addEventListener('click', () => { if (state.offset < 0) { state.offset++; state.logDays = 14; render(); } });
$('#from').addEventListener('change', (e) => { state.from = e.target.value; render(); });
$('#to').addEventListener('change', (e) => { state.to = e.target.value; render(); });

/* ---------- Render ---------- */
function render() {
  if (!state.uid) return;
  const all = allEntries();
  const days = byDay(all);
  renderToday(days);
  renderRange(all);
  renderHeat(days);
}

function renderToday(days) {
  const t = days[today()] || {};
  const pct = (id) => (t[id] || 0) / 60 / state.goals[id];
  $('#big').innerHTML = ringsSVG({ body: pct('body'), mind: pct('mind'), spirit: pct('spirit') }, 210, 18);
  fill($('#legend'), RINGS.map((r) => h('div', { class: 'r-leg', style: `--c:${r.color}` },
    h('div', { class: 'r-leg-label' }, r.label),
    h('div', { class: 'r-leg-num' }, h('b', {}, fmtMin(t[r.id] || 0)), ` / ${state.goals[r.id]}m`),
    h('div', { class: 'r-leg-pct' }, (t[r.id] || 0) >= state.goals[r.id] * 60 ? 'Closed ✦' : `${Math.round(pct(r.id) * 100)}%`))));
  fill($('#streaks'),
    h('div', { class: 'r-streak all' }, h('b', {}, allStreak(days, state.goals)), h('span', {}, 'days closing all three')),
    RINGS.map((r) => h('div', { class: 'r-streak', style: `--c:${r.color}` }, h('b', {}, streak(days, r.id, state.goals[r.id])), h('span', {}, `${r.label} in a row`))));
}

function renderRange(all) {
  $$('#range-tabs .t-seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.range === state.range));
  const { start, end, label } = rangeBounds(all);
  $('#range-label').textContent = label;
  $('#range-nav').classList.toggle('hidden', state.range === 'all' || state.range === 'custom');
  $('#range-dates').classList.toggle('hidden', state.range !== 'custom');
  $('#next').disabled = state.offset >= 0;

  const inRange = all.filter((e) => e.at >= start.getTime() && e.at <= end.getTime());
  const days = byDay(inRange);
  const lastDay = Math.min(end.getTime(), startOfDay(new Date()).getTime() + DAY - 1);
  const dayCount = Math.max(1, Math.round((startOfDay(lastDay).getTime() - start.getTime()) / DAY) + 1);

  // Totals
  const tot = { body: 0, mind: 0, spirit: 0 };
  inRange.forEach((e) => { tot[e.ring] += e.seconds; });
  const sessions = sessionsOf(inRange);
  const metDays = (id) => Object.values(days).filter((d) => (d[id] || 0) >= state.goals[id] * 60).length;
  fill($('#totals'),
    RINGS.map((r) => h('div', { class: 'r-tot', style: `--c:${r.color}` },
      h('span', {}, r.label), h('b', {}, fmtMin(tot[r.id])),
      h('small', {}, `${fmtMin(tot[r.id] / dayCount)} a day · goal met ${metDays(r.id)} of ${dayCount} day${dayCount === 1 ? '' : 's'}`))),
    h('div', { class: 'r-tot all' }, h('span', {}, 'Total'), h('b', {}, fmtMin(tot.body + tot.mind + tot.spirit)),
      h('small', {}, `${sessions.length} session${sessions.length === 1 ? '' : 's'} · ${Object.keys(days).length} active day${Object.keys(days).length === 1 ? '' : 's'}`)));

  renderChart(start, new Date(lastDay), days);
  renderBreakdown(inRange);
  renderLog(sessions);
}

/* A stacked bar per day (or per week for long stretches), with the daily goal as a dashed line. */
function renderChart(start, end, days) {
  const span = Math.round((startOfDay(end).getTime() - start.getTime()) / DAY) + 1;
  const weekly = span > 62;
  const buckets = [];
  if (!weekly) {
    for (let i = 0; i < span; i++) { const d = new Date(start.getTime() + i * DAY); buckets.push({ d, v: days[dayKey(d.getTime())] || {}, n: 1 }); }
  } else {
    let d = new Date(start); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // weeks start on Monday
    for (; d <= end; d = new Date(d.getTime() + 7 * DAY)) {
      const v = { body: 0, mind: 0, spirit: 0 };
      for (let i = 0; i < 7; i++) { const x = days[dayKey(d.getTime() + i * DAY)]; if (x) RINGS.forEach((r) => { v[r.id] += x[r.id] || 0; }); }
      buckets.push({ d: new Date(d), v, n: 7 });
    }
  }
  const W = 720, H = 220, padL = 34, padB = 26, padT = 10;
  const goal = (state.goals.body + state.goals.mind + state.goals.spirit) * (weekly ? 7 : 1);
  const max = Math.max(goal * 1.15, ...buckets.map((b) => RINGS.reduce((s, r) => s + (b.v[r.id] || 0), 0) / 60)) || 1;
  const bw = (W - padL) / buckets.length;
  const y = (min) => padT + (H - padT - padB) * (1 - min / max);
  const step = buckets.length > 20 ? Math.ceil(buckets.length / 10) : 1;
  let bars = '', labels = '';
  buckets.forEach((b, i) => {
    let acc = 0;
    const x = padL + i * bw + bw * 0.15, w = Math.max(2, bw * 0.7);
    RINGS.forEach((r) => {
      const m = (b.v[r.id] || 0) / 60;
      if (m <= 0) return;
      bars += `<rect x="${x.toFixed(1)}" y="${y(acc + m).toFixed(1)}" width="${w.toFixed(1)}" height="${(y(acc) - y(acc + m)).toFixed(1)}" fill="${r.color}" rx="2"><title>${fmtDate(b.d)}${weekly ? ' week' : ''}: ${r.label} ${fmtMin(m * 60)}</title></rect>`;
      acc += m;
    });
    if (i % step === 0) {
      const t = weekly ? fmtDate(b.d) : span <= 7 ? b.d.toLocaleDateString(undefined, { weekday: 'short' }) : String(b.d.getDate());
      labels += `<text x="${(padL + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${t}</text>`;
    }
  });
  const ticks = [0, Math.round(max / 2), Math.round(max)].map((m) => `<text x="${padL - 6}" y="${y(m) + 4}" text-anchor="end">${m}</text><line x1="${padL}" x2="${W}" y1="${y(m)}" y2="${y(m)}" class="grid"/>`).join('');
  $('#chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Minutes per ${weekly ? 'week' : 'day'}">
    ${ticks}<line x1="${padL}" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" class="goal"/>${bars}${labels}</svg>
    <div class="r-chart-key">Minutes per ${weekly ? 'week' : 'day'} · dashed line: all three goals${weekly ? ' × 7' : ''}</div>`;
}

/* Where the time went, ring by ring: practice by section and routine, each video, the Scroll. */
function renderBreakdown(entries) {
  fill($('#breakdown'), RINGS.map((r) => {
    const mine = entries.filter((e) => e.ring === r.id);
    const total = mine.reduce((s, e) => s + e.seconds, 0);
    const groups = new Map();
    for (const e of mine) {
      const key = e.source === 'practice' ? `p|${e.section}` : e.source === 'scroll' ? 's' : `w|${e.title}`;
      const g = groups.get(key) || { label: e.source === 'practice' ? e.section : e.source === 'scroll' ? 'The Scroll' : (e.title || 'Video'), source: e.source, seconds: 0, count: 0, routines: new Map() };
      g.seconds += e.seconds; g.count++;
      if (e.source === 'practice') { const k = e.routine || '—'; g.routines.set(k, (g.routines.get(k) || 0) + e.seconds); }
      groups.set(key, g);
    }
    const rows = [...groups.values()].sort((a, b) => b.seconds - a.seconds);
    return h('div', { class: 'r-bd', style: `--c:${r.color}` },
      h('div', { class: 'r-bd-head' }, h('b', {}, r.label), h('span', {}, fmtMin(total))),
      rows.length ? rows.map((g) => h('div', { class: 'r-bd-row' },
        h('div', { class: 'r-bd-line' },
          h('span', { class: 'r-bd-label' }, g.label, h('small', {}, ` · ${SOURCE[g.source]}${g.source === 'practice' ? ` · ${g.count} movement${g.count === 1 ? '' : 's'}` : ''}`)),
          h('span', { class: 'r-bd-time' }, fmtMin(g.seconds))),
        h('span', { class: 'w-bar' }, h('i', { style: `width:${Math.round((g.seconds / (total || 1)) * 100)}%` })),
        g.routines.size > 1 || (g.routines.size === 1 && !g.routines.has('—')) ? h('div', { class: 'r-bd-routines' },
          [...g.routines].sort((a, b) => b[1] - a[1]).map(([name, s]) => h('span', {}, `${name === '—' ? 'Other' : name} ${fmtMin(s)}`))) : null))
        : h('p', { class: 'r-none' }, 'Nothing in this stretch.'));
  }));
}

/* Every session, day by day, newest first. Practice sessions open to show each movement (and stay open when the
   page refreshes itself). */
const openSessions = new Set();
function renderLog(sessions) {
  const byDayMap = new Map();
  for (const s of sessions) { const k = dayKey(s.start); if (!byDayMap.has(k)) byDayMap.set(k, []); byDayMap.get(k).push(s); }
  const dayKeys = [...byDayMap.keys()];
  const shown = dayKeys.slice(0, state.logDays);
  fill($('#log'),
    shown.length ? shown.map((k) => {
      const list = byDayMap.get(k);
      const sums = { body: 0, mind: 0, spirit: 0 };
      list.forEach((s) => { sums[s.ring] += s.seconds; });
      return h('div', { class: 'r-logday' },
        h('div', { class: 'r-logday-head' }, h('b', {}, fmtDate(new Date(k + 'T12:00'), { weekday: 'long', month: 'short', day: 'numeric' })),
          h('span', {}, RINGS.filter((r) => sums[r.id]).map((r) => h('i', { style: `--c:${r.color}` }, `${r.label} ${fmtMin(sums[r.id])}`)))),
        list.map((s) => {
          const r = ringOf(s.ring);
          const head = [h('span', { class: 'r-time' }, `${fmtTime(s.start)}–${fmtTime(s.end)}`), h('span', { class: 'r-dot' }),
            h('span', { class: 'r-what' }, h('b', {}, s.title), h('small', {}, [SOURCE[s.source], r.label, s.sub, s.parts.length > 1 ? `${s.parts.length} movements` : ''].filter(Boolean).join(' · '))),
            h('span', { class: 'r-dur' }, fmtMin(s.seconds))];
          if (s.source !== 'practice' || !s.parts.length) return h('div', { class: 'r-entry', style: `--c:${r.color}` }, head);
          return h('details', { class: 'r-entry r-entry-p', style: `--c:${r.color}`, open: openSessions.has(s.start), ontoggle: (e) => { if (e.target.open) openSessions.add(s.start); else openSessions.delete(s.start); } }, h('summary', {}, head),
            h('div', { class: 'r-parts' }, s.parts.map((p) => h('div', { class: 'r-part' },
              h('span', {}, fmtTime(p.at)), h('span', {}, p.movement || p.routine || p.section), h('b', {}, fmtClock(p.seconds))))));
        }));
    }) : h('p', { class: 'r-none' }, 'No sessions in this stretch.'),
    dayKeys.length > shown.length ? h('button', { class: 't-btn r-more', type: 'button', onclick: () => { state.logDays += 14; render(); } }, `Show more (${dayKeys.length - shown.length} more days)`) : null);
}

function renderHeat(days) {
  const now = new Date();
  const monday = (now.getDay() + 6) % 7;
  const start = daysBack(monday + 7 * 11);
  fill($('#heat'), Array.from({ length: 12 }, (_, w) => h('div', { class: 'r-heat-col' }, Array.from({ length: 7 }, (_, d) => {
    const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
    if (day > now) return h('i', { class: 'r-cell future' });
    const v = days[dayKey(day.getTime())] || {};
    const closed = RINGS.filter((r) => (v[r.id] || 0) >= state.goals[r.id] * 60).length;
    return h('i', { class: `r-cell c${closed}${(v.total || 0) > 0 ? ' any' : ''}`, title: `${day.toLocaleDateString()}: ${fmtMin(v.total || 0)}, ${closed} of 3 rings closed` });
  }))));
}

/* ---------- Goals ---------- */
function renderGoals() {
  fill($('#goals'), RINGS.map((r) => h('label', { class: 'r-goal', style: `--c:${r.color}` },
    h('span', {}, r.label), h('input', { class: 't-input', type: 'number', min: 1, max: 600, value: state.goals[r.id], name: r.id, inputmode: 'numeric' }), h('small', {}, 'min a day'))),
    h('button', { class: 't-btn t-primary', type: 'submit' }, 'Save goals'));
}
$('#goals').addEventListener('submit', (e) => {
  e.preventDefault();
  const goals = {};
  for (const r of RINGS) {
    const n = Math.round(Number(e.target.elements[r.id].value));
    if (!(n >= 1 && n <= 600)) return toast(`${r.label}: pick 1 to 600 minutes`);
    goals[r.id] = n;
  }
  account.putDoc(state.uid, 'prefs', 'main', { goals }, onError, true);
  toast('Goals saved');
});

// Opened from a practice page's Stats button: jump to where the practice time is broken down.
if (location.hash === '#practice') {
  const t = setInterval(() => { if (state.uid && $('#breakdown').children.length) { clearInterval(t); $('#practice').scrollIntoView({ behavior: 'smooth' }); } }, 300);
  setTimeout(() => clearInterval(t), 15000);
}
setInterval(render, 60000);
