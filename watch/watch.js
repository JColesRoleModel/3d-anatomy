// Watch: your library of videos and audiobooks, each tagged Body, Mind or Spirit. A video plays inside the page and
// only the seconds it actually plays count toward its ring (pauses, buffering, skipping ahead and a hidden page add
// nothing). Long ones (45 min or more) remember where you stopped. 🎲 Random picks for you, including Tree of Life
// practice routines and the Scroll.
import { $, $$, h, fill, toast, onError, openModal, closeModal, signedInPage, account } from '../hub/page.js';
import { RINGS, ringOf, SessionTimer, byDay, activityEntries, practiceEntries, today, fmtMin, fmtClock, DEFAULT_GOALS } from '../hub/rings.js';

const LONG = 45 * 60; // seconds: "long-form" from here up
let ytReady = null, player = null, timer = null, posSaver = null; // the YouTube player and its session timer
const state = { uid: null, library: [], loaded: false, filter: 'all', search: '', activity: [], sessions: [], goals: { ...DEFAULT_GOALS }, unsubs: [] };

/* ---------- YouTube links ---------- */
export function videoIdOf(url) {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{6,})/);
      if (m) return m[2];
    }
  } catch {}
  return /^[\w-]{11}$/.test(url.trim()) ? url.trim() : null;
}

/* ---------- Signed in ---------- */
signedInPage({
  gateText: 'Sign in to keep your library and count your watch time toward your rings.',
  onUser(user) {
    state.unsubs.forEach((u) => u());
    state.unsubs = [];
    stopPlayer();
    state.uid = user?.uid || null;
    state.library = []; state.loaded = false;
    if (!user) return;
    render();
    const since = new Date(); since.setHours(0, 0, 0, 0);
    account.watchCollection(state.uid, 'library', (docs, meta) => {
      state.library = docs;
      if (!meta.fromCache) state.loaded = true;
      render();
    }, onError).then((u) => state.unsubs.push(u)).catch(onError);
    account.watchCollection(state.uid, 'activity', (docs) => { state.activity = docs; renderToday(); }, onError, 'startedAt', since.getTime())
      .then((u) => state.unsubs.push(u)).catch(onError);
    account.watchCollection(state.uid, 'prefs', (docs) => { const g = docs.find((d) => d.id === 'main')?.goals; if (g) state.goals = { ...DEFAULT_GOALS, ...g }; renderToday(); }, onError)
      .then((u) => state.unsubs.push(u)).catch(onError);
    account.listSessions(state.uid).then((rows) => { state.sessions = rows.map(([, s]) => s); renderToday(); }).catch(() => {});
  },
});

/* ---------- Today's rings (a small strip at the top) ---------- */
function renderToday() {
  const entries = [...activityEntries(state.activity), ...practiceEntries(state.sessions)];
  const d = byDay(entries)[today()] || {};
  fill($('#today'), ...RINGS.map((r) => {
    const sec = d[r.id] || 0, goal = state.goals[r.id];
    const pct = Math.min(100, Math.round((sec / 60 / goal) * 100));
    return h('div', { class: 'w-ring', style: `--c:${r.color}` },
      h('div', { class: 'w-ring-top' }, h('span', {}, r.label), h('b', {}, `${fmtMin(sec)} / ${goal}m`)),
      h('div', { class: 'w-bar' }, h('i', { style: `width:${pct}%` })));
  }));
}

/* ---------- Library ---------- */
function render() {
  const lib = state.library;
  const counts = { all: lib.length };
  lib.forEach((v) => { counts[v.ring] = (counts[v.ring] || 0) + 1; });
  fill($('#filters'), ...[{ id: 'all', label: 'All', color: 'var(--cream)' }, ...RINGS].map((r) =>
    h('button', { type: 'button', class: 'w-filter' + (state.filter === r.id ? ' on' : ''), style: `--c:${r.color}`, role: 'tab',
      onclick: () => { state.filter = r.id; render(); } }, r.id === 'all' ? '' : h('i', { class: 'w-dot' }), `${r.label} `, h('span', { class: 't-count' }, counts[r.id] || 0))));

  $('#starter').classList.toggle('hidden', !(state.loaded && !lib.length));

  const q = state.search.trim().toLowerCase();
  const shown = lib
    .filter((v) => state.filter === 'all' || v.ring === state.filter)
    .filter((v) => !q || `${v.title} ${v.who} ${v.notes}`.toLowerCase().includes(q))
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0) || (a.title || '').localeCompare(b.title || ''));
  fill($('#list'), ...shown.map(card));
  if (!shown.length && lib.length) $('#list').append(h('p', { class: 't-empty' }, 'Nothing here yet.'));
  if (!lib.length && !state.loaded) $('#list').append(h('p', { class: 't-empty' }, 'Loading…'));

  // Continue: long things started but not finished
  const going = lib.filter((v) => (v.durationSec || 0) >= LONG && v.positionSec > 60 && v.positionSec < v.durationSec - 120)
    .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0)).slice(0, 4);
  $('#continue-box').classList.toggle('hidden', !going.length);
  fill($('#continue-list'), ...going.map((v) => h('button', { type: 'button', class: 'w-cont', style: `--c:${ringOf(v.ring).color}`, onclick: () => play(v) },
    h('span', { class: 'w-cont-title' }, v.title || 'Untitled'),
    h('span', { class: 'w-bar' }, h('i', { style: `width:${Math.round((v.positionSec / v.durationSec) * 100)}%` })),
    h('span', { class: 'w-cont-meta' }, `${fmtClock(v.positionSec)} of ${fmtClock(v.durationSec)}`))));
}

