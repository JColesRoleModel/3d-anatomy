// Check-in: how you feel, then short timed tests, saved to users/<id>/checkins to compare over time and against
// what you did beforehand. Ratings run 1 (best) to 4 (worst). Every raw trial is kept, so scores can be re-worked later.
import { $, h, fill, toast, onError, openModal, closeModal, signedInPage, account } from '../hub/page.js';
import {
  COMFORT, ROM_AREAS, ROM_MEASURES, angleBetween, median, rng, mathQuestion, scoreMath, scoreReaction, scoreJumps, avgRating, METRICS, averageOf, trend, fmtMetric, sleepHours, whatHelps,
} from './logic.js';
import { practiceEntries, activityEntries } from '../hub/rings.js';

const state = { uid: null, checkins: [], unsub: null, context: null, open: null, romAreas: null, sessions: [], activity: [], helpsUnsubs: [] };
const now = () => performance.now();
const pad = (n) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------------------------------------------
// The start screen and the list of past check-ins.

const CONTEXTS = [['morning', 'Morning'], ['before', 'Before practice'], ['after', 'After practice'], ['other', 'Other']];
const defaultContext = () => (new Date().getHours() >= 4 && new Date().getHours() < 11 ? 'morning' : 'other');

function fmtWhen(ts) {
  const d = new Date(ts);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const hr = d.getHours() % 12 || 12;
  return `${day}, ${hr}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getHours() < 12 ? 'am' : 'pm'}`;
}
const fmtLen = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${pad(Math.floor(s % 60))}s` : `${Math.floor(s)}s`);

function renderHome() {
  state.context ??= defaultContext();
  fill($('#context'), CONTEXTS.map(([id, label]) => h('button', {
    type: 'button', class: `t-seg-btn${state.context === id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(state.context === id),
    onclick: () => { state.context = id; renderHome(); },
  }, label)));
  fill($('#singles'), MODULES.map((m) => h('button', { type: 'button', class: 't-btn c-single', onclick: () => start('single', [m.id]) }, m.label)));
  if (!state.romAreas) { try { state.romAreas = JSON.parse(localStorage.getItem('tolnri.checkin.romAreas') || 'null'); } catch {} }
  state.romAreas ||= ['neck', 'shoulders'];
  fill($('#rom-areas'), ROM_AREAS.map(([id, label]) => {
    const on = state.romAreas.includes(id);
    const n = ROM_MEASURES.filter((m) => m.area === id).length;
    return h('button', {
      type: 'button', class: 'c-chip', 'aria-pressed': String(on),
      onclick: () => {
        state.romAreas = on ? state.romAreas.filter((a) => a !== id) : [...state.romAreas, id];
        try { localStorage.setItem('tolnri.checkin.romAreas', JSON.stringify(state.romAreas)); } catch {}
        renderHome();
      },
    }, `${label} · ${n}`);
  }));
  const count = ROM_MEASURES.filter((m) => state.romAreas.includes(m.area)).length;
  $('#rom-start').disabled = !count;
  $('#rom-start').textContent = count ? `Start · ${count} measurements, about ${Math.max(1, Math.round(count * 0.4))} min` : 'Pick an area';

  const last = state.checkins[0];
  $('#latest-panel').classList.toggle('hidden', !last);
  if (last) {
    $('#latest-title').textContent = 'Your last check-in';
    fill($('#latest'), h('p', { class: 'c-when' }, `${fmtWhen(last.startedAt)} · ${KIND_LABEL[last.kind] || last.kind}`), resultsTable(last));
  }
  const list = $('#history');
  if (!state.checkins.length) { fill(list, h('p', { class: 'c-note' }, 'Nothing yet. Your first check-in sets the baseline.')); return; }
  fill(list, state.checkins.map((c) => {
    const open = state.open === c.id;
    const bits = [
      c.modules?.math && `math ${c.modules.math.correct}`,
      c.modules?.reaction?.medianMs != null && `reaction ${c.modules.reaction.medianMs} ms`,
      c.modules?.breath?.holdS != null && `hold ${c.modules.breath.holdS.toFixed(1)} s`,
      c.feel?.clarity && `clarity ${c.feel.clarity}`,
      c.modules?.rom && `range of motion: ${Object.keys(c.modules.rom.measures || {}).length} measured`,
    ].filter(Boolean).join(' · ');
    return h('div', { class: `c-hist${open ? ' open' : ''}` },
      h('button', { type: 'button', class: 'c-hist-row', 'aria-expanded': String(open), onclick: () => { state.open = open ? null : c.id; renderHome(); } },
        h('b', {}, fmtWhen(c.startedAt)),
        h('span', { class: 'c-tag' }, `${KIND_LABEL[c.kind] || c.kind}${c.context ? ` · ${(CONTEXTS.find(([id]) => id === c.context) || [, c.context])[1]}` : ''}${c.finished === false ? ' · stopped early' : ''}`),
        h('span', { class: 'c-hist-bits' }, bits || (c.done || []).map((id) => MODULE_BY[id]?.label || id).join(', '))),
      open && h('div', { class: 'c-hist-body' },
        resultsTable(c),
        h('p', { class: 'c-note' }, `Took ${fmtLen(((c.endedAt || c.startedAt) - c.startedAt) / 1000)}.`),
        h('button', { type: 'button', class: 't-btn c-small c-del', onclick: () => removeCheckin(c) }, 'Delete this check-in')));
  }));
}

