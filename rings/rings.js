// Rings: today's Body / Mind / Spirit against your goals, the week, streaks, the last 12 weeks, every session today,
// and the goals themselves. Everything is added up from Watch and Scroll sessions plus the practice pages' records,
// so the practice stats and the rings always agree.
import { $, h, fill, toast, onError, signedInPage, account } from '../hub/page.js';
import { RINGS, DEFAULT_GOALS, byDay, activityEntries, practiceEntries, streak, allStreak, ringsSVG, dayKey, daysBack, today, fmtMin } from '../hub/rings.js';

const state = { uid: null, activity: [], sessions: [], goals: { ...DEFAULT_GOALS }, unsubs: [] };
const SOURCE = { watch: 'Watch', scroll: 'Scroll', practice: 'Practice' };

signedInPage({
  gateText: 'Sign in to see your Body, Mind and Spirit rings.',
  onUser(user) {
    state.unsubs.forEach((u) => u()); state.unsubs = [];
    state.uid = user?.uid || null;
    if (!user) return;
    render();
    account.watchCollection(state.uid, 'activity', (docs) => { state.activity = docs; render(); }, onError).then((u) => state.unsubs.push(u)).catch(onError);
    account.watchCollection(state.uid, 'prefs', (docs) => {
      const g = docs.find((d) => d.id === 'main')?.goals;
      state.goals = { ...DEFAULT_GOALS, ...(g || {}) };
      render(); renderGoals();
    }, onError).then((u) => state.unsubs.push(u)).catch(onError);
    const loadSessions = () => account.listSessions(state.uid).then((rows) => { state.sessions = rows.map(([, s]) => s); render(); }).catch(() => {});
    loadSessions();
    state.unsubs.push(((t) => () => clearInterval(t))(setInterval(loadSessions, 120000)));
    renderGoals();
  },
});

function entries() { return [...activityEntries(state.activity), ...practiceEntries(state.sessions)]; }

function render() {
  if (!state.uid) return;
  const all = entries();
  const days = byDay(all);
  const t = days[today()] || {};
  const pct = (id, d = t) => (d[id] || 0) / 60 / state.goals[id];

  $('#big').innerHTML = ringsSVG({ body: pct('body'), mind: pct('mind'), spirit: pct('spirit') }, 230, 20);
  fill($('#legend'), ...RINGS.map((r) => h('div', { class: 'r-leg', style: `--c:${r.color}` },
    h('div', { class: 'r-leg-label' }, r.label),
    h('div', { class: 'r-leg-num' }, h('b', {}, fmtMin(t[r.id] || 0)), ` / ${state.goals[r.id]}m`),
    h('div', { class: 'r-leg-pct' }, (t[r.id] || 0) >= state.goals[r.id] * 60 ? 'Closed ✦' : `${Math.round(pct(r.id) * 100)}%`))));

  // This week, Monday first
  const now = new Date();
  const monday = (now.getDay() + 6) % 7;
  fill($('#week'), ...Array.from({ length: 7 }, (_, i) => {
    const d = daysBack(monday - i);
    const k = dayKey(d.getTime());
    const v = days[k] || {};
    const future = i > monday;
    return h('div', { class: 'r-day' + (k === today() ? ' on' : '') + (future ? ' future' : '') },
      h('div', { class: 'r-mini', html: future ? '' : ringsSVG({ body: pct('body', v), mind: pct('mind', v), spirit: pct('spirit', v) }, 54, 6) }),
      h('span', {}, d.toLocaleDateString(undefined, { weekday: 'short' })));
  }));

  fill($('#streaks'), 
    h('div', { class: 'r-streak all' }, h('b', {}, allStreak(days, state.goals)), h('span', {}, 'days closing all three')),
    ...RINGS.map((r) => h('div', { class: 'r-streak', style: `--c:${r.color}` }, h('b', {}, streak(days, r.id, state.goals[r.id])), h('span', {}, `${r.label} days in a row`))));

  // 12 weeks, one column per week, Monday at the top
  const start = daysBack(monday + 7 * 11);
  const cols = [];
  for (let w = 0; w < 12; w++) {
    cols.push(h('div', { class: 'r-heat-col' }, ...Array.from({ length: 7 }, (_, d) => {
      const day = new Date(start); day.setDate(start.getDate() + w * 7 + d);
      const k = dayKey(day.getTime());
      if (day > now) return h('i', { class: 'r-cell future' });
      const v = days[k] || {};
      const closed = RINGS.filter((r) => (v[r.id] || 0) >= state.goals[r.id] * 60).length;
      const any = (v.total || 0) > 0;
      return h('i', { class: `r-cell c${closed}${any ? ' any' : ''}`, title: `${day.toLocaleDateString()}: ${fmtMin(v.total || 0)}, ${closed} of 3 rings closed` });
    })));
  }
  fill($('#heat'), ...cols);
  const totalAll = all.reduce((s, e) => s + e.seconds, 0);
  $('#totals').textContent = `All time: ${fmtMin(totalAll)} across ${Object.keys(days).length} days.`;

  // Today's sessions
  const todays = all.filter((e) => dayKey(e.at) === today()).sort((a, b) => b.at - a.at);
  // Practice records are per movement; group them by routine so the list stays readable
  const grouped = [];
  for (const e of todays) {
    const last = grouped[grouped.length - 1];
    if (e.source === 'practice' && last && last.source === 'practice' && last.section === e.section && last.at - e.at < 15 * 60000) { last.seconds += e.seconds; last.count++; continue; }
    grouped.push({ ...e, count: 1, title: e.source === 'practice' ? e.section : e.title });
  }
  fill($('#log'), ...(grouped.length ? grouped.map((e) => {
    const r = RINGS.find((x) => x.id === e.ring);
    return h('div', { class: 'r-entry', style: `--c:${r.color}` },
      h('span', { class: 'r-time' }, new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })),
      h('span', { class: 'r-dot' }),
      h('span', { class: 'r-what' }, h('b', {}, e.title || SOURCE[e.source]), h('small', {}, `${SOURCE[e.source] || e.source} · ${r.label}${e.count > 1 ? ` · ${e.count} movements` : ''}`)),
      h('span', { class: 'r-dur' }, fmtMin(e.seconds)));
  }) : [h('p', { class: 't-empty' }, 'Nothing yet today. Watch something, open the Scroll, or do a practice routine.')]));
}

function renderGoals() {
  const form = $('#goals');
  form.replaceChildren(...RINGS.map((r) => h('label', { class: 'r-goal', style: `--c:${r.color}` },
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
setInterval(render, 60000);
