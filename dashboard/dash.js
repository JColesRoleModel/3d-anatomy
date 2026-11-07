// Dashboard: a light screen to leave on (made for an older iPad on a stand). Clock and temperature with its place,
// today's rings and streak with the week's seven small rings beneath, the latest Check-in scores with their trends, a card from the Scroll that
// changes every minute, and the last five things completed. The top bar hides itself; tap the screen to bring it
// back. From 10pm to 6am it drops to a dim clock.
//
// Kept light on data: it listens live only to the last 8 weeks of sessions and practice records (enough for the
// streak), reads the Scroll once a day, and uses its own small offline cache (sw.js). A line under the rings says
// whether it's live and when the latest session ended.
import { $, h, fill, onError, openModal, closeModal, signedInPage, account } from '../hub/page.js';
import { RINGS, DEFAULT_GOALS, byDay, activityEntries, practiceEntries, allStreak, ringsSVG, today, fmtExact, dayKey, daysBack, sessionsOf, ago, ringOf } from '../hub/rings.js';
import { METRICS, averageOf, trend, fmtMetric } from '../checkin/logic.js';

const NIGHT_FROM = 22, NIGHT_TO = 6;
const WINDOW_DAYS = 56;
const CHECK_DAYS = 120; // check-ins listened to: plenty for 14 points per score and the 7-day averages
const state = { live: false, heardAt: null, uid: null, checkins: [], activity: [], sessions: [], goals: { ...DEFAULT_GOALS }, cards: [], cardsDay: null, unsubs: [], forceNight: null };

signedInPage({
  gateText: 'Sign in once on this screen. It stays signed in.',
  onUser(user) {
    state.unsubs.forEach((u) => u()); state.unsubs = [];
    state.uid = user?.uid || null;
    if (!user) return;
    const sub = (p) => p.then((u) => state.unsubs.push(u)).catch(onError);
    const since = () => daysBack(WINDOW_DAYS).getTime();
    sub(account.watchCollection(state.uid, 'checkins', (d) => { state.checkins = d.sort((a, b) => b.startedAt - a.startedAt); renderCheck(); }, onError, 'startedAt', daysBack(CHECK_DAYS).getTime()));
    // Watch, Scroll and practice time all arrive live: a session finished on the phone shows here within seconds
    sub(account.watchCollection(state.uid, 'activity', (d, meta) => { state.activity = d; heard(meta); renderStats(); }, onError, 'startedAt', since()));
    sub(account.watchCollection(state.uid, 'sessions', (d, meta) => { state.sessions = d; heard(meta); renderStats(); }, onError, 'timestamp', since()));
    sub(account.watchCollection(state.uid, 'prefs', (d) => { state.goals = { ...DEFAULT_GOALS, ...(d.find((x) => x.id === 'main')?.goals || {}) }; renderStats(); }, onError));
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

// Time to the second for the ring numbers: the minutes large, the seconds a little smaller beside them ("8m 32s").
function exact(seconds) {
  const [big, ...rest] = fmtExact(seconds).split(' ');
  const tail = rest.join(' ');
  return h('b', {}, big, tail ? h('span', { class: 'd-sec' }, ` ${tail}`) : null);
}

/* ---------- Live or not ---------- */
function heard(meta) { state.live = !meta?.fromCache && navigator.onLine; state.heardAt = Date.now(); }
function renderSync(all) {
  const latest = all.length ? Math.max(...all.map((e) => e.at + e.seconds * 1000)) : null;
  const t = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const live = state.live && navigator.onLine;
  const el = $('#sync');
  el.classList.toggle('off', !live);
  el.textContent = live
    ? `● Live${latest ? ` · last session ended ${t(latest)}` : ''}`
    : `○ Offline · showing what was here at ${t(state.heardAt || Date.now())}`;
}
addEventListener('online', () => { state.live = true; renderStats(); });
addEventListener('offline', () => { state.live = false; renderStats(); });

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
    h('span', {}, r.label), exact(t[r.id] || 0), h('small', {}, `/ ${state.goals[r.id]}m`))));
  renderSync(all);
  const s = allStreak(days, state.goals);
  $('#streak').textContent = s ? `${s} day${s === 1 ? '' : 's'} closing all three ✦` : 'Close all three to start a streak';

  // This week: always Monday to Sunday (not the last 7 days); days still ahead show as empty rings
  const back = (new Date().getDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => daysBack(back - i));
  const fmt = (d, o) => d.toLocaleDateString(undefined, o);
  $('#week-label').textContent = `This week · ${fmt(week[0], { month: 'short', day: 'numeric' })} – ${fmt(week[6], { month: 'short', day: 'numeric' })}`;
  fill($('#week'), week.map((d) => {
    const k = dayKey(d.getTime()), v = days[k] || {}, future = d > new Date();
    return h('div', { class: 'd-wday' + (k === today() ? ' on' : '') + (future ? ' future' : '') },
      h('div', { class: 'd-wring', html: ringsSVG(future ? {} : { body: pct('body', v), mind: pct('mind', v), spirit: pct('spirit', v) }, 44, 5) }),
      h('b', {}, fmt(d, { weekday: 'short' })), h('small', {}, String(d.getDate())));
  }));

  // The last five things done
  const recent = sessionsOf(all).slice(0, 5);
  fill($('#recent'), recent.length ? recent.map((x) => h('div', { class: 'd-done-row', style: `--c:${ringOf(x.ring).color}` },
    h('span', { class: 'd-done-dot' }),
    h('span', { class: 'd-done-title' }, x.title, x.sub ? h('small', {}, ` · ${x.sub}`) : null),
    h('span', { class: 'd-done-dur' }, fmtExact(x.seconds)),
    h('span', { class: 'd-done-when' }, ago(x.end))))
    : [h('p', { class: 'd-empty' }, 'Nothing yet. Watch, scroll or practice and it shows up here.')]);
}