function removeCheckin(c) {
  const { id, ...data } = c;
  account.removeDoc(state.uid, 'checkins', id, onError);
  state.open = null;
  toast('Deleted', { label: 'Undo', fn: () => account.putDoc(state.uid, 'checkins', id, data, onError) });
}

// Today's numbers next to the average of the check-ins in the 7 and 30 days before it.
function resultsTable(c) {
  const rows = METRICS.map((m) => ({ m, v: m.get(c) })).filter(({ v }) => Number.isFinite(v));
  if (!rows.length) return h('p', { class: 'c-note' }, 'No scores in this one.');
  const others = state.checkins;
  return h('div', { class: 'c-results' },
    h('div', { class: 'c-res c-res-head' }, h('span', {}, ''), h('span', {}, 'This time'), h('span', {}, '7-day avg'), h('span', {}, '30-day avg')),
    rows.map(({ m, v }) => {
      const a7 = averageOf(m, others, 7, c.startedAt, c.id), a30 = averageOf(m, others, 30, c.startedAt, c.id);
      const t = trend(m, v, a7?.avg ?? a30?.avg);
      return h('div', { class: 'c-res' },
        h('span', { class: 'c-res-label' }, m.label),
        h('b', { class: `c-res-now ${t || ''}` }, fmtMetric(m, v), t && t !== 'same' && h('i', { 'aria-label': t }, t === 'better' ? ' ▲' : ' ▼')),
        h('span', {}, a7 ? fmtMetric(m, a7.avg) : '–', a7 && h('small', {}, ` (${a7.n})`)),
        h('span', {}, a30 ? fmtMetric(m, a30.avg) : '–', a30 && h('small', {}, ` (${a30.n})`)));
    }),
    h('p', { class: 'c-note' }, 'Ratings: 1 is best, 4 is worst. ▲ better or ▼ worse than your 7-day average (30-day if none). The number in brackets is how many check-ins the average rests on.'),
    c.modules?.rom?.measures && h('a', { class: 't-btn c-small c-body-link', href: `../?view=3d&checkin=${encodeURIComponent(c.id)}` }, 'See it on the body'));
}

// ---------------------------------------------------------------------------------------------------------------
// What helps: scores after each activity (in the 24 hours before the check-in) against scores without it.
const HELP_NAMES = {
  'Breathwork Toolkit': 'Breathwork', 'Neuro-Ocular Activation': 'Eyes', 'Mudras': 'Mudras', 'Lower Body Innervation': 'Lower body',
  'Upper Body Innervation': 'Upper body', 'Head Innervation': 'Head', watch: 'Watch', scroll: 'The Scroll', manual: 'Logged time',
};
const MIN_N = 7;
function renderHelps() {
  const entries = [...practiceEntries(state.sessions).map((e) => ({ at: e.at, seconds: e.seconds, kind: HELP_NAMES[e.section] || e.section })),
    ...activityEntries(state.activity).map((e) => ({ at: e.at, seconds: e.seconds, kind: HELP_NAMES[e.source] || e.source }))];
  const { rows, waiting } = whatHelps(state.checkins, entries, { minN: MIN_N });
  const box = $('#helps');
  if (!rows.length) {
    const close = [...waiting].sort((a, b) => Math.min(b.nWith, b.nWithout) - Math.min(a.nWith, a.nWithout)).slice(0, 4);
    fill(box, h('p', { class: 'c-note' }, `This compares each score on check-ins after an activity (in the 24 hours before) with check-ins without it. A comparison shows once each side has ${MIN_N} check-ins.`),
      close.length ? h('div', { class: 'c-helps-wait' }, close.map((w) => h('div', {}, `${w.kind} · ${w.metric.label}: ${w.nWith} with, ${w.nWithout} without`))) : null);
    return;
  }
  rows.sort((a, b) => (a.trend === 'better' ? 0 : a.trend === 'worse' ? 1 : 2) - (b.trend === 'better' ? 0 : b.trend === 'worse' ? 1 : 2));
  fill(box, h('div', { class: 'c-helps' }, rows.map((r) => h('div', { class: `c-help ${r.trend}` },
    h('b', {}, r.kind), h('span', {}, r.metric.label),
    h('span', { class: 'c-help-nums' }, `${fmtMetric(r.metric, r.with)} with (${r.nWith}) · ${fmtMetric(r.metric, r.without)} without (${r.nWithout})`),
    h('i', { 'aria-label': r.trend }, r.trend === 'better' ? '▲' : r.trend === 'worse' ? '▼' : '=')))),
  h('p', { class: 'c-note' }, '▲ the score is better on check-ins after that activity, ▼ worse, = about the same. Counts in brackets. This shows what goes together, not proof of cause.'));
}

// ---------------------------------------------------------------------------------------------------------------
// Running a check-in. Each test is an async function that draws into #stage and returns its result. Everything it
// waits for goes through `waitable`, so Skip and Stop can cut it short and clear its timers.

const SKIP = Symbol('skip'), STOP = Symbol('stop'), DISCARD = Symbol('discard');
let run = null;

