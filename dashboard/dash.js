// Dashboard: a screen to leave on (made for an iPad on a stand). Clock and temperature, today's rings and streak,
// today's tasks, a card from the Scroll for the day, and what to do next. Everything updates live. The top bar hides
// itself; tap the screen to bring it back. From 10pm to 6am it drops to a dim clock (night mode).
import { $, h, fill, toast, onError, openModal, closeModal, signedInPage, account } from '../hub/page.js';
import { RINGS, DEFAULT_GOALS, byDay, activityEntries, practiceEntries, allStreak, ringsSVG, today, fmtMin, fmtClock, ringOf } from '../hub/rings.js';
import { groupByDue, sectionOf, formatDue } from '../tasks/logic.js';

const NIGHT_FROM = 22, NIGHT_TO = 6;
const state = { uid: null, tasks: [], activity: [], sessions: [], goals: { ...DEFAULT_GOALS }, cards: [], library: [], unsubs: [], forceNight: null };

signedInPage({
  gateText: 'Sign in once on this screen. It stays signed in.',
  onUser(user) {
    state.unsubs.forEach((u) => u()); state.unsubs = [];
    state.uid = user?.uid || null;
    if (!user) return;
    const sub = (p) => p.then((u) => state.unsubs.push(u)).catch(onError);
    sub(account.watchTasks(state.uid, (t) => { state.tasks = t; renderTasks(); }, onError));
    sub(account.watchCollection(state.uid, 'activity', (d) => { state.activity = d; renderRings(); renderNext(); }, onError));
    sub(account.watchCollection(state.uid, 'prefs', (d) => { state.goals = { ...DEFAULT_GOALS, ...(d.find((x) => x.id === 'main')?.goals || {}) }; renderRings(); }, onError));
    sub(account.watchCollection(state.uid, 'scroll', (d) => { state.cards = d; renderQuote(); }, onError));
    sub(account.watchCollection(state.uid, 'library', (d) => { state.library = d; renderNext(); }, onError));
    const loadSessions = () => account.listSessions(state.uid).then((rows) => { state.sessions = rows.map(([, s]) => s); renderRings(); renderNext(); }).catch(() => {});
    loadSessions();
    const t = setInterval(loadSessions, 5 * 60000);
    state.unsubs.push(() => clearInterval(t));
  },
});

/* ---------- Clock ---------- */
function tick() {
  const now = new Date();
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#clock').textContent = time; $('#night-clock').textContent = time;
  $('#date').textContent = date; $('#night-date').textContent = date;
  const hour = now.getHours();
  const night = state.forceNight ?? (hour >= NIGHT_FROM || hour < NIGHT_TO);
  document.body.classList.toggle('is-night', night);
  $('#night').classList.toggle('hidden', !night);
}
setInterval(tick, 5000);
tick();
// Tapping the dim clock wakes the screen until the next hour turns.
$('#night').addEventListener('click', () => { state.forceNight = false; const h0 = new Date().getHours(); const t = setInterval(() => { if (new Date().getHours() !== h0) { state.forceNight = null; clearInterval(t); tick(); } }, 60000); tick(); });
document.getElementById('d-night')?.addEventListener('click', () => { state.forceNight = true; tick(); });

/* ---------- Rings ---------- */
function renderRings() {
  const days = byDay([...activityEntries(state.activity), ...practiceEntries(state.sessions)]);
  const t = days[today()] || {};
  const pct = (id) => (t[id] || 0) / 60 / state.goals[id];
  $('#rings').innerHTML = ringsSVG({ body: pct('body'), mind: pct('mind'), spirit: pct('spirit') }, 220, 20);
  fill($('#rings-legend'), ...RINGS.map((r) => h('div', { class: 'd-leg', style: `--c:${r.color}` },
    h('span', {}, r.label), h('b', {}, fmtMin(t[r.id] || 0)), h('small', {}, `/ ${state.goals[r.id]}m`))));
  const s = allStreak(days, state.goals);
  $('#streak').textContent = s ? `${s} day${s === 1 ? '' : 's'} closing all three ✦` : 'Close all three to start a streak';
}

