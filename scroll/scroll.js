// The Scroll: a positive doomscroll. Cards come shuffled, a few at a time, with the ones you've seen least first.
// Time here counts toward Mind, but only while the page is showing and you're actually scrolling, tapping or reading
// (it pauses after a minute of nothing). Every card also keeps its own numbers: how often it was on screen, how long
// in total, and whether you liked or saved it. Numbers are added with increments, so two devices never overwrite
// each other.
import { $, $$, h, fill, toast, onError, openModal, closeModal, signedInPage, account } from '../hub/page.js';
import { SessionTimer, fmtClock, fmtMin, dayKey } from '../hub/rings.js';

const IDLE_MS = 60000;   // no activity for this long: the clock pauses
const SEEN_RATIO = 0.6;  // a card counts as on screen when this much of it shows
const BATCH = 8;

const state = { uid: null, cards: [], loaded: false, view: 'feed', deck: [], shown: [], activity: [], unsubs: [] };
let timer = null, lastActive = 0, observer = null;
// Per-card numbers gathered this visit, written to the account every 20 seconds and when the page is hidden
const pending = new Map(); // id -> { views, ms }
const visible = new Map(); // id -> since (ms, performance.now)
const sessionSeen = new Set();
let maxDepth = 0, likes = 0, saves = 0;

signedInPage({
  gateText: 'Sign in to keep your cards and count your Scroll time toward Mind.',
  onUser(user) {
    state.unsubs.forEach((u) => u()); state.unsubs = [];
    endSession();
    state.uid = user?.uid || null;
    state.cards = []; state.loaded = false; state.deck = []; state.shown = [];
    if (!user) return;
    render();
    account.watchCollection(state.uid, 'scroll', (docs, meta) => {
      const first = !state.cards.length;
      state.cards = docs;
      if (!meta.fromCache) state.loaded = true;
      if (first && docs.length) reshuffle(); else render();
    }, onError).then((u) => state.unsubs.push(u)).catch(onError);
    account.watchCollection(state.uid, 'activity', (docs) => { state.activity = docs.filter((a) => a.source === 'scroll'); if (state.view === 'stats') renderStats(); }, onError)
      .then((u) => state.unsubs.push(u)).catch(onError);
    startSession();
  },
});

/* ---------- Session time: visible + active ---------- */
function startSession() {
  timer = new SessionTimer({ account, uid: state.uid, source: 'scroll', ring: 'mind', title: 'The Scroll', onError, onSave: flushCards });
  active();
}
function endSession() {
  if (!timer) return;
  closeVisible();
  timer.extra = sessionExtra();
  timer.end();
  flushCards();
  timer = null;
}
function active() {
  lastActive = Date.now();
  if (timer && !document.hidden && state.view !== 'stats') timer.start();
}
['scroll', 'pointerdown', 'keydown', 'wheel', 'touchmove'].forEach((ev) => addEventListener(ev, active, { passive: true }));
setInterval(() => {
  if (!timer) return;
  if (timer.running && Date.now() - lastActive > IDLE_MS) { closeVisible(); timer.pause(); }
  $('#session-time').textContent = fmtClock(timer.seconds);
  $('#live').classList.toggle('on', timer.running);
  timer.extra = sessionExtra();
}, 500);
document.addEventListener('visibilitychange', () => { if (document.hidden) { closeVisible(); flushCards(); } else { active(); reopenVisible(); } });
addEventListener('pagehide', () => endSession());

function sessionExtra() { return { cardsSeen: sessionSeen.size, likes, saves, maxDepth }; }

/* ---------- Per-card dwell ---------- */
function track(el, id) {
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) {
      const cid = e.target.dataset.id;
      if (e.intersectionRatio >= SEEN_RATIO) {
        if (!visible.has(cid) && timer?.running) {
          visible.set(cid, performance.now());
          if (!sessionSeen.has(cid)) { sessionSeen.add(cid); bump(cid, 'views', 1); }
        }
      } else closeOne(cid);
    }
  }, { threshold: [0, SEEN_RATIO, 1] });
  el.dataset.id = id;
  observer.observe(el);
}
function bump(id, key, n) { const p = pending.get(id) || { views: 0, ms: 0 }; p[key] += n; pending.set(id, p); }
function closeOne(id) { const since = visible.get(id); if (since == null) return; visible.delete(id); bump(id, 'ms', performance.now() - since); }
function closeVisible() { [...visible.keys()].forEach(closeOne); }
function reopenVisible() { if (!observer) return; $$('.s-card[data-id]').forEach((el) => { observer.unobserve(el); observer.observe(el); }); }
function flushCards() {
  // Add the time still on screen so far, without ending it
  for (const [id, since] of visible) { bump(id, 'ms', performance.now() - since); visible.set(id, performance.now()); }
  if (!state.uid || !pending.size) return;
  const known = new Set(state.cards.map((c) => c.id));
  const entries = [...pending].filter(([id, p]) => known.has(id) && (p.views || p.ms >= 500)).map(([id, p]) => [id, {
    views: account.plus(p.views), dwellMs: account.plus(Math.round(p.ms)), lastSeenAt: Date.now(),
  }]);
  pending.clear();
  if (entries.length) account.putMany(state.uid, 'scroll', entries, onError, true);
}