function waitable(exec) {
  return new Promise((resolve, reject) => {
    if (!run || run.cut) return reject(run?.cut || STOP);
    const r = run;
    let cleanup = null, settled = false;
    const w = {
      cancel: (why) => { if (settled) return; settled = true; cleanup?.(); reject(why); },
    };
    r.waits.add(w);
    cleanup = exec((value) => { if (settled) return; settled = true; r.waits.delete(w); cleanup?.(); resolve(value); });
  });
}
function cut(why) {
  if (!run) return;
  run.cut = why;
  for (const w of [...run.waits]) w.cancel(why);
  run.waits.clear();
}
const sleep = (ms) => waitable((done) => { const t = setTimeout(done, ms); return () => clearTimeout(t); });
// Waits for a click on a [data-v] button inside `root`, and gives its value.
// Clicks in the first moments after a screen is drawn are the tail of a tap on the screen before, so they don't count.
const pick = (root) => waitable((done) => {
  const f = (e) => {
    const b = e.target.closest('[data-v]');
    if (b && root.contains(b) && !b.disabled && now() - drawnAt > 350) done(b.dataset.v);
  };
  root.addEventListener('click', f);
  return () => root.removeEventListener('click', f);
});
// Waits for a press on `el`; gives { t, x, y } (t on performance.now's clock), or null after `timeout` ms.
const press = (el, timeout = 0) => waitable((done) => {
  const f = (e) => { e.preventDefault(); done({ t: e.timeStamp > 0 && Math.abs(e.timeStamp - now()) < 5000 ? e.timeStamp : now(), x: e.clientX, y: e.clientY }); };
  el.addEventListener('pointerdown', f);
  const t = timeout ? setTimeout(() => done(null), timeout) : 0;
  return () => { el.removeEventListener('pointerdown', f); clearTimeout(t); };
});
// The moment the next frame is drawn, on performance.now's clock.
const nextFrame = () => waitable((done) => { const id = requestAnimationFrame(() => done(now())); return () => cancelAnimationFrame(id); });
// Calls draw(elapsedMs) every frame for `ms` milliseconds.
const animate = (ms, draw) => waitable((done) => {
  const t0 = now();
  let id = requestAnimationFrame(function tick() {
    const e = now() - t0;
    draw(Math.min(e, ms));
    if (e >= ms) done(); else id = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(id);
});

const stage = () => $('#stage');
let drawnAt = 0;
const screen = (...kids) => { fill(stage(), ...kids); drawnAt = now(); return stage(); };
// A pause after a fast test, so taps still landing don't answer the next question.
async function timeUp(text = "Time's up") { screen(h('div', { class: 'c-timeup' }, text)); await sleep(1100); }
const title = (t, sub) => [h('h2', { class: 'c-step-title' }, t), sub && h('p', { class: 'c-step-sub' }, sub)];
const primary = (label, v = 'go') => h('button', { type: 'button', class: 't-btn t-primary c-go', 'data-v': v }, label);

function ratingRow(labels = COMFORT) {
  return h('div', { class: 'c-rate' }, labels.map((l, i) => h('button', { type: 'button', class: `c-rate-btn r${i + 1}`, 'data-v': String(i + 1) },
    h('b', {}, String(i + 1)), h('span', {}, l))));
}
async function rate(heading, sub, labels) {
  const el = screen(...title(heading, sub), ratingRow(labels));
  return Number(await pick(el));
}
async function intro(heading, sub, button = 'Start', extra = null) {
  await pick(screen(...title(heading, sub), extra, primary(button)));
}
// Chips you can turn on and off, then Next. Gives the chosen values.
async function chips(heading, sub, options) {
  const on = new Set();
  const el = screen(...title(heading, sub),
    h('div', { class: 'c-chips' }, options.map((o) => h('button', {
      type: 'button', class: 'c-chip', 'aria-pressed': 'false',
      onclick: (e) => { const b = e.currentTarget; on.has(o) ? on.delete(o) : on.add(o); b.setAttribute('aria-pressed', String(on.has(o))); },
    }, o))),
    primary('Next'));
  await pick(el);
  return [...on];
}

// --- How you feel ----------------------------------------------------------------------------------------------
const FEEL = [
  ['sleep', 'Sleep last night', ['Deep', 'OK', 'Light', 'Poor']],
  ['energy', 'Energy', ['High', 'Good', 'Low', 'Drained']],
  ['mood', 'Mood', ['Bright', 'Steady', 'Low', 'Heavy']],
  ['clarity', 'Head clarity', ['Clear', 'Mild fog', 'Foggy', 'Very foggy']],
];
const PAIN = ['Head', 'Eyes', 'Jaw', 'Neck', 'Left shoulder', 'Right shoulder', 'Upper back', 'Lower back', 'Hips', 'Knees', 'Feet', 'Hands & wrists', 'Stomach', 'Chest'];

async function feel() {
  const out = {};
  const rows = FEEL.map(([id, label, words]) => {
    const row = h('div', { class: 'c-feel-row' }, h('span', { class: 'c-feel-label' }, label),
      h('div', { class: 'c-rate c-rate-sm' }, words.map((w, i) => h('button', {
        type: 'button', class: `c-rate-btn r${i + 1}`, 'aria-pressed': 'false',
        onclick: (e) => {
          out[id] = i + 1;
          [...e.currentTarget.parentNode.children].forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
        },
      }, h('b', {}, String(i + 1)), h('span', {}, w)))));
    return row;
  });
  const bed = h('input', { class: 't-input', type: 'time', 'aria-label': 'Bed time' });
  const wake = h('input', { class: 't-input', type: 'time', 'aria-label': 'Wake time' });
  try { const s = JSON.parse(localStorage.getItem('tolnri.checkin.sleep') || '{}'); if (s.bed) bed.value = s.bed; } catch {}
  const pain = new Set();
  const el = screen(...title('How do you feel?', '1 is best, 4 is worst.'), ...rows,
    h('div', { class: 'c-sleep' },
      h('label', { class: 't-field' }, h('span', {}, 'Went to sleep (optional)'), bed),
      h('label', { class: 't-field' }, h('span', {}, 'Woke up'), wake)),
    h('div', { class: 'c-label' }, 'Any pain or tension?'),
    h('div', { class: 'c-chips' }, PAIN.map((p) => h('button', {
      type: 'button', class: 'c-chip', 'aria-pressed': 'false',
      onclick: (e) => { pain.has(p) ? pain.delete(p) : pain.add(p); e.currentTarget.setAttribute('aria-pressed', String(pain.has(p))); },
    }, p))),
    primary('Next'));
  await pick(el);
  const hours = sleepHours(bed.value, wake.value);
  if (bed.value) try { localStorage.setItem('tolnri.checkin.sleep', JSON.stringify({ bed: bed.value })); } catch {}
  return { v: 1, ...out, ...(hours != null && { sleepHours: hours, bed: bed.value, wake: wake.value }), pain: [...pain] };
}

// --- Mental math -----------------------------------------------------------------------------------------------
const MATH_MS = 60000;
async function math() {
  await intro('Mental math', 'Two-digit sums and differences for 60 seconds. Type each answer and press ✓. Fast, but right.');
  const rand = rng(Date.now());
  const trials = [];
  const qEl = h('div', { class: 'c-math-q' }), aEl = h('div', { class: 'c-math-a' });
  const bar = h('div', { class: 'c-timer' }, h('div'));
  const keys = h('div', { class: 'c-keys' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'].map((k) =>
    h('button', { type: 'button', class: `c-key${k === '✓' ? ' ok' : ''}`, 'data-k': k }, k)));
  screen(bar, qEl, aEl, keys);
  let cur = mathQuestion(rand), typed = '', shown = now();
  const t0 = shown;
  const show = () => { qEl.textContent = cur.q; aEl.textContent = typed || ' '; };
  show();
  const key = (k) => {
    if (k === '⌫') typed = typed.slice(0, -1);
    else if (k === '✓') {
      if (!typed) return;
      const t = now(), ok = Number(typed) === cur.answer;
      trials.push({ q: cur.q, a: Number(typed), ms: Math.round(t - shown), ok, at: Math.round(shown - t0) });
      aEl.classList.remove('right', 'wrong'); void aEl.offsetWidth; aEl.classList.add(ok ? 'right' : 'wrong');
      cur = mathQuestion(rand, cur.q); typed = ''; shown = now();
    } else if (typed.length < 3) typed += k;
    show();
  };
  await waitable((done) => {
    const onKey = (e) => { const b = e.target.closest('[data-k]'); if (b) { e.preventDefault(); key(b.dataset.k); } };
    const onKb = (e) => {
      if (/^[0-9]$/.test(e.key)) key(e.key);
      else if (e.key === 'Backspace') key('⌫');
      else if (e.key === 'Enter') key('✓');
      else return;
      e.preventDefault();
    };
    keys.addEventListener('pointerdown', onKey);
    document.addEventListener('keydown', onKb);
    let id = requestAnimationFrame(function tick() {
      const left = Math.max(0, MATH_MS - (now() - t0));
      bar.firstChild.style.width = `${(left / MATH_MS) * 100}%`;
      if (left <= 0) done(); else id = requestAnimationFrame(tick);
    });
    return () => { keys.removeEventListener('pointerdown', onKey); document.removeEventListener('keydown', onKb); cancelAnimationFrame(id); };
  });
  await timeUp();
  const score = scoreMath(trials, MATH_MS);
  const rating = await rate(`${score.correct} right, ${score.errors} wrong`, 'How hard did that feel?');
  return { v: 1, ...score, rating, trials };
}

// --- Reaction time ---------------------------------------------------------------------------------------------
const REACTION_TRIALS = 15;
async function reaction() {
  await intro('Reaction time', `Tap the circle the moment it turns gold. ${REACTION_TRIALS} times, at random gaps. Don't guess: an early tap doesn't count.`);
  const dot = h('div', { class: 'c-react-dot' });
  const msg = h('div', { class: 'c-react-msg' });
  const count = h('div', { class: 'c-react-count' });
  const pad = h('div', { class: 'c-react' }, dot, msg, count);
  screen(pad);
  const times = [];
  let falseStarts = 0;
  while (times.length < REACTION_TRIALS) {
    count.textContent = `${times.length + 1} of ${REACTION_TRIALS}`;
    pad.className = 'c-react wait'; msg.textContent = 'Wait…';
    const early = await press(pad, 1500 + Math.random() * 2500);
    if (early) { falseStarts++; pad.className = 'c-react early'; msg.textContent = 'Too soon'; await sleep(900); continue; }
    pad.className = 'c-react go'; msg.textContent = 'Tap!';
    const onset = await nextFrame();
    const hit = await press(pad, 2000);
    const ms = hit ? Math.max(0, hit.t - onset) : 2000;
    times.push(Math.round(ms));
    pad.className = 'c-react done'; msg.textContent = hit ? `${Math.round(ms)} ms` : 'Missed';
    await sleep(700);
  }
  await timeUp('Done');
  return { v: 1, ...scoreReaction(times, falseStarts), trials: times };
}

// --- Breath hold -----------------------------------------------------------------------------------------------
async function breath() {
  await intro('Breath hold', 'Sit and breathe normally for a few breaths. After a normal breath out (not a forced one), hold your nose and tap Start. Tap again at the first clear urge to breathe: not as long as you can.',
    'Start holding', h('p', { class: 'c-safety' }, 'Seated only. Never in water or while driving. Stop if you feel dizzy.'));
  const clock = h('div', { class: 'c-clock' }, '0.0 s');
  const padEl = h('div', { class: 'c-tap-pad' }, clock, h('span', {}, 'Tap anywhere at the first urge to breathe'));
  screen(padEl);
  const t0 = now();
  const hit = await waitable((done) => {
    const f = (e) => { e.preventDefault(); done(now()); };
    padEl.addEventListener('pointerdown', f);
    let id = requestAnimationFrame(function tick() { clock.textContent = `${((now() - t0) / 1000).toFixed(1)} s`; id = requestAnimationFrame(tick); });
    return () => { padEl.removeEventListener('pointerdown', f); cancelAnimationFrame(id); };
  });
  const holdS = Math.round((hit - t0) / 100) / 10;
  const rating = await rate(`${holdS.toFixed(1)} s`, 'How easy was that hold?');
  const more = await pick(screen(...title('Count your breaths?', 'One minute of normal breathing. Tap each time you breathe in.'),
    h('div', { class: 'c-two' }, h('button', { type: 'button', class: 't-btn', 'data-v': 'no' }, 'Skip'), primary('Count for 1 minute', 'yes'))));
  let perMin = null;
  if (more === 'yes') perMin = await tapCount('Tap each time you breathe in', 60000, false);
  return { v: 1, holdS, rating, ...(perMin != null && { perMin }) };
}

// A pad that counts taps for `ms`; the clock starts at once, or on the first tap.
async function tapCount(label, ms, startOnTap = true) {
  const n = h('div', { class: 'c-clock' }, '0');
  const left = h('div', { class: 'c-tap-left' }, startOnTap ? 'Starts on your first tap' : `${ms / 1000} s left`);
  const padEl = h('div', { class: 'c-tap-pad' }, n, h('span', {}, label), left);
  screen(padEl);
  let count = 0, t0 = startOnTap ? null : now();
  await waitable((done) => {
    let id = 0;
    const tick = () => {
      const l = Math.max(0, ms - (now() - t0));
      left.textContent = `${Math.ceil(l / 1000)} s left`;
      if (l <= 0) done(); else id = requestAnimationFrame(tick);
    };
    const f = (e) => {
      e.preventDefault();
      if (t0 == null) { t0 = now(); id = requestAnimationFrame(tick); }
      if (now() - t0 <= ms) { count++; n.textContent = String(count); padEl.classList.remove('hit'); void padEl.offsetWidth; padEl.classList.add('hit'); }
    };
    padEl.addEventListener('pointerdown', f);
    if (t0 != null) id = requestAnimationFrame(tick);
    return () => { padEl.removeEventListener('pointerdown', f); cancelAnimationFrame(id); };
  });
  await timeUp(`${count} taps`);
  return count;
}

// --- Neuro-ocular ----------------------------------------------------------------------------------------------
const EYE_MS = 10000;
const wave = (t, period) => Math.sin((2 * Math.PI * t) / period);
const EYE_MOVES = [
  ['pursuitH', 'Smooth, side to side', 'Follow the dot with your eyes only. Keep your head still.', (t) => ({ x: wave(t, 4000) * 0.9, y: 0 })],
  ['pursuitV', 'Smooth, up and down', 'Follow the dot with your eyes only.', (t) => ({ x: 0, y: wave(t, 4000) * 0.9 })],
  ['jumpH', 'Jumps, side to side', 'Look at the dot each time it jumps.', (t) => ({ x: Math.floor(t / 800) % 2 ? 0.9 : -0.9, y: 0 })],
  ['jumpV', 'Jumps, up and down', 'Look at the dot each time it jumps.', (t) => ({ x: 0, y: Math.floor(t / 800) % 2 ? 0.9 : -0.9 })],
  ['diagonal', 'Diagonals', 'Follow the dot corner to corner.', (t) => { const s = wave(t, 5000) * 0.85; return t < 5000 ? { x: s, y: s } : { x: s, y: -s }; }],
  ['nearFar', 'Near and far', 'Hold your thumb at arm\'s length below the dot. Slowly bring it toward your nose and back, keeping it single. Follow the dot\'s rhythm.', (t) => ({ x: 0, y: 0, s: 1 + 1.6 * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 5000)) })],
  ['edges', 'Hold at the edges', 'Look at the dot and hold your gaze there.', (t) => [{ x: -0.95, y: 0 }, { x: 0.95, y: 0 }, { x: 0, y: -0.95 }, { x: 0, y: 0.95 }][Math.min(3, Math.floor(t / 2500))]],
];
const SYMPTOMS = ['Dizzy', 'Headache', 'Eye strain', 'Nausea', 'Watery eyes', 'Blurry', 'Double vision'];
const JUMPS = 12;