/* ---------- Tasks: overdue, today, tomorrow ---------- */
function renderTasks() {
  const open = state.tasks.filter((x) => !x.completed);
  const groups = groupByDue(open.filter((x) => sectionOf(x) === 'due')).filter((g) => ['overdue', 'today', 'tomorrow'].includes(g.key));
  const count = groups.reduce((n, g) => n + g.tasks.length, 0);
  $('#task-count').textContent = count;
  const general = open.filter((x) => sectionOf(x) === 'general').length;
  const rows = groups.flatMap((g) => g.tasks.slice(0, 6).map((x) => h('div', { class: `d-task b-${g.key}` },
    h('span', { class: 'd-task-dot' }), h('span', { class: 'd-task-title' }, x.title),
    h('span', { class: 'd-task-when' }, formatDue(x).replace(/^TODAY · /, '').replace(/^TODAY$/, 'Today').replace(/^TOMORROW/, 'Tomorrow').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())))));
  fill($('#tasks'), ...(rows.length ? rows : [h('p', { class: 'd-empty' }, 'Nothing due today ✦')]),
    general ? h('p', { class: 'd-more' }, `${general} general task${general === 1 ? '' : 's'} waiting`) : null);
}

/* ---------- Card of the day: the same card all day, a different one tomorrow ---------- */
function renderQuote() {
  const pool = state.cards.filter((c) => !c.easterEgg && !c.hidden && c.text && c.text.length < 320).sort((a, b) => a.id.localeCompare(b.id));
  if (!pool.length) { fill($('#quote'), h('p', { class: 'd-empty' }, 'Load your cards in the Scroll to see one here each day.')); return; }
  const saved = pool.filter((c) => c.saved || c.liked);
  const d = new Date(); const n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  // Every third day comes from the ones you liked or saved, when there are any
  const list = saved.length && n % 3 === 0 ? saved : pool;
  const c = list[(n * 2654435761 >>> 0) % list.length];
  fill($('#quote'), 
    c.title ? h('div', { class: 'd-quote-title' }, c.title) : null,
    h('blockquote', { class: 'd-quote-text' }, c.text),
    h('div', { class: 'd-quote-who' }, '— ' + [c.author, c.book].filter(Boolean).join(', ')));
}

/* ---------- Up next: the ring furthest from its goal, and something for it ---------- */
function renderNext() {
  const days = byDay([...activityEntries(state.activity), ...practiceEntries(state.sessions)]);
  const t = days[today()] || {};
  const behind = RINGS.map((r) => ({ r, left: state.goals[r.id] * 60 - (t[r.id] || 0) })).filter((x) => x.left > 0).sort((a, b) => b.left - a.left);
  const box = $('#next');
  const put = (...k) => fill(box, ...k);
  if (!behind.length) { put(h('p', { class: 'd-done' }, 'All three rings closed today ✦')); return; }
  const { r, left } = behind[0];
  const going = state.library.filter((v) => (v.durationSec || 0) >= 2700 && v.positionSec > 60 && v.positionSec < v.durationSec - 120)
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0))[0];
  const fits = state.library.filter((v) => v.ring === r.id && (v.durationSec || (v.mins || 0) * 60) && (v.durationSec || v.mins * 60) <= left + 300)
    .sort((a, b) => (a.lastPlayedAt || 0) - (b.lastPlayedAt || 0));
  const pick = fits[0] || state.library.filter((v) => v.ring === r.id).sort((a, b) => (a.lastPlayedAt || 0) - (b.lastPlayedAt || 0))[0];
  put(
    h('div', { class: 'd-next-ring', style: `--c:${r.color}` }, h('b', {}, r.label), ` needs ${fmtMin(left)} more`),
    pick ? h('div', { class: 'd-next-item' },
      h('img', { src: `https://i.ytimg.com/vi/${pick.videoId}/mqdefault.jpg`, alt: '' }),
      h('div', {}, h('div', { class: 'd-next-title' }, pick.title || 'Untitled'), h('div', { class: 'd-next-meta' }, [pick.who, pick.durationSec ? fmtMin(pick.durationSec) : pick.mins ? `${pick.mins}m` : ''].filter(Boolean).join(' · '))))
      : h('p', { class: 'd-empty' }, r.id === 'mind' ? 'Open the Scroll for a few minutes.' : 'Try a practice routine.'),
    going && going !== pick ? h('div', { class: 'd-continue', style: `--c:${ringOf(going.ring).color}` },
      h('span', {}, 'Continue: ', h('b', {}, going.title)),
      h('span', { class: 'w-bar' }, h('i', { style: `width:${Math.round((going.positionSec / going.durationSec) * 100)}%` })),
      h('small', {}, `${fmtClock(going.positionSec)} of ${fmtClock(going.durationSec)}`)) : null);
}
setInterval(() => { renderRings(); renderTasks(); renderNext(); }, 60000);