/* ---------- Feed ---------- */
function reshuffle() {
  // Least-seen first, with a random spread so it never feels like a list
  const pool = state.cards.filter((c) => !c.hidden);
  state.deck = pool.map((c) => [c, Math.random() * 3 + Math.log2(1 + (c.views || 0))]).sort((a, b) => a[1] - b[1]).map(([c]) => c.id);
  state.shown = [];
  fill($('#feed'), );
  more();
  scrollTo({ top: 0, behavior: 'smooth' });
  render();
}
function more() {
  if (!state.deck.length) {
    if (!state.cards.length) return;
    state.deck = state.cards.filter((c) => !c.hidden).map((c) => c.id).sort(() => Math.random() - 0.5); // round again
  }
  const next = state.deck.splice(0, BATCH);
  state.shown.push(...next);
  const byId = new Map(state.cards.map((c) => [c.id, c]));
  $('#feed').append(...next.map((id) => byId.get(id)).filter(Boolean).map(cardEl));
}
new IntersectionObserver((e) => { if (e[0].isIntersecting && state.view === 'feed' && state.cards.length) more(); }, { rootMargin: '600px' }).observe($('#more'));
// How deep this visit went: the furthest card down the feed that made it on screen
addEventListener('scroll', () => {
  if (state.view !== 'feed') return;
  const cards = $$('#feed .s-card');
  for (let i = cards.length - 1; i >= maxDepth; i--) if (cards[i].getBoundingClientRect().top < innerHeight) { maxDepth = i + 1; break; }
}, { passive: true });
$('#reshuffle').addEventListener('click', reshuffle);