async function eyes() {
  await intro('Neuro-ocular', 'Seven short eye movements of 10 seconds, each rated for comfort, then a dot-tapping test. Hold the screen at a comfortable reading distance.');
  const ratings = {};
  for (const [id, name, how, path] of EYE_MOVES) {
    await intro(name, how);
    const dot = h('div', { class: 'c-dot' });
    const arena = h('div', { class: 'c-arena' }, dot);
    screen(arena);
    const { width: w, height: ht } = arena.getBoundingClientRect();
    const rx = w / 2 - 18, ry = ht / 2 - 18;
    await animate(EYE_MS, (t) => {
      const p = path(t);
      dot.style.transform = `translate(${w / 2 + p.x * rx}px, ${ht / 2 + p.y * ry}px) translate(-50%, -50%) scale(${p.s || 1})`;
    });
    ratings[id] = await rate(name, 'How comfortable was that?');
  }
  const symptoms = await chips('Anything come up?', 'Tap any you noticed, or just Next.', SYMPTOMS);

  await intro('Dot-jump test', `A dot appears somewhere, ${JUMPS} times. Tap right on it as fast as you can.`);
  const dot = h('div', { class: 'c-dot c-dot-tap hidden' });
  const arena = h('div', { class: 'c-arena' }, dot);
  screen(arena);
  const box = arena.getBoundingClientRect();
  const trials = [];
  for (let i = 0; i < JUMPS; i++) {
    dot.classList.add('hidden');
    await sleep(400 + Math.random() * 600);
    const x = 30 + Math.random() * (box.width - 60), y = 30 + Math.random() * (box.height - 60);
    dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    dot.classList.remove('hidden');
    const onset = await nextFrame();
    const hit = await press(arena, 3000);
    const r = arena.getBoundingClientRect();
    trials.push(hit
      ? { ms: Math.round(Math.max(0, hit.t - onset)), errPx: Math.round(Math.hypot(hit.x - r.left - x, hit.y - r.top - y) * 10) / 10 }
      : { ms: 3000, errPx: null, missed: true });
  }
  await timeUp('Done');
  return { v: 1, ratings, avgRating: avgRating(ratings), symptoms, jump: { ...scoreJumps(trials), trials }, arena: { w: Math.round(box.width), h: Math.round(box.height) } };
}