/* ---------- Check-in: the last one, and four scores with their trends ---------- */
const CHECK_SCORES = ['feel.clarity', 'math.correct', 'reaction.medianMs', 'breath.holdS'].map((id) => METRICS.find((m) => m.id === id));
const SPARK_N = 14;
function whenText(ts) {
  const d = new Date(ts);
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).toLowerCase();
  if (dayKey(ts) === today()) return `today ${t}`;
  if (dayKey(ts) === dayKey(daysBack(1).getTime() + 43200000)) return `yesterday ${t}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${t}`;
}
// A small line of the last values, drawn so that up is always better.
function spark(values, better) {
  const W = 120, H = 34, P = 4;
  if (values.length < 2) return h('span', { class: 'd-spark-none' }, values.length ? 'first one' : '');
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => {
    const x = P + (i * (W - 2 * P)) / (values.length - 1);
    const f = (v - lo) / span;
    const y = P + (better === 'low' ? f : 1 - f) * (H - 2 * P);
    return [x.toFixed(1), y.toFixed(1)];
  });
  const [lx, ly] = pts[pts.length - 1];
  const el = h('span', { class: 'd-spark' });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#e6bd6a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/><circle cx="${lx}" cy="${ly}" r="3.5" fill="#f6e3b4"/></svg>`;
  return el;
}
function renderCheck() {
  const list = state.checkins;
  const last = list[0];
  if (!last) { fill($('#check'), h('p', { class: 'd-empty' }, 'Your check-in scores show here after your first check-in.')); return; }
  const kind = { quick: 'Quick', full: 'Full', single: 'One test' }[last.kind] || '';
  const rows = CHECK_SCORES.map((m) => {
    const withIt = list.filter((c) => Number.isFinite(m.get(c)));
    const latest = withIt[0];
    if (!latest) return h('div', { class: 'd-score' }, h('span', { class: 'd-score-label' }, m.label), h('span', { class: 'd-score-val muted' }, '–'), h('span'), h('span'));
    const v = m.get(latest);
    const avg = averageOf(m, list, 7, latest.startedAt, latest.id);
    const t = trend(m, v, avg ? avg.avg : null);
    const arrow = t === 'better' ? '▲' : t === 'worse' ? '▼' : t === 'same' ? '=' : '';
    return h('div', { class: 'd-score' },
      h('span', { class: 'd-score-label' }, m.label),
      h('span', { class: 'd-score-val' }, fmtMetric(m, v)),
      h('span', { class: `d-score-trend ${t || ''}`, title: avg ? `7-day average ${fmtMetric(m, avg.avg)}` : 'No 7-day average yet' }, arrow, avg ? h('small', {}, ` ${fmtMetric(m, avg.avg)}`) : null),
      spark(withIt.slice(0, SPARK_N).map((c) => m.get(c)).reverse(), m.better));
  });
  fill($('#check'),
    h('p', { class: 'd-check-last' }, `Last check-in ${whenText(last.startedAt)}`, kind ? h('small', {}, ` · ${kind}`) : null),
    h('div', { class: 'd-scores' }, rows),
    h('p', { class: 'd-check-key' }, 'Arrow and small number: against your 7-day average. Lines: last 14, up is better. Ratings: 1 best, 4 worst.'));
}

/* ---------- Card of the minute (cards are read once a day) ---------- */
async function loadCards() {
  state.cardsDay = today();
  try { state.cards = await account.readCollection(state.uid, 'scroll'); } catch { state.cards = []; }
  renderQuote();
}
// A new card every minute: a shuffled run through all of them (so none repeats until every card has shown), with
// one you liked or saved every third minute when there are any.
let deck = [], lastCard = null;
function renderQuote() {
  const pool = state.cards.filter((c) => !c.easterEgg && !c.hidden && c.text && c.text.length < 320);
  if (!pool.length) { fill($('#quote'), h('p', { class: 'd-empty' }, 'Open the Scroll once to load your cards; a new one shows here every minute.')); return; }
  const saved = pool.filter((c) => (c.saved || c.liked) && c !== lastCard);
  let c;
  if (saved.length && Math.floor(Date.now() / 60000) % 3 === 0) c = saved[Math.floor(Math.random() * saved.length)];
  else {
    const ids = new Set(pool.map((x) => x.id));
    deck = deck.filter((id) => ids.has(id));
    if (!deck.length) deck = pool.map((x) => x.id).sort(() => Math.random() - 0.5);
    if (deck[0] === lastCard?.id && deck.length > 1) deck.push(deck.shift());
    const id = deck.shift();
    c = pool.find((x) => x.id === id);
  }
  lastCard = c;
  const box = $('#quote');
  box.classList.remove('d-fade');
  void box.offsetWidth; // restart the fade
  box.classList.add('d-fade');
  fill(box,
    c.title ? h('div', { class: 'd-quote-title' }, c.title) : null,
    h('blockquote', { class: 'd-quote-text' }, c.text),
    h('div', { class: 'd-quote-who' }, '— ' + [c.author, c.book].filter(Boolean).join(', ')));
}
// Turn the card on each new minute, in step with the clock
setTimeout(() => { renderQuote(); setInterval(renderQuote, 60000); }, 60000 - (Date.now() % 60000));
setInterval(() => { renderStats(); renderCheck(); }, 60000);

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