/* ---------- Temperature (Open-Meteo, free, no account) ---------- */
const PLACE_KEY = 'tolnri.dash.place';
let place = null;
try { place = JSON.parse(localStorage.getItem(PLACE_KEY) || 'null'); } catch {}
async function loadTemp() {
  if (!place) { $('#temp').textContent = 'Set location'; return; }
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code&temperature_unit=${place.unit || 'fahrenheit'}`;
    const d = await fetch(u).then((r) => r.json());
    const c = d.current;
    fill($('#temp'), h('span', { class: 'd-temp-icon' }, icon(c.weather_code)), h('b', {}, `${Math.round(c.temperature_2m)}°`), h('small', {}, place.name || ''));
  } catch { /* keep the last reading on screen */ }
}
function icon(code) {
  const hour = new Date().getHours(), day = hour >= 6 && hour < 19;
  if (code === 0) return day ? '☀︎' : '☾';
  if (code <= 3) return day ? '⛅︎' : '☁︎';
  if (code <= 48) return '〰';
  if (code <= 67 || (code >= 80 && code <= 82)) return '☂︎';
  if (code <= 77 || code === 85 || code === 86) return '❄︎';
  return '⚡︎';
}
loadTemp();
setInterval(loadTemp, 15 * 60000);

$('#temp').addEventListener('click', () => {
  $('#place-q').value = place?.name || '';
  $('#place-hint').textContent = '';
  setUnit(place?.unit || 'fahrenheit');
  openModal($('#place'));
});
let unit = 'fahrenheit';
function setUnit(u) { unit = u; document.querySelectorAll('#units .t-seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.unit === u)); }
document.querySelectorAll('#units .t-seg-btn').forEach((b) => b.addEventListener('click', () => setUnit(b.dataset.unit)));
function savePlace(p) { place = { ...p, unit }; try { localStorage.setItem(PLACE_KEY, JSON.stringify(place)); } catch {} closeModal($('#place')); loadTemp(); }
$('#place-here').addEventListener('click', () => {
  $('#place-hint').textContent = 'Asking for location…';
  navigator.geolocation?.getCurrentPosition(
    (p) => savePlace({ lat: p.coords.latitude.toFixed(3), lon: p.coords.longitude.toFixed(3), name: '' }),
    () => { $('#place-hint').textContent = "Couldn't get the location. Type a city or ZIP instead."; }, { timeout: 15000 });
});
$('#place-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#place-q').value.trim();
  if (!q) { if (place) savePlace(place); return; }
  try {
    const zip = /^\d{5}$/.test(q);
    const d = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&name=${encodeURIComponent(q)}${zip ? '&countryCode=US' : ''}`).then((r) => r.json());
    const r = d.results?.[0];
    if (!r) { $('#place-hint').textContent = "Couldn't find that place."; return; }
    savePlace({ lat: r.latitude, lon: r.longitude, name: r.name });
  } catch { $('#place-hint').textContent = "Couldn't look that up. Check the connection."; }
});

/* ---------- Leave it running: hide the top bar, keep fresh ---------- */
let idle;
function wake() { document.body.classList.remove('bar-hidden'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('bar-hidden'), 8000); }
['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, wake));
wake();
// Reload once a day at 4am, so a screen left on for weeks picks up site updates.
setInterval(() => { const n = new Date(); if (n.getHours() === 4 && n.getMinutes() === 0 && navigator.onLine) location.reload(); }, 50000);