// --- Neck and shoulders ----------------------------------------------------------------------------------------
const NECK = [
  ['turnLeft', 'Turn your head left', 'Slowly, as far as is comfortable. Two or three times.'],
  ['turnRight', 'Turn your head right', 'Slowly, as far as is comfortable.'],
  ['chinDown', 'Chin to chest', 'Let the head drop forward gently.'],
  ['lookUp', 'Look up', 'Tip the head back gently, mouth closed.'],
  ['earLeft', 'Ear to left shoulder', 'Keep the shoulders level.'],
  ['earRight', 'Ear to right shoulder', 'Keep the shoulders level.'],
  ['shrugs', 'Shoulder shrugs', 'Lift both shoulders to the ears and drop them, five times.'],
  ['rolls', 'Shoulder rolls', 'Roll both shoulders back in big circles, five times.'],
  ['armUpLeft', 'Left arm overhead', 'Raise the straight arm forward and up beside the ear.'],
  ['armUpRight', 'Right arm overhead', 'Raise the straight arm forward and up beside the ear.'],
  ['behindLeft', 'Left hand up the back', 'Reach behind and slide the back of the hand up the spine.'],
  ['behindRight', 'Right hand up the back', 'Reach behind and slide the back of the hand up the spine.'],
];
const PULLS = ['Left neck', 'Right neck', 'Back of neck', 'Base of skull', 'Left shoulder', 'Right shoulder', 'Between shoulder blades', 'Left arm', 'Right arm', 'Upper chest'];

