// Tasks: the to-do list that used to be DoubleDoIt, now part of Tree of Life. Two columns: DUE (anything with a
// date, grouped Overdue / Today / Tomorrow / This week / Later) and GENERAL (sortable, shuffleable). Saved in the
// signed-in account (users/<id>/tasks), live on every device, and usable offline.
import { hub } from '../hub/nav.js';
import {
  todayYMD, addDays, parseYMD, sectionOf, groupByDue, sortGeneral, matchesSearch, normalize,
  formatDue, lateLabel, bucketOf, cleanImported, importKey,
} from './logic.js';

const account = hub.account;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/* ---------- State ---------- */
const UI_KEY = 'tolnri.tasks.ui';
const state = {
  user: null,
  tasks: [],
  loaded: false,
  unsub: null,
  ui: { showCompleted: false, sortGeneral: 'old', seedGeneral: Math.random(), tab: 'due', ...readUI() },
  search: '',
  quickWhen: 'none',
  quickDate: '',
  modal: { editingId: null, section: 'due' },
};
function readUI() { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; } }
function saveUI() { try { localStorage.setItem(UI_KEY, JSON.stringify(state.ui)); } catch {} }

/* ---------- Small helpers ---------- */
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((k) => { if (k != null && k !== false) el.append(k); });
  return el;
}

function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(h('span', {}, msg));
  if (action) t.append(h('button', { class: 't-toast-btn', type: 'button', onclick: () => { action.fn(); t.classList.add('hidden'); } }, action.label));
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), action ? 4500 : 1600);
}

function onError(err) {
  console.error(err);
  toast(err?.code === 'permission-denied' ? "Your account refused that. Try signing in again." : account.message(err));
}

function ask(text, okLabel = 'OK') {
  return new Promise((resolve) => {
    const box = $('#confirm');
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = okLabel;
    box.classList.remove('hidden');
    const done = (v) => { box.classList.add('hidden'); cleanup(); resolve(v); };
    const ok = () => done(true), no = () => done(false);
    const closers = box.querySelectorAll('[data-close]');
    function cleanup() { $('#confirm-ok').removeEventListener('click', ok); closers.forEach((c) => c.removeEventListener('click', no)); }
    $('#confirm-ok').addEventListener('click', ok);
    closers.forEach((c) => c.addEventListener('click', no));
    $('#confirm-ok').focus();
  });
}

/* ---------- Signed in or not ---------- */
function showGate(text, button) {
  $('#gate').classList.remove('hidden');
  $('#app').classList.add('hidden');
  $('#gate-text').textContent = text;
  $('#gate-signin').classList.toggle('hidden', !button);
}

// Someone was signed in on this device before: the hub reports "nobody" for a moment while it loads the account,
// so wait for the real answer instead of flashing the sign-in prompt.
let wasIn = false;
try { wasIn = localStorage.getItem('tolnri.account.v1') === '1'; } catch {}
let firstReport = true;

hub.onUser((user) => {
  const first = firstReport;
  firstReport = false;
  if (!user && first && wasIn) return;
  if (user?.uid === state.user?.uid && state.unsub) return;
  state.unsub?.();
  state.unsub = null;
  state.user = user;
  state.tasks = [];
  state.loaded = false;
  if (!user) {
    showGate('Sign in to keep your tasks in your account and see them on every device.', true);
    return;
  }
  $('#gate').classList.add('hidden');
  $('#app').classList.remove('hidden');
  render();
  account.watchTasks(user.uid, (tasks) => {
    state.tasks = tasks;
    state.loaded = true;
    render();
  }, onError).then((unsub) => {
    if (state.user?.uid === user.uid) state.unsub = unsub; else unsub();
  }).catch(onError);
});
// Nobody has signed in on this device before: the hub never loads Firebase, so say so instead of "Opening…".
if (!wasIn) showGate('Sign in to keep your tasks in your account and see them on every device.', true);

$('#gate-signin').addEventListener('click', (e) => {
  e.stopPropagation();
  document.querySelector('.hub-user-btn')?.click();
});