const initials = (name) => (name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
function hue(name) { let x = 0; for (const ch of name || '') x = (x * 31 + ch.charCodeAt(0)) | 0; return Math.abs(x) % 360; }

function cardEl(c) {
  const el = h('article', { class: 's-card' },
    h('div', { class: 's-who' },
      h('span', { class: 's-avatar', style: `--h:${hue(c.author)}` }, initials(c.author)),
      h('div', {}, h('div', { class: 's-author' }, c.author || 'Unknown'), h('div', { class: 's-src' }, [c.book, c.handle].filter(Boolean).join(' · ')))),
    c.title ? h('div', { class: 's-ctitle' }, (c.num ? `${c.num}. ` : '') + c.title) : null,
    h('p', { class: 's-text' }, c.text),
    h('div', { class: 's-actions' },
      h('button', { type: 'button', class: 's-act' + (c.liked ? ' on' : ''), 'data-act': 'like', 'aria-pressed': !!c.liked, onclick: () => toggle(c.id, 'liked') }, c.liked ? '♥ Liked' : '♡ Like'),
      h('button', { type: 'button', class: 's-act' + (c.saved ? ' on' : ''), 'data-act': 'save', 'aria-pressed': !!c.saved, onclick: () => toggle(c.id, 'saved') }, c.saved ? '★ Saved' : '☆ Save'),
      h('button', { type: 'button', class: 's-act', onclick: () => copy(c) }, 'Copy')));
  track(el, c.id);
  return el;
}
function toggle(id, key) {
  const c = state.cards.find((x) => x.id === id);
  if (!c) return;
  const on = !c[key];
  if (on && key === 'liked') likes++;
  if (on && key === 'saved') saves++;
  account.patchDoc(state.uid, 'scroll', id, { [key]: on }, onError);
  $$(`.s-card[data-id="${CSS.escape(id)}"] [data-act="${key === 'liked' ? 'like' : 'save'}"]`).forEach((b) => {
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
    b.textContent = key === 'liked' ? (on ? '♥ Liked' : '♡ Like') : (on ? '★ Saved' : '☆ Save');
  });
  if (key === 'saved') toast(on ? 'Saved' : 'Removed from saved');
}
async function copy(c) {
  try { await navigator.clipboard.writeText(`"${c.text}" — ${c.author}`); toast('Copied'); } catch { toast("Couldn't copy"); }
}

/* ---------- Views ---------- */
function render() {
  $('#starter').classList.toggle('hidden', !(state.loaded && !state.cards.length));
  $('#saved-count').textContent = state.cards.filter((c) => c.saved).length;
  if (state.view === 'saved') renderSaved();
  if (state.view === 'stats') renderStats();
}
$$('.s-tab').forEach((t) => t.addEventListener('click', () => {
  state.view = t.dataset.view;
  $$('.s-tab').forEach((x) => x.classList.toggle('on', x === t));
  ['feed', 'saved', 'stats'].forEach((v) => $(`#view-${v}`).classList.toggle('hidden', v !== state.view));
  if (state.view === 'stats') { closeVisible(); timer?.pause(); } else active();
  render();
}));
function renderSaved() {
  const saved = state.cards.filter((c) => c.saved).sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
  fill($('#saved'), ...(saved.length ? saved.map(cardEl) : [h('p', { class: 't-empty' }, 'Tap ☆ Save on a card to keep it here.')]));
}
function renderStats() {
  const cards = state.cards;
  const total = state.activity.reduce((s, a) => s + (a.seconds || 0), 0);
  const days = new Set(state.activity.map((a) => a.day)).size;
  const todaySec = state.activity.filter((a) => a.day === dayKey(Date.now())).reduce((s, a) => s + a.seconds, 0);
  const seen = cards.filter((c) => c.views);
  const top = [...seen].sort((a, b) => (b.dwellMs || 0) - (a.dwellMs || 0)).slice(0, 8);
  const authors = {};
  seen.forEach((c) => { authors[c.author] = (authors[c.author] || 0) + (c.dwellMs || 0); });
  const topAuthors = Object.entries(authors).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxA = topAuthors[0]?.[1] || 1;
  const stat = (n, l) => h('div', { class: 's-stat' }, h('b', {}, n), h('span', {}, l));
  fill($('#stats'), 
    h('div', { class: 's-stat-row' }, stat(fmtMin(todaySec), 'today'), stat(fmtMin(total), 'all time'), stat(days, days === 1 ? 'day' : 'days'),
      stat(`${seen.length}/${cards.length}`, 'cards seen'), stat(cards.filter((c) => c.liked).length, 'liked'), stat(cards.filter((c) => c.saved).length, 'saved')),
    h('h2', { class: 'w-h2' }, 'Cards you lingered on'),
    top.length ? h('ol', { class: 's-top' }, ...top.map((c) => h('li', {}, h('span', { class: 's-top-text' }, c.title || c.text), h('span', { class: 's-top-meta' }, `${c.author} · ${fmtClock((c.dwellMs || 0) / 1000)} over ${c.views} view${c.views === 1 ? '' : 's'}`))))
      : h('p', { class: 't-empty' }, 'Scroll a while and the cards that hold your attention show up here.'),
    h('h2', { class: 'w-h2' }, 'Authors by attention'),
    topAuthors.length ? h('div', { class: 's-bars' }, ...topAuthors.map(([name, ms]) => h('div', { class: 's-barrow' },
      h('span', {}, name), h('span', { class: 'w-bar' }, h('i', { style: `width:${Math.round((ms / maxA) * 100)}%; --c: hsl(${hue(name)} 70% 65%)` })), h('b', {}, fmtClock(ms / 1000)))))
      : h('p', { class: 't-empty' }, 'Nothing yet.'));
}

/* ---------- Starter cards and adding ---------- */
$('#starter-load').addEventListener('click', async () => {
  const seed = await fetch('seed.json').then((r) => r.json());
  const now = Date.now();
  account.putMany(state.uid, 'scroll', seed.map(({ id, ...c }, i) => [id, { ...c, addedAt: now - i, views: 0, dwellMs: 0, liked: false, saved: false }]), onError);
  toast(`Loaded ${seed.length} cards`);
});
function openAdd() { if (!state.uid) return document.querySelector('.hub-user-btn')?.click(); $('#add-hint').textContent = ''; openModal($('#add')); $('#add-text').focus(); }
document.getElementById('s-add')?.addEventListener('click', openAdd);
$('#add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#add-text').value.trim(), author = $('#add-author').value.trim(), book = $('#add-book').value.trim();
  if (!text || !author) return;
  if (state.cards.some((c) => c.text.trim().toLowerCase() === text.toLowerCase())) return ($('#add-hint').textContent = 'That card is already in the Scroll.');
  account.putDoc(state.uid, 'scroll', null, { text, author, ...(book ? { book } : {}), source: 'Added in the Scroll', addedAt: Date.now(), views: 0, dwellMs: 0, liked: false, saved: false }, onError);
  $('#add-text').value = '';
  closeModal($('#add'));
  toast('Card added');
});