async function neck() {
  await intro('Neck and shoulders', 'Twelve gentle movements. Do each one slowly two or three times, then rate how it felt. Never push into pain.');
  const ratings = {};
  for (const [id, name, how] of NECK) ratings[id] = await rate(name, how);
  const pulls = await chips('Where did anything pull?', 'Tap any, or just Next.', PULLS);
  return { v: 1, ratings, avgRating: avgRating(ratings), pulls };
}

// --- Mudras and fingers ----------------------------------------------------------------------------------------
const MUDRAS = [
  ['gyan', 'Gyan', 'Thumb tip touches index fingertip. Other fingers straight.'],
  ['shuni', 'Shuni', 'Thumb tip touches middle fingertip.'],
  ['prana', 'Prana', 'Thumb touches the ring and little fingertips together.'],
  ['apana', 'Apana', 'Thumb touches the middle and ring fingertips together.'],
  ['surya', 'Surya', 'Fold the ring finger down and press it with the thumb.'],
];
async function mudras() {
  await intro('Mudras and fingers', 'Five mudras with both hands. The clock runs from when each appears: the moment you are holding it, tap how easy it was. Then a 10-second finger tapping test for each hand.');
  const ratings = {}, timesMs = {};
  for (const [id, name, how] of MUDRAS) {
    const el = screen(...title(`${name} mudra`, how), h('div', { class: 'c-label' }, 'Holding it? How easy was it?'), ratingRow());
    const t0 = now();
    ratings[id] = Number(await pick(el));
    timesMs[id] = Math.round(now() - t0);
  }
  await intro('Finger tapping: right hand', 'Tap the pad with your right index finger as fast as you can for 10 seconds.', 'Ready');
  const tapsRight = await tapCount('Right index finger', 10000);
  await intro('Finger tapping: left hand', 'Now your left index finger, 10 seconds.', 'Ready');
  const tapsLeft = await tapCount('Left index finger', 10000);
  const stiffness = await rate(`Right ${tapsRight} · Left ${tapsLeft}`, 'How stiff did your fingers feel?', ['Loose', 'A little stiff', 'Stiff', 'Very stiff']);
  return { v: 1, ratings, avgRating: avgRating(ratings), timesMs, setMs: Object.values(timesMs).reduce((s, x) => s + x, 0), tapsRight, tapsLeft, stiffness };
}