function lengthOf(v) { return v.durationSec ? fmtMin(v.durationSec) : v.mins ? `${v.mins}m` : ''; }

function card(v) {
  const r = ringOf(v.ring);
  const long = (v.durationSec || 0) >= LONG;
  const meta = [r.label, lengthOf(v), v.who, v.plays ? `played ${v.plays}×` : null, v.playedSec ? `${fmtMin(v.playedSec)} total` : null].filter(Boolean).join(' · ');
  return h('article', { class: 'w-card' + (state.playing?.id === v.id ? ' on' : ''), style: `--c:${r.color}` },
    h('img', { class: 'w-thumb', src: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`, alt: '', loading: 'lazy' }),
    h('div', { class: 'w-card-body' },
      h('div', { class: 'w-card-title' }, v.title || 'Untitled video'),
      h('div', { class: 'w-card-meta' }, h('i', { class: 'w-dot' }), meta),
      long && v.positionSec > 60 ? h('div', { class: 'w-bar' }, h('i', { style: `width:${Math.min(100, Math.round((v.positionSec / v.durationSec) * 100))}%` })) : null),
    h('div', { class: 'w-card-actions' },
      h('button', { class: 't-btn t-primary w-play', type: 'button', 'aria-label': `Play ${v.title || 'video'}`, onclick: () => play(v) }, '▶'),
      h('button', { class: 't-pill', type: 'button', onclick: () => openEdit(v) }, 'Edit')));
}

$('#search').addEventListener('input', (e) => { state.search = e.target.value; render(); });

$('#starter-load').addEventListener('click', async () => {
  const seed = await fetch('seed.json').then((r) => r.json());
  const have = new Set(state.library.map((v) => v.videoId));
  const now = Date.now();
  const entries = seed.filter((s) => !have.has(s.videoId)).map((s, i) => [s.videoId, {
    videoId: s.videoId, url: s.url, title: s.title || '', who: s.who || '', ring: s.ring, mins: s.mins ?? null, notes: '',
    durationSec: null, positionSec: 0, playedSec: 0, plays: 0, lastPlayedAt: null, addedAt: now - i,
  }]);
  account.putMany(state.uid, 'library', entries, onError);
  toast(`Loaded ${entries.length} videos`);
});

/* ---------- Player ---------- */
function loadYT() {
  ytReady ??= new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = resolve;
    document.head.append(h('script', { src: 'https://www.youtube.com/iframe_api' }));
  });
  return ytReady;
}

async function play(v) {
  stopPlayer();
  state.playing = v;
  const r = ringOf(v.ring);
  $('#player-box').classList.remove('hidden');
  $('#player-box').style.setProperty('--c', r.color);
  $('#now-title').textContent = v.title || 'Loading…';
  fill($('#now-meta'), h('i', { class: 'w-dot' }), [r.label, v.who].filter(Boolean).join(' · '));
  $('#now-yt').href = `https://www.youtube.com/watch?v=${v.videoId}${v.positionSec > 60 ? `&t=${Math.floor(v.positionSec)}s` : ''}`;
  $('#now-note').textContent = '';
  $('#player-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
  render();

  timer = new SessionTimer({ account, uid: state.uid, source: 'watch', ring: v.ring, ref: v.id, title: v.title, onError,
    onSave: (delta) => account.patchDoc(state.uid, 'library', v.id, { playedSec: account.plus(delta) }, onError) });
  timer.extra = { videoId: v.videoId };
  account.patchDoc(state.uid, 'library', v.id, { plays: account.plus(1), lastPlayedAt: Date.now() }, onError);

  await loadYT();
  if (state.playing !== v) return;
  const resume = (v.durationSec || 0) >= LONG && v.positionSec > 60 && v.positionSec < v.durationSec - 120 ? Math.floor(v.positionSec) : 0;
  $('#player').replaceWith(h('div', { id: 'player' }));
  player = new YT.Player('player', {
    videoId: v.videoId,
    playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1, start: resume },
    events: {
      onReady: () => {
        const d = Math.round(player.getDuration() || 0);
        const t = player.getVideoData?.()?.title;
        const patch = {};
        if (d && d !== v.durationSec) patch.durationSec = d;
        if (t && !v.title) { patch.title = t; $('#now-title').textContent = t; timer.title = t; }
        if (Object.keys(patch).length) account.patchDoc(state.uid, 'library', v.id, patch, onError);
        if (resume) $('#now-note').textContent = `Picking up where you left off (${fmtClock(resume)}).`;
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) timer.start(); else timer.pause();
        if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) savePosition(e.data === YT.PlayerState.ENDED);
      },
      onError: (e) => {
        $('#now-note').textContent = e.data === 101 || e.data === 150
          ? "This video's owner doesn't allow it to play on other sites. Use Open in YouTube."
          : "This video couldn't play here. Try Open in YouTube.";
      },
    },
  });
  posSaver = setInterval(() => { if (timer?.running) savePosition(false); }, 30000);
}

function savePosition(ended) {
  const v = state.playing;
  if (!v || !player?.getCurrentTime) return;
  const pos = ended ? 0 : Math.floor(player.getCurrentTime() || 0);
  account.patchDoc(state.uid, 'library', v.id, { positionSec: pos }, onError);
}

function stopPlayer() {
  if (timer) { savePosition(false); timer.end(); timer = null; }
  clearInterval(posSaver);
  try { player?.destroy(); } catch {}
  player = null;
  state.playing = null;
  $('#player-box')?.classList.add('hidden');
}
setInterval(() => { if (timer) $('#now-counted').textContent = fmtClock(timer.seconds); }, 250);
$('#now-close').addEventListener('click', () => {
  const s = timer ? Math.floor(timer.seconds) : 0;
  const ring = state.playing ? ringOf(state.playing.ring).label : '';
  stopPlayer(); render();
  if (s >= 5) toast(`${s < 60 ? `${s}s` : fmtMin(s)} added to ${ring}`);
});
// When the page resumes after being hidden and the video is still playing, count again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && timer && player?.getPlayerState?.() === 1) timer.start();
});

