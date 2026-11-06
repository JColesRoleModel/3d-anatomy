// Accounts: sign-in (Google, or email and password) and each person's data in Firestore, under users/<their id>/
// (saved views, practice records, tasks). The Firebase code (vendor/firebase.js) only loads when someone signs in, or was signed in
// on this device before, so the app stays as light as ever for everyone else.
import { firebaseConfig } from './firebase-config.js';
const here = new URL('.', import.meta.url).href; // so pages in subfolders (wellness/) load the same files

// For testing on this computer against the Firebase emulators: http://localhost:8081/?emulator
const EMULATOR = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulator');
export const config = EMULATOR ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-tolnri' } : firebaseConfig;

let ready = null;
let fb, auth, db;
function load() {
  ready ??= import(here + 'vendor/firebase.js').then((mod) => {
    fb = mod;
    const app = fb.initializeApp(config);
    auth = fb.initializeAuth(app, {
      persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence],
      popupRedirectResolver: fb.browserPopupRedirectResolver,
    });
    // A copy of the account's data stays on the device, so lists (like Tasks) open at once and changes made offline
    // sync when the connection is back. Browsers that refuse storage (some private windows) fall back to memory.
    try {
      db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
    } catch {
      db = fb.initializeFirestore(app, { localCache: fb.memoryLocalCache() });
    }
    if (EMULATOR) {
      fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
  }).catch((err) => { ready = null; throw err; });
  return ready;
}

// Calls onUser with the signed-in user (or null) now and whenever that changes.
let watching = false;
export async function start(onUser) {
  await load();
  if (!watching) { watching = true; fb.onAuthStateChanged(auth, onUser); }
}

export async function signInGoogle() {
  await load();
  return fb.signInWithPopup(auth, new fb.GoogleAuthProvider());
}
export async function signInEmail(email, password) {
  await load();
  return fb.signInWithEmailAndPassword(auth, email, password);
}
export async function createAccount(email, password) {
  await load();
  return fb.createUserWithEmailAndPassword(auth, email, password);
}
export async function resetPassword(email) {
  await load();
  return fb.sendPasswordResetEmail(auth, email);
}
export async function signOut() {
  await load();
  return fb.signOut(auth);
}

// Saved views: one document per view.
const savesOf = (uid) => fb.collection(db, 'users', uid, 'saves');
export async function list(uid) {
  await load();
  const snap = await fb.getDocs(savesOf(uid));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function put(uid, sv) {
  await load();
  return fb.setDoc(fb.doc(savesOf(uid), sv.id), { name: sv.name, created: sv.created, updated: sv.updated, data: sv.data });
}
export async function remove(uid, id) {
  await load();
  return fb.deleteDoc(fb.doc(savesOf(uid), id));
}

// Practice records (time spent on each movement, breath or mudra): one document per record, under
// users/<their id>/sessions, so the same account carries saved views and practice history.
const sessionsOf = (uid) => fb.collection(db, 'users', uid, 'sessions');
export async function listSessions(uid) {
  await load();
  const snap = await fb.getDocs(sessionsOf(uid));
  return snap.docs.map((d) => [d.id, d.data()]);
}
export async function putSession(uid, id, rec) {
  await load();
  return fb.setDoc(fb.doc(sessionsOf(uid), id), rec);
}
export async function putSessions(uid, entries) { // [[id, record], …], 400 per batch
  await load();
  for (let i = 0; i < entries.length; i += 400) {
    const batch = fb.writeBatch(db);
    for (const [id, rec] of entries.slice(i, i + 400)) batch.set(fb.doc(sessionsOf(uid), id), rec);
    await batch.commit();
  }
}
export async function deleteSessions(uid, ids) {
  await load();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = fb.writeBatch(db);
    for (const id of ids.slice(i, i + 400)) batch.delete(fb.doc(sessionsOf(uid), id));
    await batch.commit();
  }
}

