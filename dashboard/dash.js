// Dashboard: a light screen to leave on (made for an older iPad on a stand). Clock and temperature with its place,
// today's rings and streak with the week's seven small rings beneath, today's tasks, a card from the Scroll for the
// day, and the last five things completed. The top bar hides itself; tap the screen to bring it back. From 10pm to
// 6am it drops to a dim clock.
//
// Kept light on data: it listens only to the last 8 weeks of sessions (enough for the streak), reads practice records
// for the same window every 10 minutes, reads the Scroll once a day, and uses its own small offline cache (sw.js).
import { $, h, fill, onError, openModal, closeModal, signedInPage, account } from '../hub/page.js';
import { RINGS, DEFAULT_GOALS, byDay, activityEntries, practiceEntries, allStreak, ringsSVG, today, fmtMin, dayKey, daysBack, sessionsOf, ago, ringOf } from '../hub/rings.js';
import { groupByDue, sectionOf, formatDue } from '../tasks/logic.js';

const NIGHT_FROM = 22, NIGHT_TO = 6;
const WINDOW_DAYS = 56;
const state = { uid: null, tasks: [], activity: [], sessions: [], goals: { ...DEFAULT_GOALS }, cards: [], cardsDay: null, unsubs: [], forceNight: null };

signedInPage({
  gateText: 'Sign in once on this screen. It stays signed in.',
  onUser(user) {
    state.unsubs.forEach((u) => u()); state.unsubs = [];
    state.uid = user?.uid || null;
    if (!user) return;
    const sub = (p) => p.then((u) => state.unsubs.push(u)).catch(onError);
    const since = () => daysBack(WINDOW_DAYS).getTime();
    sub(account.watchTasks(state.uid, (t) => { state.tasks = t; renderTasks(); }, onError));
    sub(account.watchCollection(state.uid, 'activity', (d) => { state.activity = d; renderStats(); }, onError, 'startedAt', since()));
    sub(account.watchCollection(state.uid, 'prefs', (d) => { state.goals = { ...DEFAULT_GOALS, ...(d.find((x) => x.id === 'main')?.goals || {}) }; renderStats(); }, onError));
    const loadPractice = () => account.readCollectionSince(state.uid, 'sessions', 'timestamp', since())
      .then((rows) => { state.sessions = rows; renderStats(); }).catch(() => {});
    loadPractice();
    const t = setInterval(loadPractice, 10 * 60000);
    state.unsubs.push(() => clearInterval(t));
    loadCards();
  },
});

/* ---------- Clock and night ---------- */
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
  if (state.uid && state.cardsDay && state.cardsDay !== today()) loadCards(); // a new day: a new card
}
setInterval(tick, 5000);
tick();
$('#night').addEventListener('click', () => {
  state.forceNight = false;
  const h0 = new Date().getHours();
  const t = setInterval(() => { if (new Date().getHours() !== h0) { state.forceNight = null; clearInterval(t); tick(); } }, 60000);
  tick();
});
document.getElementById('d-night')?.addEventListener('click', () => { state.forceNight = true; tick(); });

/* ---------- Rings, the week, and recently completed ---------- */
function entries() { return [...activityEntries(state.activity), ...practiceEntries(state.sessions)]; }
function renderStats() {
  if (!state.uid) return;
  const all = entries();
  const days = byDay(all);
  const t = days[today()] || {};
  const pct = (id, d = t) => (d[id] || 0) / 60 / state.goals[id];
  $('#rings').innerHTML = ringsSVG({ body: pct('body'), mind: pct('mind'), spirit: pct('spirit') }, 220, 20);
  fill($('#rings-legend'), RINGS.map((r) => h('div', { class: 'd-leg', style: `--c:${r.color}` },
    h('span', {}, r.label), h('b', {}, fmtMin(t[r.id] || 0)), h('small', {}, `/ ${state.goals[r.id]}m`))));
  const s = allStreak(days, state.goals);
  $('#streak').textContent = s ? `${s} day${s === 1 ? '' : 's'} closing all three ✦` : 'Close all three to start a streak';

  // This week, Monday to Sunday
  const back = (new Date().getDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => daysBack(back - i));
  const fmt = (d, o) => d.toLocaleDateString(undefined, o);
  $('#week-label').textContent = `${fmt(week[0], { month: 'short', day: 'numeric' })} – ${fmt(week[6], { month: 'short', day: 'numeric' })}`;
  fill($('#week'), week.map((d) => {
    const k = dayKey(d.getTime()), v = days[k] || {}, future = d > new Date();
    return h('div', { class: 'd-wday' + (k === today() ? ' on' : '') + (future ? ' future' : '') },
      h('div', { class: 'd-wring', html: future ? '' : ringsSVG({ body: pct('body', v), mind: pct('mind', v), spirit: pct('spirit', v) }, 44, 5) }),
      h('b', {}, fmt(d, { weekday: 'short' })), h('small', {}, String(d.getDate())));
  }));

  // The last five things done
  const recent = sessionsOf(all).slice(0, 5);
  fill($('#recent'), recent.length ? recent.map((x) => h('div', { class: 'd-done-row', style: `--c:${ringOf(x.ring).color}` },
    h('span', { class: 'd-done-dot' }),
    h('span', { class: 'd-done-title' }, x.title, x.sub ? h('small', {}, ` · ${x.sub}`) : null),
    h('span', { class: 'd-done-dur' }, fmtMin(x.seconds)),
    h('span', { class: 'd-done-when' }, ago(x.end))))
    : [h('p', { class: 'd-empty' }, 'Nothing yet. Watch, scroll or practice and it shows up here.')]);
}