/* ---------- Add / edit ---------- */
let editing = null, editRing = 'body';
function renderRingPick(box, value, onPick) {
  box.replaceChildren(...RINGS.map((r) => h('button', { type: 'button', class: 'w-ringbtn' + (r.id === value ? ' on' : ''), style: `--c:${r.color}`,
    onclick: () => onPick(r.id) }, h('b', {}, r.label), h('span', {}, r.hint))));
}
function openEdit(v = null) {
  editing = v;
  editRing = v?.ring || (state.filter !== 'all' ? state.filter : 'body');
  $('#edit-title').textContent = v ? 'Edit' : 'Add a video';
  $('#edit-url').value = v?.url || '';
  $('#edit-url').disabled = !!v;
  $('#edit-title-in').value = v?.title || '';
  $('#edit-notes').value = v?.notes || '';
  $('#edit-hint').textContent = '';
  $('#edit-remove').classList.toggle('hidden', !v);
  const pick = (id) => { editRing = id; renderRingPick($('#edit-ring'), editRing, pick); };
  pick(editRing);
  openModal($('#edit'));
  if (!v) $('#edit-url').focus();
}
$('#edit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#edit-title-in').value.trim(), notes = $('#edit-notes').value.trim();
  if (editing) {
    account.patchDoc(state.uid, 'library', editing.id, { title, notes, ring: editRing }, onError);
    toast('Saved');
  } else {
    const id = videoIdOf($('#edit-url').value);
    if (!id) return ($('#edit-hint').textContent = "That doesn't look like a YouTube link.");
    if (state.library.some((v) => v.videoId === id)) return ($('#edit-hint').textContent = 'That one is already in your library.');
    account.putDoc(state.uid, 'library', id, {
      videoId: id, url: `https://www.youtube.com/watch?v=${id}`, title, who: '', ring: editRing, mins: null, notes,
      durationSec: null, positionSec: 0, playedSec: 0, plays: 0, lastPlayedAt: null, addedAt: Date.now(),
    }, onError);
    toast(`Added to ${ringOf(editRing).label}`);
  }
  closeModal($('#edit'));
});
$('#edit-remove').addEventListener('click', () => {
  if (!editing) return;
  const { id, ...data } = editing;
  account.removeDoc(state.uid, 'library', id, onError);
  closeModal($('#edit'));
  toast('Removed', { label: 'Undo', fn: () => account.putDoc(state.uid, 'library', id, data, onError) });
});

