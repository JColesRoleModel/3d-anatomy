// Shared bits for the site's own pages (Watch, Scroll, Rings, Dashboard): the signed-in gate, a toast, dialogs, and
// a small element builder. Each page has #gate (with #gate-text and #gate-signin), #app and #toast.
import { hub } from './nav.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((k) => { if (k != null && k !== false) el.append(k); });
  return el;
}

// Like el.replaceChildren, but skips empty slots (null, false) instead of printing them as text.
export function fill(el, ...kids) { el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false)); }

export function toast(msg, action) {
  const t = $('#toast');
  if (!t) return;
  t.replaceChildren(h('span', {}, msg));
  if (action) t.append(h('button', { class: 't-toast-btn', type: 'button', onclick: () => { action.fn(); t.classList.add('hidden'); } }, action.label));
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), action ? 4500 : 1800);
}

export function onError(err) {
  console.error(err);
  toast(err?.code === 'permission-denied' ? 'Your account refused that. Try signing in again.' : hub.account.message(err));
}

// Dialogs: .t-modal with [data-close] parts.
export function openModal(el) { el.classList.remove('hidden'); }
export function closeModal(el) { el.classList.add('hidden'); }
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-close]');
  if (c) c.closest('.t-modal')?.classList.add('hidden');
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.t-modal').forEach((m) => m.classList.add('hidden')); });

/**
 * Shows the sign-in gate until someone is signed in, then #app, and calls onUser(user) / onUser(null).
 * Someone signed in on this device before: wait for the account instead of flashing the prompt.
 */
export function signedInPage({ gateText, onUser }) {
  let wasIn = false;
  try { wasIn = localStorage.getItem('tolnri.account.v1') === '1'; } catch {}
  let first = true, current;
  const show = (u) => {
    $('#gate').classList.toggle('hidden', !!u);
    $('#app').classList.toggle('hidden', !u);
    if (!u) { $('#gate-text').textContent = gateText; $('#gate-signin').classList.remove('hidden'); }
  };
  if (!wasIn) show(null);
  $('#gate-signin').addEventListener('click', (e) => { e.stopPropagation(); document.querySelector('.hub-user-btn')?.click(); });
  hub.onUser((u) => {
    const wasFirst = first;
    first = false;
    if (!u && wasFirst && wasIn) return;
    if ((u?.uid || null) === (current?.uid || null) && !wasFirst) return;
    current = u;
    show(u);
    onUser(u);
  });
}

export { hub };
export const account = hub.account;