// Tasks (the to-do list that was DoubleDoIt): one document per task under users/<their id>/tasks, kept live with a
// listener. Call watchTasks first; the write helpers below assume Firebase has loaded. Writes are not awaited: they
// apply on the device at once and only resolve when the server confirms, which never happens while offline.
const tasksOf = (uid) => fb.collection(db, 'users', uid, 'tasks');
export async function watchTasks(uid, onData, onError) {
  await load();
  return fb.onSnapshot(tasksOf(uid), { includeMetadataChanges: true }, (snap) => {
    onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })), { fromCache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites });
  }, onError);
}
export function createTask(uid, data, onError) {
  const ref = fb.doc(tasksOf(uid));
  fb.setDoc(ref, data).catch(onError);
  return ref.id;
}
export function patchTask(uid, id, patch, onError) {
  fb.updateDoc(fb.doc(tasksOf(uid), id), { ...patch, updatedAt: Date.now() }).catch(onError);
}
export function removeTask(uid, id, onError) {
  fb.deleteDoc(fb.doc(tasksOf(uid), id)).catch(onError);
}
export function bulkTasks(uid, creates = [], deletes = [], onError) { // 400 writes per batch
  const ops = [...creates.map((data) => (b) => b.set(fb.doc(tasksOf(uid)), data)), ...deletes.map((id) => (b) => b.delete(fb.doc(tasksOf(uid), id)))];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = fb.writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch));
    batch.commit().catch(onError);
  }
}

// Everything else a person keeps (users/<their id>/<name>: library, activity, scroll, prefs) goes through these.
// Writes apply on the device at once and sync when online, like the task helpers above.
const colOf = (uid, name) => fb.collection(db, 'users', uid, name);
export async function watchCollection(uid, name, onData, onError, sinceField = null, since = 0) {
  await load();
  const src = sinceField ? fb.query(colOf(uid, name), fb.where(sinceField, '>=', since)) : colOf(uid, name);
  return fb.onSnapshot(src, (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() })), { fromCache: snap.metadata.fromCache }), onError);
}
// Only the documents whose `field` is at least `since`, e.g. the last few weeks of practice records.
export async function readCollectionSince(uid, name, field, since) {
  await load();
  const snap = await fb.getDocs(fb.query(colOf(uid, name), fb.where(field, '>=', since)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function readCollection(uid, name) {
  await load();
  const snap = await fb.getDocs(colOf(uid, name));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export function putDoc(uid, name, id, data, onError, merge = false) {
  const ref = id ? fb.doc(colOf(uid, name), id) : fb.doc(colOf(uid, name));
  (merge ? fb.setDoc(ref, data, { merge: true }) : fb.setDoc(ref, data)).catch(onError);
  return ref.id;
}
export function patchDoc(uid, name, id, patch, onError) {
  fb.updateDoc(fb.doc(colOf(uid, name), id), patch).catch(onError);
}
export function removeDoc(uid, name, id, onError) {
  fb.deleteDoc(fb.doc(colOf(uid, name), id)).catch(onError);
}
export function putMany(uid, name, entries, onError, merge = false) { // [[id or null, data], …], 400 per batch
  for (let i = 0; i < entries.length; i += 400) {
    const batch = fb.writeBatch(db);
    for (const [id, data] of entries.slice(i, i + 400)) {
      const ref = id ? fb.doc(colOf(uid, name), id) : fb.doc(colOf(uid, name));
      merge ? batch.set(ref, data, { merge: true }) : batch.set(ref, data);
    }
    batch.commit().catch(onError);
  }
}
// Adds to a number field without reading it first, so two devices counting at once both count.
export const plus = (n) => fb.increment(n);

// Plain words for what went wrong.
const MESSAGES = {
  'auth/invalid-credential': "That email and password don't match an account.",
  'auth/wrong-password': "That email and password don't match an account.",
  'auth/user-not-found': "That email and password don't match an account.",
  'auth/invalid-email': "That doesn't look like an email address.",
  'auth/missing-email': 'Type your email address first.',
  'auth/missing-password': 'Type a password first.',
  'auth/email-already-in-use': 'There is already an account with that email. Sign in instead.',
  'auth/weak-password': 'Use a password of at least 6 characters.',
  'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
  'auth/network-request-failed': "Couldn't reach the internet. Check your connection.",
  'auth/popup-blocked': 'The sign-in window was blocked. Allow pop-ups for this site, or use email.',
  'auth/operation-not-supported-in-this-environment': "Google sign-in doesn't work here. Use email instead.",
  'auth/unauthorized-domain': "This site isn't on the Firebase project's authorized domains yet.",
  'auth/operation-not-allowed': "This way of signing in isn't turned on in the Firebase project yet.",
  'permission-denied': "The account storage refused this. The Firestore rules may not be published yet.",
  unavailable: "Couldn't reach your account. Check your connection.",
};
export const QUIET = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);
export function message(err) {
  return MESSAGES[err?.code] || (err?.code ? `Something went wrong (${err.code}).` : 'Something went wrong.');
}