/* ---------- 🎲 Random ---------- */
// Each ring can also roll something outside the library: practice routines, or the Scroll.
const PRACTICE = {
  body: { label: 'Innervation', links: ['lower.html?routine=HIPS1', 'lower.html?routine=HIPS2', 'upper.html?routine=RANDOM', 'head.html?routine=RANDOM', 'mudras.html'] },
  spirit: { label: 'Practice', links: ['breathwork.html', 'eyes.html?routine=FULL', 'eyes.html?routine=GROUND', 'eyes.html?routine=RESTORE', 'eyes.html?routine=ALERT'] },
};
const LENGTHS = [['any', 'Any'], [12, '≤ 10m'], [25, '≤ 20m'], [50, '≤ 45m']];
const roll = { ring: 'any', mode: 'videos', len: 'any' };
function renderRandom() {
  renderRingPick($('#pick-ring'), roll.ring, (id) => { roll.ring = roll.ring === id ? 'any' : id; if (roll.mode !== 'videos' && roll.mode !== 'all') roll.mode = 'videos'; renderRandom(); });
  const other = roll.ring === 'mind' ? { id: 'scroll', label: 'The Scroll' } : PRACTICE[roll.ring] ? { id: 'practice', label: PRACTICE[roll.ring].label } : null;
  const modes = [['videos', 'Videos'], ...(other ? [[other.id, other.label]] : []), ['all', other ? 'Fully random' : 'Anything']];
  if (!modes.some(([m]) => m === roll.mode)) roll.mode = 'videos';
  $('#mode-label').textContent = roll.ring === 'any' ? 'Any ring: tap one above to narrow it' : 'How?';
  fill($('#pick-mode'), ...modes.map(([id, label]) => h('button', { type: 'button', class: 't-seg-btn' + (roll.mode === id ? ' on' : ''), onclick: () => { roll.mode = id; renderRandom(); } }, label)));
  $('#pick-mode').style.gridTemplateColumns = `repeat(${modes.length}, 1fr)`;
  fill($('#pick-len'), ...LENGTHS.map(([id, label]) => h('button', { type: 'button', class: 't-seg-btn' + (roll.len === id ? ' on' : ''), onclick: () => { roll.len = id; renderRandom(); } }, label)));
  $('#random-hint').textContent = '';
}
function openRandom() { renderRandom(); openModal($('#random')); }
$('#random-open').addEventListener('click', openRandom);

function pickVideo() {
  const max = roll.len === 'any' ? Infinity : roll.len * 60;
  let pool = state.library.filter((v) => (roll.ring === 'any' || v.ring === roll.ring) && ((v.durationSec || (v.mins || 0) * 60 || 0) <= max || (!v.durationSec && !v.mins && max === Infinity)));
  if (!pool.length) return null;
  // Favor what you haven't played lately: weight grows with time since last played.
  const now = Date.now();
  const weights = pool.map((v) => 1 + Math.min(30, (now - (v.lastPlayedAt || 0)) / 864e5));
  let x = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= weights[i]; if (x <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
$('#roll').addEventListener('click', () => {
  const ring = roll.ring === 'any' ? RINGS[Math.floor(Math.random() * 3)].id : roll.ring;
  let mode = roll.mode;
  if (mode === 'all') {
    const opts = ['videos', ...(ring === 'mind' ? ['scroll'] : PRACTICE[ring] ? ['practice'] : [])];
    mode = opts[Math.floor(Math.random() * opts.length)];
  }
  if (mode === 'practice' && PRACTICE[ring]) {
    const links = PRACTICE[ring].links;
    location.href = '../wellness/' + links[Math.floor(Math.random() * links.length)];
    return;
  }
  if (mode === 'scroll') { location.href = '../scroll/'; return; }
  const saved = roll.ring;
  if (roll.ring === 'any' && roll.mode === 'all') roll.ring = ring;
  const v = pickVideo();
  roll.ring = saved;
  if (!v) { $('#random-hint').textContent = 'Nothing in the library matches. Try another length or ring.'; return; }
  closeModal($('#random'));
  play(v);
});

/* ---------- The page's buttons in the menu ---------- */
function wire(id, fn) { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); }
wire('w-add', () => (state.uid ? openEdit(null) : document.querySelector('.hub-user-btn')?.click()));
wire('w-random', () => (state.uid ? openRandom() : document.querySelector('.hub-user-btn')?.click()));