/* ---------- Render ---------- */
function render() {
  if (!state.user) return;
  const q = normalize(state.search);
  const vis = state.tasks.filter((t) => matchesSearch(t, q)).filter((t) => state.ui.showCompleted || !t.completed);
  const due = vis.filter((t) => sectionOf(t) === 'due');
  const gen = vis.filter((t) => sectionOf(t) === 'general');
  const openDue = due.filter((t) => !t.completed).length;
  const openGen = gen.filter((t) => !t.completed).length;
  $('#count-due').textContent = $('#tab-count-due').textContent = openDue;
  $('#count-general').textContent = $('#tab-count-general').textContent = openGen;

  const listDue = $('#list-due');
  const groups = groupByDue(due);
  listDue.replaceChildren(...groups.flatMap((g) => [
    h('div', { class: `t-group g-${g.key}` }, h('span', {}, g.label.charAt(0) + g.label.slice(1).toLowerCase()), h('span', { class: 't-count' }, g.tasks.length)),
    ...g.tasks.map(card),
  ]));
  if (!groups.length) listDue.append(empty('due'));

  const listGen = $('#list-general');
  listGen.replaceChildren(...sortGeneral(gen, state.ui.sortGeneral, state.ui.seedGeneral).map(card));
  if (!gen.length) listGen.append(empty('general'));

  $$('.t-tab').forEach((b) => {
    const on = b.dataset.tab === state.ui.tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on);
  });
  $$('.t-col').forEach((c) => c.classList.toggle('tab-hidden', c.dataset.col !== state.ui.tab));
}

function empty(section) {
  const text = !state.loaded ? 'Loading…'
    : state.search ? 'No matches.'
    : section === 'due' ? 'Nothing due. Pick Today, Tomorrow or a date when you add a task to put it here.'
    : 'No general tasks. Add one above.';
  return h('div', { class: 't-empty' }, text);
}

const titleCase = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/ · (\d)/, ' · $1');

function card(t) {
  const uid = state.user.uid;
  const section = sectionOf(t);
  const bucket = section === 'due' ? bucketOf(t) : '';
  const tags = [];
  if (section === 'due') tags.push(h('span', { class: `t-tag b-${bucket}` }, titleCase(formatDue(t))));
  const late = lateLabel(t);
  if (late) tags.push(h('span', { class: 't-tag b-overdue' }, titleCase(late)));
  if (t.estMinutes) tags.push(h('span', { class: 't-tag' }, `${t.estMinutes} min`));

  const toggleDone = () => {
    const completed = !t.completed;
    account.patchTask(uid, t.id, { completed, completedAt: completed ? Date.now() : null }, onError);
    toast(completed ? 'Done' : 'Restored', completed ? { label: 'Undo', fn: () => account.patchTask(uid, t.id, { completed: false, completedAt: null }, onError) } : null);
  };
  const move = () => {
    if (section === 'general') return openModal(t.id, { section: 'due' });
    account.patchTask(uid, t.id, { section: 'general', due: null, dueTime: null }, onError);
    toast('Moved to General');
  };
  const del = () => {
    const { id, ...data } = t;
    account.removeTask(uid, id, onError);
    toast('Deleted', { label: 'Undo', fn: () => account.createTask(uid, data, onError) });
  };

  return h('article', { class: `t-card${t.completed ? ' done' : ''}${bucket === 'overdue' ? ' late' : ''}` },
    h('div', { class: 't-card-top' },
      h('button', { class: 't-tick', type: 'button', 'aria-label': t.completed ? 'Mark not done' : 'Mark done', onclick: toggleDone }, t.completed ? '✓' : ''),
      h('button', { class: 't-card-main', type: 'button', onclick: () => openModal(t.id) },
        h('span', { class: 't-card-title' }, t.title || 'Untitled'),
        tags.length ? h('span', { class: 't-tags' }, tags) : null)),
    t.notes ? h('p', { class: 't-notes' }, t.notes) : null,
    h('div', { class: 't-card-actions' },
      h('span', { class: 't-added' }, 'Added ' + new Date(t.createdAt || Date.now()).toLocaleDateString()),
      h('span', { class: 't-actions' },
        h('button', { class: 't-pill', type: 'button', onclick: move }, section === 'due' ? '→ General' : '→ Due'),
        h('button', { class: 't-pill red', type: 'button', onclick: del }, 'Delete'))));
}