// --- Range of motion -------------------------------------------------------------------------------------------
// Hands-free: once the phone is in place and still, it buzzes and beeps (set), you move to your end range and hold,
// then come back; when you're back it buzzes twice (rep counted) and sets again. Three reps; the middle one is kept.
const ROM_REPS = 3;
let audio = null;
function beep(freq = 880, ms = 140, times = 1) {
  try {
    navigator.vibrate?.(times > 1 ? [90, 80, 90] : 120);
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime + i * (ms + 80) / 1000;
      o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
    }
  } catch {}
}
// Gravity as the phone feels it, smoothed. read() gives [x, y, z] or null before the first reading.
function gravity() {
  let g = null, count = 0;
  const f = (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    const v = [a.x, a.y, a.z];
    g = g ? g.map((x, i) => x + 0.2 * (v[i] - x)) : v;
    count++;
  };
  window.addEventListener('devicemotion', f);
  return { read: () => g, count: () => count, stop: () => window.removeEventListener('devicemotion', f) };
}
// iPhones and iPads ask first; other browsers may answer too. Either way, whether readings arrive decides.
async function askMotion() {
  try { if (typeof DeviceMotionEvent?.requestPermission === 'function') await DeviceMotionEvent.requestPermission(); } catch {}
}

// One measurement: three reps, each zeroed where you start. Gives { deg, reps } or null if skipped.
async function measureRom(m, sensor, i, n) {
  const angle = h('div', { class: 'c-clock' }, '–');
  const status = h('div', { class: 'c-rom-status' }, 'Getting still…');
  const dots = h('div', { class: 'c-rom-dots' });
  const drawDots = (done) => fill(dots, Array.from({ length: ROM_REPS }, (_, k) => h('span', { class: k < done.length ? 'on' : '' }, k < done.length ? `${Math.round(done[k])}°` : '')));
  const reps = [];
  drawDots(reps);
  const ctl = { button: null };
  const press = (v) => () => { if (now() - drawnAt > 350) ctl.button = v; };
  screen(h('p', { class: 'c-rom-count' }, `${i + 1} of ${n}`), ...title(m.label, m.setup), h('p', { class: 'c-step-sub c-rom-move' }, m.move),
    angle, status, dots,
    h('div', { class: 'c-two' },
      h('button', { type: 'button', class: 't-btn', onclick: press('redo') }, 'Redo'),
      h('button', { type: 'button', class: 't-btn', onclick: press('skip') }, 'Skip this one')));
  for (;;) {
    const r = await oneRep(sensor, angle, status, ctl);
    if (r.button === 'skip') return null;
    if (r.button === 'redo') { ctl.button = null; reps.length = 0; drawDots(reps); continue; }
    reps.push(r.deg);
    drawDots(reps);
    if (reps.length >= ROM_REPS) {
      status.textContent = `${Math.round(median(reps))}° kept`;
      beep(1175, 120, 3);
      await sleep(1400);
      return { deg: Math.round(median(reps) * 10) / 10, reps: reps.map((x) => Math.round(x * 10) / 10) };
    }
  }
}

// One rep: wait until still, zero there, follow the angle, keep the furthest angle held still, end when back near zero.
const oneRep = (sensor, angleEl, statusEl, ctl) => waitable((done) => {
  let phase = 'settle', g0 = null, peak = 0, heldPeak = 0;
  const hist = []; // [t, g]
  const still = (ms, within) => {
    const t = now(), g = sensor.read();
    const recent = hist.filter(([ht]) => t - ht <= ms);
    return recent.length > 5 && t - recent[0][0] >= ms * 0.8 && recent.every(([, hg]) => angleBetween(hg, g) < within);
  };
  const id = setInterval(() => {
    if (ctl.button) { done({ button: ctl.button }); return; }
    const g = sensor.read();
    if (!g) return;
    const t = now();
    hist.push([t, g]); while (hist.length && t - hist[0][0] > 1500) hist.shift();
    if (phase === 'settle') {
      angleEl.textContent = '–';
      statusEl.textContent = 'Getting still…';
      if (still(900, 1.2)) { g0 = g; phase = 'move'; beep(880); statusEl.textContent = 'Go: move slowly, hold at the end'; }
      return;
    }
    const a = angleBetween(g, g0);
    angleEl.textContent = `${Math.round(a)}°`;
    if (a > peak) peak = a;
    if (a > 8 && still(500, 1.5) && a > heldPeak) heldPeak = a;
    if (peak >= 12 && a < 6 && a < peak * 0.3) {
      beep(660, 110, 2);
      done({ deg: heldPeak || peak });
    }
  }, 40);
  return () => clearInterval(id);
});

async function rom() {
  const list = ROM_MEASURES.filter((m) => (state.romAreas || []).includes(m.area));
  await intro('Range of motion', 'The phone measures each movement in degrees, hands-free. Put it in place and keep still until it buzzes and beeps, then move slowly to your end range, hold for 2 seconds, and come back. Two buzzes means the rep counted. Three reps each; the middle one is kept.', 'Start',
    h('p', { class: 'c-safety' }, 'Never push into pain. Turn your sound on for the beeps.'));
  beep(880, 60); // starts the sound on this tap, so later beeps can play
  await askMotion();
  const sensor = gravity();
  try {
    await sleep(800);
    if (!sensor.count()) { await intro('No motion readings', 'Open this on your phone to measure range of motion. If you are on your phone, allow motion sensors for this site in the browser settings.', 'OK'); return null; }
    const measures = {};
    for (let i = 0; i < list.length; i++) {
      $('#run-bar').style.width = `${(i / list.length) * 100}%`;
      const r = await measureRom(list[i], sensor, i, list.length);
      if (r) measures[list[i].id] = r;
    }
    if (!Object.keys(measures).length) return null;
    return { v: 1, areas: [...state.romAreas], measures };
  } finally { sensor.stop(); }
}

