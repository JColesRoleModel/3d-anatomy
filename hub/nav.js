// The site-wide menu, shared by every part of Tree of Life (the 3D anatomy, the practice pages, and whatever comes
// next). One horizontal bar: the logo, an icon for each part of the site, the current page's own tools, a Menu
// button that drops down the same things with their names, and the account button. Adding a part of the site means
// adding it to SECTIONS below.
//
// A page puts <header id="hub-nav" data-section="…" data-base="…"></header> where the bar goes (data-base is the
// path from that page back to the site's root, like "../") and calls initHub({ tools }) before its own code runs.
import * as account from '../account.js';

const ICONS = {
  body: '<circle cx="12" cy="4.6" r="2.3"/><path d="M5 9.2h14M12 9.2v6.3M12 15.5l-3.2 5.6M12 15.5l3.2 5.6"/>',
  lotus: '<path d="M12 4.5c2.2 2.3 2.9 5 2.1 8.2-.5 1.8-1.2 3.3-2.1 4.6-.9-1.3-1.6-2.8-2.1-4.6-.8-3.2-.1-5.9 2.1-8.2z M12 17.3c-2.8-.1-5.2-1.2-7-3.4 1-.9 2.3-1.4 3.7-1.5 M12 17.3c2.8-.1 5.2-1.2 7-3.4-1-.9-2.3-1.4-3.7-1.5 M5 19.5h14"/>',
  play: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M10.2 9.2v5.6l4.8-2.8z"/>',
  pulse: '<path d="M3 12.5h4l2-5 3.2 10 2.4-6.5 1.4 1.5H21"/>',
  coin: '<circle cx="12" cy="12" r="8"/><path d="M14.6 9.3c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2.1 2.7.9 2.7 2.1-1.2 2-2.7 2c-1.2 0-2.2-.5-2.7-1.5M12 6.4v1.5M12 16.2v1.5"/>',
  menu: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 12.3l2.8 2.8L16.2 9"/>',
  scroll: '<path d="M7 4.5h10.5a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H16v9a2.5 2.5 0 0 1-2.5 2.5H6.5A2.5 2.5 0 0 1 4 17.5v0A2.5 2.5 0 0 1 6.5 15H7z M7 4.5a2 2 0 0 0-2 2M10 9h3M10 12h3"/>',
  rings: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2.5"/>',
  screen: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  broom: '<path d="M14.5 3.5 10 11M6.5 11h8l1.5 9.5h-11z M9 15.5v5M12 15.5v5"/>',
  user: '<circle cx="12" cy="8.6" r="3.6"/><path d="M4.8 20c.9-3.7 3.7-5.7 7.2-5.7s6.3 2 7.2 5.7"/>',
  layers: '<path d="M12 3.2 2.6 8.6 12 14l9.4-5.4z M2.6 12.7 12 18.1l9.4-5.4"/>',
  bookmark: '<path d="M6.5 3.5h11v17L12 16.4l-5.5 4.1z"/>',
  keys: '<rect x="2.8" y="6" width="18.4" height="12" rx="2.2"/><path d="M6.5 9.5h.01M10 9.5h.01M13.5 9.5h.01M17 9.5h.01M7.5 14.5h9"/>',
  reset: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v3.7h3.7"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.2M12 7.8h.01"/>',
  stats: '<path d="M5 19.5V12M10 19.5V6M15 19.5v-9M20 19.5V9"/>',
  home: '<path d="M4 11.2 12 4.5l8 6.7M6.5 9.5v10h11v-10"/>',
  eye: '<path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z"/><circle cx="12" cy="12" r="2.8"/>',
  breath: '<path d="M3.5 9.5h10.2a2.6 2.6 0 1 0-2.6-2.6M3.5 13.5h14.4a2.6 2.6 0 1 1-2.6 2.6M3.5 17.5h6"/>',
  hand: '<path d="M8.5 12.5V5.8a1.3 1.3 0 0 1 2.6 0v5.4-6.6a1.3 1.3 0 0 1 2.6 0v6.6-5.4a1.3 1.3 0 0 1 2.6 0v7.4-4a1.3 1.3 0 0 1 2.6 0V15c0 3.4-2.6 5.8-5.9 5.8-2.4 0-3.9-1-5.2-2.7l-2.6-3.6a1.3 1.3 0 0 1 2.1-1.5z"/>',
  foot: '<path d="M9 3.5c-1.6 4-1.8 7.3-.6 10.3l1 2.4c.6 1.6 2 2.6 3.7 2.6h4.4a1.6 1.6 0 0 0 .3-3.2l-3.6-.8c-1.2-.3-2-1.3-2-2.5V3.5"/>',
  arm: '<path d="M6 19.5c.5-4.6 2-8 4.6-10.4l3.2-3a2 2 0 0 1 3 2.6l-2.1 2.7c2.6.5 4.3 2.7 4.3 5.3v2.8"/>',
  head: '<path d="M12 3.5c-4 0-6.8 2.9-6.8 6.6 0 2.1.9 3.6 2.3 4.9v5.5h7v-2.3h2.4a1.5 1.5 0 0 0 1.5-1.5v-2.3l1.4-.5-1.4-2.8C18.4 6.3 15.8 3.5 12 3.5z"/>',
  shuffle: '<path d="M3.5 7.5h3.2c4.6 0 5.6 9 10.4 9h3.4M3.5 16.5h3.2c1.7 0 2.8-1.2 3.7-2.7M13.7 10.2c.9-1.5 2-2.7 3.7-2.7h3.1M18 4.8l2.6 2.7L18 10.2M18 13.8l2.6 2.7-2.6 2.7"/>',
  google: '<path d="M20.5 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5z M12 21c2.4 0 4.4-.8 5.9-2.2l-2.9-2.2c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0 0 12 21z M7 13.8a5.4 5.4 0 0 1 0-3.5V8H4a9 9 0 0 0 0 8.1z M12 6.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 8l3 2.3c.7-2.1 2.7-3.7 5-3.7z"/>',
};
export const icon = (name, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;

// The parts of the site, listed at the bottom of the side menu on every page. "soon" ones show as what's coming.
const SECTIONS = [
  { id: 'home', label: 'Home', href: 'home/', icon: 'home' },
  { id: 'anatomy', label: '3D Anatomy', href: '?view=3d', icon: 'body' },
  { id: 'practice', label: 'Practice', href: 'wellness/', icon: 'lotus' },
  { id: 'watch', label: 'Watch', href: 'watch/', icon: 'play' },
  { id: 'scroll', label: 'Scroll', href: 'scroll/', icon: 'scroll' },
  { id: 'tasks', label: 'Tasks', href: 'tasks/', icon: 'check' },
  { id: 'rings', label: 'Rings', href: 'rings/', icon: 'rings' },
  { id: 'checkin', label: 'Check-in', href: 'checkin/', icon: 'pulse' },
  { id: 'dashboard', label: 'Dashboard', href: 'dashboard/', icon: 'screen' },
];
export const SITE_SECTIONS = SECTIONS;
// The practice pages, listed in the Menu wherever you are.
const PRACTICE = [
  ['index.html', 'Home', 'home'], ['eyes.html', 'Eyes', 'eye'], ['breathwork.html', 'Breath', 'breath'], ['mudras.html', 'Mudras', 'hand'],
  ['lower.html', 'Lower body', 'foot'], ['upper.html', 'Upper body', 'arm'], ['head.html', 'Head', 'head'], ['random.html', 'Random', 'shuffle'],
];
const PRACTICE_KEY = 'innervation-atlas-time-data'; // the practice timer's records, kept on this device
const ACCOUNT_KEY = 'tolnri.account.v1'; // '1' while someone is signed in on this device
const FACE_KEY = 'tolnri.account.face.v1'; // their picture and initial, so the account button shows them at once

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
let user = null;
const listeners = new Set();
export const hub = {
  get user() { return user; },
  onUser(fn) { listeners.add(fn); fn(user); return () => listeners.delete(fn); },
  status: {}, // one line per thing the account keeps in step, e.g. { views: 'Saved views are synced' }
  setStatus(key, text) { this.status[key] = text; renderStatus(); },
  account,
};
window.tolnriHub = hub;

export function initHub({ tools = [] } = {}) {
  const el = document.getElementById('hub-nav');
  const section = el.dataset.section;
  const base = el.dataset.base || '';
  const page = location.pathname.split('/').pop() || 'index.html';
  el.classList.add('hub-nav');

  const current = SECTIONS.find((s) => s.id === section);
  // A tool is a button the page wires up itself, or a link when it has an href.
  const toolButtons = tools.map((t) => {
    const attrs = `id="${t.id}" class="hub-icon hub-tool${t.desktopOnly ? ' hub-desktop' : ''}" title="${esc(t.title || t.label)}" aria-label="${esc(t.label)}"`;
    return t.href ? `<a ${attrs} href="${t.href}">${icon(t.icon)}</a>` : `<button type="button" ${attrs}>${icon(t.icon)}</button>`;
  }).join('');

  // The same bar on every page: the menu button, the tree logo, this page's own tools (wide screens), the account.
  // The menu slides out from the left: this page's tools at the top, the practice routines, then every part of the
  // site at the bottom.
  el.innerHTML = `
    <div class="hub-left">
      <button type="button" class="hub-icon hub-menu-btn" aria-label="Menu" aria-expanded="false" aria-controls="hub-menu" title="Menu">${icon('menu')}</button>
      <a class="hub-brand" href="${base}home/" aria-label="Tree of Life home">
        <img class="hub-logo" src="${base}icons/brand/tree-of-life.webp" alt="" width="160" height="172">
        <span class="hub-name"><span class="hub-title">${current && !['anatomy', 'home'].includes(current.id) ? esc(current.label) : 'Tree of Life:'}</span><span class="hub-sub">${current && !['anatomy', 'home'].includes(current.id) ? 'Tree of Life' : 'Neurological Research Institute'}</span></span>
      </a>
    </div>
    <nav class="hub-icons" aria-label="Page">
      ${tools.length ? `<span class="hub-group hub-tools">${toolButtons}</span>` : ''}
      <button type="button" class="hub-icon hub-user-btn" aria-label="Your account" aria-expanded="false" aria-controls="hub-account" title="Your account"><span class="hub-face">${icon('user')}</span></button>
    </nav>
    <div class="hub-scrim" hidden></div>
    <aside id="hub-menu" class="hub-drawer" aria-label="Menu" hidden>
      <div class="hub-drawer-head">
        <img class="hub-logo" src="${base}icons/brand/tree-of-life.webp" alt="" width="160" height="172">
        <span class="hub-name"><span class="hub-title">Tree of Life</span><span class="hub-sub">Neurological Research Institute</span></span>
        <button type="button" class="hub-icon hub-drawer-close" aria-label="Close menu">${icon('close')}</button>
      </div>
      <div class="hub-drawer-body">
        ${tools.length ? `<div class="hub-drop-title">On this page</div>
        <div class="hub-rows">${tools.map((t) => `<button type="button" class="hub-rowlink" data-tool="${t.id}">${icon(t.icon, 20)}<span>${esc(t.label)}</span></button>`).join('')}</div>` : ''}
        <div class="hub-drop-title">Practice</div>
        <div class="hub-rows hub-rows-2">${PRACTICE.map(([href, label, ic]) => {
          const on = section === 'practice' && page === href;
          return `<a class="hub-rowlink${on ? ' on' : ''}" href="${base}wellness/${href}">${icon(ic, 20)}<span>${label}</span></a>`;
        }).join('')}</div>
      </div>
      <nav class="hub-drawer-foot" aria-label="Site">
        <div class="hub-drop-title">Go to</div>
        <div class="hub-tiles">${SECTIONS.map((s) => s.soon
          ? `<span class="hub-tile soon" title="Coming soon">${icon(s.icon, 22)}<span>${s.label}</span><em>Soon</em></span>`
          : `<a class="hub-tile${s.id === section ? ' on' : ''}" href="${base}${s.href}"${s.id === section ? ' aria-current="page"' : ''}>${icon(s.icon, 22)}<span>${s.label}</span></a>`).join('')}</div>
      </nav>
    </aside>
    <div id="hub-account" class="hub-drop hub-account" hidden>
      <div class="hub-acct-head">
        <span class="hub-avatar hub-face">${icon('user', 22)}</span>
        <div><div class="hub-acct-name" id="hub-acct-name">Not signed in</div><div class="hub-acct-sub" id="hub-acct-sub">One account for the whole site</div></div>
      </div>
      <div class="hub-stats" id="hub-stats"></div>
      <div class="hub-links">
        <a class="hub-link" href="${base}rings/#practice" data-stats>${icon('rings', 18)}<span>Rings &amp; stats</span></a>
        <a class="hub-link" href="${base}?view=3d#saves" data-saves>${icon('bookmark', 18)}<span>Saved views</span></a>
      </div>
      <div id="hub-acct-out">
        <p class="hub-small">Sign in to keep your saved views and practice history in your account, on every device you use.</p>
        <div class="hub-row">
          <button type="button" class="hub-btn hub-primary" id="hub-google">${icon('google', 18)}<span>Sign in with Google</span></button>
          <button type="button" class="hub-linkbtn" id="hub-email-toggle">Use email instead</button>
        </div>
        <form class="hub-email" id="hub-email-form" hidden>
          <input id="hub-email" type="email" autocomplete="email" placeholder="Email" aria-label="Email">
          <input id="hub-password" type="password" autocomplete="current-password" placeholder="Password (6 or more characters)" aria-label="Password">
          <div class="hub-row">
            <button type="submit" class="hub-btn hub-primary">Sign in</button>
            <button type="button" class="hub-btn" id="hub-create">Create account</button>
            <button type="button" class="hub-linkbtn" id="hub-forgot">Forgot password?</button>
          </div>
        </form>
      </div>
      <div id="hub-acct-in" hidden>
        <div class="hub-status" id="hub-status"></div>
        <button type="button" class="hub-btn" id="hub-signout">Sign out</button>
      </div>
      <p class="hub-small hub-msg" id="hub-msg" role="status" aria-live="polite"></p>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const menu = $('hub-menu'), acct = $('hub-account');
  const menuBtn = el.querySelector('.hub-menu-btn'), userBtn = el.querySelector('.hub-user-btn');
  const scrim = el.querySelector('.hub-scrim');
  const drops = [[menu, menuBtn], [acct, userBtn]];
  const close = () => {
    drops.forEach(([d, b]) => { d.hidden = true; b.setAttribute('aria-expanded', 'false'); });
    scrim.hidden = true;
    document.documentElement.classList.remove('hub-drawer-open');
  };
  const toggle = (d, b) => {
    const open = d.hidden;
    close();
    if (!open) return;
    d.hidden = false;
    b.setAttribute('aria-expanded', 'true');
    if (d === acct) renderStats();
    if (d === menu) { scrim.hidden = false; document.documentElement.classList.add('hub-drawer-open'); menu.querySelector('.hub-drawer-close').focus(); }
  };
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); toggle(menu, menuBtn); });
  userBtn.addEventListener('click', (e) => { e.stopPropagation(); toggle(acct, userBtn); });
  scrim.addEventListener('click', close);
  menu.querySelector('.hub-drawer-close').addEventListener('click', close);
  document.addEventListener('click', (e) => { if (!el.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  menu.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tool]');
    if (t) { close(); $(t.dataset.tool)?.click(); }
  });
  // On the page that has them, these open in place instead of loading the page again.
  // The practice pages' own Stats buttons open the Rings page too, so there is one set of numbers for everything.
  if (window.timeStatsUI) window.timeStatsUI.open = () => { location.href = `${base}rings/#practice`; };
  acct.querySelector('[data-saves]').addEventListener('click', (e) => {
    const b = $('btn-saves');
    if (b) { e.preventDefault(); close(); b.click(); }
  });

  // ---------- Signing in ----------
  const msg = (text = '', err = false) => { $('hub-msg').textContent = text; $('hub-msg').classList.toggle('err', err); };
  const email = () => $('hub-email').value.trim();
  async function busy(fn, doing) {
    const buttons = [...acct.querySelectorAll('button')];
    buttons.forEach((b) => (b.disabled = true));
    msg(doing);
    try { await account.start(onUser); await fn(); msg(''); return true; }
    catch (err) { if (account.QUIET.has(err?.code)) msg(''); else msg(account.message(err), true); return false; }
    finally { buttons.forEach((b) => (b.disabled = false)); }
  }
  $('hub-google').addEventListener('click', () => busy(() => account.signInGoogle(), 'Opening Google sign-in…'));
  $('hub-email-toggle').addEventListener('click', () => { $('hub-email-form').hidden = false; $('hub-email').focus(); });
  $('hub-email-form').addEventListener('submit', (e) => { e.preventDefault(); busy(() => account.signInEmail(email(), $('hub-password').value), 'Signing in…'); });
  $('hub-create').addEventListener('click', () => busy(() => account.createAccount(email(), $('hub-password').value), 'Creating your account…'));
  $('hub-forgot').addEventListener('click', async () => {
    if (await busy(() => account.resetPassword(email()), 'Sending…')) msg(`If there's an account for ${email()}, a reset link is on its way there.`);
  });
  $('hub-signout').addEventListener('click', () => busy(() => account.signOut(), 'Signing out…'));

  function onUser(u) {
    user = u;
    try {
      if (u) {
        localStorage.setItem(ACCOUNT_KEY, '1');
        localStorage.setItem(FACE_KEY, JSON.stringify(faceOf(u)));
      } else {
        localStorage.removeItem(ACCOUNT_KEY);
        localStorage.removeItem(FACE_KEY);
      }
    } catch {}
    renderUser();
    for (const fn of listeners) fn(u);
  }
  function renderUser() {
    $('hub-acct-out').hidden = !!user || !account.config;
    $('hub-acct-in').hidden = !user;
    $('hub-acct-name').textContent = user ? (user.displayName || user.email || 'Signed in') : 'Not signed in';
    $('hub-acct-sub').textContent = user ? (user.displayName && user.email ? user.email : 'Signed in') : 'One account for the whole site';
    renderFace(user ? faceOf(user) : null);
    userBtn.classList.toggle('in', !!user);
    userBtn.title = user ? `Your account (${user.displayName || user.email || 'signed in'})` : 'Your account';
    if (!user) $('hub-email-form').hidden = true;
    renderStatus();
  }
  // Signed-in people see their picture (or initial) in place of the person icon: their Google photo, if they have one
  function faceOf(u) {
    const name = u.displayName || u.email || '';
    return { photo: u.photoURL || (u.providerData || []).find((p) => p.photoURL)?.photoURL || '', initial: name.trim().charAt(0).toUpperCase() };
  }
  function renderFace(face) {
    el.querySelectorAll('.hub-face').forEach((box) => {
      const size = box.classList.contains('hub-avatar') ? 22 : 20;
      box.classList.toggle('has-face', !!face);
      if (!face) { box.innerHTML = icon('user', size); return; }
      const letter = () => { box.innerHTML = face.initial ? `<span class="hub-initial">${esc(face.initial)}</span>` : icon('user', size); };
      if (!face.photo) return letter();
      const img = new Image();
      img.className = 'hub-photo';
      img.alt = '';
      img.referrerPolicy = 'no-referrer'; // Google's picture links refuse requests that say which site they came from
      img.onerror = letter;
      img.src = face.photo;
      box.replaceChildren(img);
    });
  }

  renderUser();
  let wasIn = false;
  try { wasIn = localStorage.getItem(ACCOUNT_KEY) === '1'; } catch {}
  // Show the picture from last time straight away, before the account has finished loading
  if (wasIn) { try { const face = JSON.parse(localStorage.getItem(FACE_KEY) || 'null'); if (face) renderFace(face); } catch {} }
  if (account.config && wasIn) account.start(onUser).catch((err) => msg(account.message(err), true));
  return hub;
}

function renderStatus() {
  const box = document.getElementById('hub-status');
  if (box) box.innerHTML = Object.values(hub.status).filter(Boolean).map((t) => `<div>${esc(t)}</div>`).join('');
}

// A quiet summary of the practice time on this device: this week, the run of days in a row, and all time.
function renderStats() {
  const box = document.getElementById('hub-stats');
  let sessions = [];
  try { sessions = JSON.parse(localStorage.getItem(PRACTICE_KEY) || '{}').sessions || []; } catch {}
  const now = new Date();
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)).getTime();
  let week = 0, total = 0;
  const days = new Set();
  for (const s of sessions) {
    const d = Number(s.duration) || 0;
    total += d;
    if (s.timestamp >= startOfWeek) week += d;
    days.add(new Date(s.timestamp).toDateString());
  }
  let streak = 0;
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(day.toDateString())) day.setDate(day.getDate() - 1); // today doesn't break the run until it's over
  while (days.has(day.toDateString())) { streak++; day.setDate(day.getDate() - 1); }
  const fmt = (sec) => sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m` : `${Math.round(sec / 60)}m`;
  box.innerHTML = [['This week', fmt(week)], ['Days in a row', String(streak)], ['All time', fmt(total)]]
    .map(([k, v]) => `<div class="hub-stat"><b>${v}</b><span>${k}</span></div>`).join('');
}