/* ---------- Quick add ---------- */
function setQuickWhen(when) {
  state.quickWhen = when;
  $$('.t-chip').forEach((b) => {
    const on = b.dataset.when === when;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  });
  $('#quick-date-label').textContent = when === 'pick' && state.quickDate
    ? parseYMD(state.quickDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : 'Pick a date';
}

function newTask(fields) {
  const now = Date.now();
  return { title: '', notes: '', estMinutes: null, section: 'general', due: null, dueTime: null, completed: false, completedAt: null, createdAt: now, updatedAt: now, ...fields };
}

$('#quick').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = $('#quick-title').value.trim();
  if (!title) return $('#quick-title').focus();
  let due = null;
  if (state.quickWhen === 'today') due = todayYMD();
  if (state.quickWhen === 'tomorrow') due = addDays(todayYMD(), 1);
  if (state.quickWhen === 'pick') due = state.quickDate || null;
  account.createTask(state.user.uid, newTask({ title, section: due ? 'due' : 'general', due }), onError);
  $('#quick-title').value = '';
  state.quickDate = '';
  $('#quick-date').value = '';
  setQuickWhen('none');
  state.ui.tab = due ? 'due' : 'general';
  saveUI();
  toast(due ? 'Added · ' + titleCase(formatDue({ due })) : 'Added to General');
  render();
});
$$('.t-chip').forEach((b) => {
  if (b.dataset.when === 'pick') return;
  b.addEventListener('click', () => { setQuickWhen(b.dataset.when); $('#quick-title').focus({ preventScroll: true }); });
});
const qd = $('#quick-date');
$('.t-chip-date').addEventListener('click', (e) => {
  if (e.target === qd) return;
  e.preventDefault();
  try { qd.showPicker(); } catch { qd.focus(); }
});
qd.addEventListener('change', () => {
  state.quickDate = qd.value;
  setQuickWhen(qd.value ? 'pick' : 'none');
  $('#quick-title').focus({ preventScroll: true });
});

/* ---------- Add / edit ---------- */
function setModalSection(section) {
  state.modal.section = section;
  $$('#modal .t-seg-btn').forEach((b) => {
    const on = b.dataset.section === section;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  });
  $('#due-wrap').classList.toggle('hidden', section !== 'due');
  if (section === 'due' && !$('#task-due').value) $('#task-due').value = todayYMD();
}

function openModal(editId = null, preset = {}) {
  if (!state.user) return;
  state.modal.editingId = editId;
  $('#modal-hint').textContent = '';
  const t = editId ? state.tasks.find((x) => x.id === editId) : null;
  $('#modal-title').textContent = t ? 'Edit task' : 'New task';
  $('#btn-save').textContent = t ? 'Update' : 'Save';
  $('#task-title').value = t?.title || $('#quick-title').value.trim();
  $('#task-notes').value = t?.notes || '';
  $('#task-due').value = t?.due || '';
  $('#task-time').value = t?.dueTime || '';
  $('#has-est').checked = !!t?.estMinutes;
  $('#est-wrap').classList.toggle('hidden', !t?.estMinutes);
  $('#task-est').value = t?.estMinutes ? String(t.estMinutes) : '';
  setModalSection(preset.section || (t ? sectionOf(t) : state.ui.tab === 'general' ? 'general' : 'due'));
  $('#modal').classList.remove('hidden');
  if (preset.section === 'due') $('#task-due').focus();
  else if (!t) $('#task-title').focus();
}
const closeModal = () => { $('#modal').classList.add('hidden'); state.modal.editingId = null; };

$('#modal-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const hint = (m) => { $('#modal-hint').textContent = m; };
  const title = $('#task-title').value.trim();
  if (!title) return hint('Give the task a name.');
  const section = state.modal.section;
  const due = section === 'due' ? ($('#task-due').value || null) : null;
  const dueTime = due ? ($('#task-time').value || null) : null;
  let estMinutes = null;
  if ($('#has-est').checked) {
    const n = Number($('#task-est').value.trim());
    if (!Number.isFinite(n) || n <= 0) return hint('Minutes must be a number above zero.');
    estMinutes = Math.round(n);
  }
  const fields = { title, notes: $('#task-notes').value.trim(), section, due, dueTime, estMinutes };
  if (state.modal.editingId) {
    account.patchTask(state.user.uid, state.modal.editingId, fields, onError);
    toast('Updated');
  } else {
    account.createTask(state.user.uid, newTask(fields), onError);
    $('#quick-title').value = '';
    toast('Saved');
  }
  state.ui.tab = section;
  saveUI();
  closeModal();
  render();
});
$$('#modal .t-seg-btn').forEach((b) => b.addEventListener('click', () => setModalSection(b.dataset.section)));
$('#has-est').addEventListener('change', (e) => {
  $('#est-wrap').classList.toggle('hidden', !e.target.checked);
  if (e.target.checked) $('#task-est').focus();
});
['#btn-cancel', '#modal-x', '#modal-back'].forEach((s) => $(s).addEventListener('click', closeModal));