/* ---------- Tasks: overdue, today, tomorrow ---------- */
function renderTasks() {
  const open = state.tasks.filter((x) => !x.completed);
  const groups = groupByDue(open.filter((x) => sectionOf(x) === 'due')).filter((g) => ['overdue', 'today', 'tomorrow'].includes(g.key));
  $('#task-count').textContent = groups.reduce((n, g) => n + g.tasks.length, 0);
  const general = open.filter((x) => sectionOf(x) === 'general').length;
  const when = (x) => formatDue(x).toLowerCase().replace(/^today · /, '').replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const rows = groups.flatMap((g) => g.tasks.slice(0, 6).map((x) => h('div', { class: `d-task b-${g.key}` },
    h('span', { class: 'd-task-dot' }), h('span', { class: 'd-task-title' }, x.title), h('span', { class: 'd-task-when' }, when(x)))));
  fill($('#tasks'), rows.length ? rows : [h('p', { class: 'd-empty' }, 'Nothing due today ✦')],
    general ? h('p', { class: 'd-more' }, `${general} general task${general === 1 ? '' : 's'} waiting`) : null);
}

/* ---------- Card of the day (read once a day) ---------- */
async function loadCards() {
  state.cardsDay = today();
  try { state.cards = await account.readCollection(state.uid, 'scroll'); } catch { state.cards = []; }
  renderQuote();
}
function renderQuote() {
  const pool = state.cards.filter((c) => !c.easterEgg && !c.hidden && c.text && c.text.length < 320).sort((a, b) => a.id.localeCompare(b.id));
  if (!pool.length) { fill($('#quote'), h('p', { class: 'd-empty' }, 'Open the Scroll once to load your cards; one shows here each day.')); return; }
  const saved = pool.filter((c) => c.saved || c.liked);
  const d = new Date(); const n = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  const list = saved.length && n % 3 === 0 ? saved : pool; // every third day, one you liked or saved
  const c = list[(n * 2654435761 >>> 0) % list.length];
  fill($('#quote'),
    c.title ? h('div', { class: 'd-quote-title' }, c.title) : null,
    h('blockquote', { class: 'd-quote-text' }, c.text),
    h('div', { class: 'd-quote-who' }, '— ' + [c.author, c.book].filter(Boolean).join(', ')));
}
setInterval(() => { renderStats(); renderTasks(); }, 60000);

/* ---------- Temperature and place (Open-Meteo, free, no account) ---------- */
const PLACE_KEY = 'tolnri.dash.place';
let place = null;
try { place = JSON.parse(localStorage.getItem(PLACE_KEY) || 'null'); } catch {}
async function loadTemp() {
  if (!place) { fill($('#temp'), h('span', { class: 'd-temp-set' }, 'Set location')); return; }
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code&temperature_unit=${place.unit || 'fahrenheit'}`;
    const c = (await fetch(u).then((r) => r.json())).current;
    fill($('#temp'), h('span', { class: 'd-temp-icon' }, icon(c.weather_code)),
      h('span', { class: 'd-temp-text' }, h('b', {}, `${Math.round(c.temperature_2m)}°`), h('small', {}, place.name || 'Your location')));
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
setInterval(loadTemp, 20 * 60000);

let unit = 'fahrenheit';
function setUnit(u) { unit = u; document.querySelectorAll('#units .t-seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.unit === u)); }
document.querySelectorAll('#units .t-seg-btn').forEach((b) => b.addEventListener('click', () => setUnit(b.dataset.unit)));
$('#temp').addEventListener('click', () => {
  $('#place-q').value = place?.name || '';
  $('#place-hint').textContent = '';
  setUnit(place?.unit || 'fahrenheit');
  openModal($('#place'));
});
function savePlace(p) { place = { ...p, unit }; try { localStorage.setItem(PLACE_KEY, JSON.stringify(place)); } catch {} closeModal($('#place')); loadTemp(); }
$('#place-here').addEventListener('click', () => {
  $('#place-hint').textContent = 'Asking for location…';
  if (!navigator.geolocation) { $('#place-hint').textContent = 'This device has no location. Type a city or ZIP.'; return; }
  navigator.geolocation.getCurrentPosition(async (p) => {
    const lat = p.coords.latitude.toFixed(3), lon = p.coords.longitude.toFixed(3);
    let name = '';
    try { // the place's name, from a free lookup that needs no account
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`).then((x) => x.json());
      name = [r.city || r.locality, r.principalSubdivisionCode?.split('-')[1] || r.principalSubdivision].filter(Boolean).join(', ');
    } catch {}
    savePlace({ lat, lon, name });
  }, () => { $('#place-hint').textContent = "Couldn't get the location. Type a city or ZIP instead."; }, { timeout: 15000 });
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
    const region = r.country_code === 'US' ? (r.admin1 || '') : (r.country || '');
    savePlace({ lat: r.latitude, lon: r.longitude, name: [r.name, region].filter(Boolean).join(', ') });
  } catch { $('#place-hint').textContent = "Couldn't look that up. Check the connection."; }
});

/* ---------- Leave it running ---------- */
let idle;
function wake() { document.body.classList.remove('bar-hidden'); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add('bar-hidden'), 8000); }
['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, wake));
wake();
// Reload once a day at 4am, so a screen left on for weeks picks up site updates.
setInterval(() => { const n = new Date(); if (n.getHours() === 4 && n.getMinutes() === 0 && navigator.onLine) location.reload(); }, 50000);