// ---------------------------------------------------------------------------------------------------------------

const MODULES = [
  { id: 'feel', label: 'How you feel', run: feel },
  { id: 'math', label: 'Mental math', run: math },
  { id: 'reaction', label: 'Reaction time', run: reaction },
  { id: 'breath', label: 'Breath hold', run: breath },
  { id: 'eyes', label: 'Neuro-ocular', run: eyes },
  { id: 'neck', label: 'Neck & shoulders', run: neck },
  { id: 'mudras', label: 'Mudras & fingers', run: mudras },
];
const MODULE_BY = Object.fromEntries([...MODULES, { id: 'rom', label: 'Range of motion', run: rom }].map((m) => [m.id, m]));
const KINDS = { quick: ['feel', 'math', 'reaction', 'breath'], full: MODULES.map((m) => m.id) };
const KIND_LABEL = { quick: 'Quick', full: 'Full', single: 'One test' };

function device() {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua) ? 'Android' : /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iOS' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other';
  return `${os} ${Math.round(screen_w())}×${Math.round(screen_h())}`;
}
const screen_w = () => window.screen?.width || innerWidth;
const screen_h = () => window.screen?.height || innerHeight;

function save(doc) {
  const { id, ...data } = doc;
  account.putDoc(state.uid, 'checkins', id, data, onError);
}

let wakeLock = null;
async function holdAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else { await wakeLock?.release(); wakeLock = null; }
  } catch {}
}

async function start(kind, ids = KINDS[kind]) {
  if (run || !state.uid) return;
  const startedAt = Date.now();
  const doc = { id: `c${startedAt}`, v: 1, startedAt, endedAt: startedAt, kind, context: state.context || defaultContext(), device: device(), done: [], finished: false, modules: {} };
  run = { waits: new Set(), cut: null };
  $('#home').classList.add('hidden');
  $('#run').classList.remove('hidden');
  window.scrollTo(0, 0);
  holdAwake(true);
  let outcome = 'done';
  for (let i = 0; i < ids.length; i++) {
    const m = MODULE_BY[ids[i]];
    $('#run-name').textContent = m.label;
    $('#run-count').textContent = ids.length > 1 ? `${i + 1} of ${ids.length}` : '';
    $('#run-bar').style.width = `${(i / ids.length) * 100}%`;
    run.cut = null;
    try {
      const result = await m.run();
      if (m.id === 'feel') doc.feel = result; else doc.modules[m.id] = result;
      doc.done.push(m.id);
      doc.endedAt = Date.now();
      save(doc); // after each test, so a closed page keeps what was done
    } catch (why) {
      if (why === SKIP) continue;
      if (why === STOP || why === DISCARD) { outcome = why === STOP ? 'stopped' : 'discarded'; break; }
      onError(why);
      outcome = 'stopped';
      break;
    }
  }
  run = null;
  holdAwake(false);
  closeModal($('#stop'));
  $('#run').classList.add('hidden');
  $('#home').classList.remove('hidden');
  if (outcome === 'discarded' || !doc.done.length) {
    if (doc.done.length) account.removeDoc(state.uid, 'checkins', doc.id, onError);
    toast(doc.done.length ? 'Thrown away' : 'Nothing saved');
  } else {
    doc.finished = outcome === 'done';
    save(doc);
    if (!state.checkins.some((c) => c.id === doc.id)) state.checkins.unshift({ ...doc });
    toast(`Saved · took ${fmtLen((doc.endedAt - doc.startedAt) / 1000)}`);
  }
  state.open = null;
  renderHome();
  window.scrollTo(0, 0);
}

$('#rom-start').addEventListener('click', () => start('single', ['rom']));
document.addEventListener('click', (e) => {
  const k = e.target.closest('[data-kind]');
  if (k) start(k.dataset.kind);
});
$('#run-skip').addEventListener('click', () => cut(SKIP));
$('#run-stop').addEventListener('click', () => openModal($('#stop')));
$('#stop-save').addEventListener('click', () => { closeModal($('#stop')); cut(STOP); });
$('#stop-discard').addEventListener('click', () => { closeModal($('#stop')); cut(DISCARD); });
// Leaving the page mid-test: the tests already done are saved; nothing else to do.

// Last, so everything above exists before the first render.
signedInPage({
  gateText: 'Sign in to keep your check-ins in your account.',
  onUser(u) {
    state.unsub?.(); state.unsub = null;
    state.uid = u?.uid || null;
    state.checkins = [];
    if (!u) return;
    renderHome();
    account.watchCollection(state.uid, 'checkins', (docs) => {
      state.checkins = docs.sort((a, b) => b.startedAt - a.startedAt);
      if (!run) { renderHome(); renderHelps(); }
    }, onError).then((un) => { state.unsub = un; }).catch(onError);
    state.helpsUnsubs.forEach((un) => un()); state.helpsUnsubs = [];
    const since = Date.now() - 180 * 86400000;
    account.watchCollection(state.uid, 'sessions', (d) => { state.sessions = d; renderHelps(); }, onError, 'timestamp', since).then((un) => state.helpsUnsubs.push(un)).catch(onError);
    account.watchCollection(state.uid, 'activity', (d) => { state.activity = d; renderHelps(); }, onError, 'startedAt', since).then((un) => state.helpsUnsubs.push(un)).catch(onError);
  },
});