/* ---------- Export / import / clear (wired to the buttons the site menu draws) ---------- */
function exportJSON() {
  if (!state.user) return toast('Sign in first');
  const data = state.tasks.map(({ id, ...rest }) => rest);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: `tasks-${todayYMD()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importJSON(file) {
  const parsed = JSON.parse(await file.text());
  const list = Array.isArray(parsed) ? parsed : parsed?.tasks;
  if (!Array.isArray(list)) throw new Error("That file doesn't look like a task export.");
  const existing = new Set(state.tasks.map(importKey));
  const fresh = list.map(cleanImported).filter((t) => !existing.has(importKey(t)));
  const skipped = list.length - fresh.length;
  if (!fresh.length) return toast(skipped ? 'All of those are already here' : 'Nothing to import');
  const ok = await ask(`Import ${fresh.length} task${fresh.length > 1 ? 's' : ''}?` + (skipped ? ` ${skipped} already here will be skipped.` : ''), 'Import');
  if (!ok) return;
  account.bulkTasks(state.user.uid, fresh, [], onError);
  toast(`Imported ${fresh.length}`);
}

async function clearDone() {
  if (!state.user) return;
  const done = state.tasks.filter((t) => t.completed);
  if (!done.length) return toast('No done tasks to clear');
  if (!(await ask(`Permanently delete ${done.length} done task${done.length > 1 ? 's' : ''}?`, 'Delete'))) return;
  account.bulkTasks(state.user.uid, [], done.map((t) => t.id), onError);
  toast('Cleared');
}

function wireTools() {
  const bind = (id, fn) => { const b = document.getElementById(id); if (b && !b.dataset.wired) { b.dataset.wired = '1'; b.addEventListener('click', fn); } };
  bind('t-add', () => (state.user ? openModal(null) : document.querySelector('.hub-user-btn')?.click()));
  bind('t-export', exportJSON);
  bind('t-import', () => { if (!state.user) return toast('Sign in first'); $('#import-file').value = ''; $('#import-file').click(); });
  bind('t-clear', clearDone);
}
wireTools();
$('#import-file').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try { await importJSON(f); } catch (err) { toast('Import failed: ' + err.message); }
});

/* ---------- Toolbar, tabs, background ---------- */
$('#search').addEventListener('input', (e) => { state.search = e.target.value; render(); });
$('#toggle-completed').checked = !!state.ui.showCompleted;
$('#toggle-completed').addEventListener('change', (e) => { state.ui.showCompleted = e.target.checked; saveUI(); render(); });
$('#sort-general').value = state.ui.sortGeneral;
$('#sort-general').addEventListener('change', (e) => {
  state.ui.sortGeneral = e.target.value;
  if (e.target.value === 'random') state.ui.seedGeneral = Math.random();
  saveUI(); render();
});
$('#shuffle-general').addEventListener('click', () => {
  state.ui.seedGeneral = Math.random();
  state.ui.sortGeneral = 'random';
  $('#sort-general').value = 'random';
  saveUI(); render();
});
$$('.t-tab').forEach((b) => b.addEventListener('click', () => { state.ui.tab = b.dataset.tab; saveUI(); render(); }));

function setBg(bg) {
  document.documentElement.classList.toggle('bg-landscape', bg === 'landscape');
  $$('.t-look .t-seg-btn').forEach((b) => { const on = b.dataset.bg === bg; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  try { localStorage.setItem('tolnri.tasks.bg', bg); } catch {}
}
setBg(document.documentElement.classList.contains('bg-landscape') ? 'landscape' : 'sky');
$$('.t-look .t-seg-btn').forEach((b) => b.addEventListener('click', () => setBg(b.dataset.bg)));
const dim = $('#dim');
dim.value = Math.round((parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dim')) || 0.55) * 100);
const showDim = () => { document.documentElement.style.setProperty('--dim', dim.value / 100); $('#dim-val').textContent = dim.value + '%'; };
showDim();
dim.addEventListener('input', () => { showDim(); try { localStorage.setItem('tolnri.tasks.dim', dim.value); } catch {} });

/* ---------- Keys, and keeping "today" current ---------- */
document.addEventListener('keydown', (e) => {
  const open = !$('#modal').classList.contains('hidden');
  if (e.key === 'Escape') { closeModal(); $('#confirm').classList.add('hidden'); }
  if (open && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#modal-form').requestSubmit();
  if (!open && e.key === 'n' && state.user && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
    e.preventDefault(); $('#quick-title').focus();
  }
});
setInterval(render, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
setQuickWhen('none');
