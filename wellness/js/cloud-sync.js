// Cloud backup for practice history.
// Stats always save on the device first. When you sign in with Google, every
// record is also saved to Firebase, so it survives a lost, broken or reset phone,
// and your history follows you between devices.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, setDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMW-unQD3o8uGPFmsysXdhO9q9yqaYWNU",
  authDomain: "treeoflifenri.firebaseapp.com",
  projectId: "treeoflifenri",
  storageBucket: "treeoflifenri.firebasestorage.app",
  messagingSenderId: "819384484112",
  appId: "1:819384484112:web:b78181d4b2e9b5be59e595"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let loginLink = null;

// -------------------------
// Records
// -------------------------

// Stable id per record, so the same movement is never stored twice
function recordId(s) {
  const key = `${s.section}|${s.routine}|${s.movement}|${s.duration}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `${s.timestamp}-${(h >>> 0).toString(36)}`;
}

// Matches the shape the Firestore security rules accept
function cleanRecord(s) {
  return {
    section: String(s.section || "Unknown").slice(0, 100),
    routine: s.routine == null ? null : String(s.routine).slice(0, 100),
    movement: s.movement == null ? null : String(s.movement).slice(0, 200),
    duration: Number(s.duration),
    timestamp: Number(s.timestamp)
  };
}

function isValid(s) {
  const d = Number(s.duration), t = Number(s.timestamp);
  return d > 0 && d <= 3600 && Number.isFinite(t);
}

function sessionsCollection() {
  return collection(db, "users", currentUser.uid, "sessions");
}

// Upload what only this device has, download what only the cloud has
async function syncAll() {
  const tracker = window.timeTracker;
  if (!tracker || !currentUser) return;
  setStatus("syncing");
  try {
    const col = sessionsCollection();
    const snap = await getDocs(col);
    const cloud = new Map();
    snap.forEach(d => cloud.set(d.id, d.data()));

    const local = new Map(tracker.data.sessions.map(s => [recordId(s), s]));

    const toUpload = [...local].filter(([id, s]) => !cloud.has(id) && isValid(s));
    for (let i = 0; i < toUpload.length; i += 400) {
      const batch = writeBatch(db);
      toUpload.slice(i, i + 400).forEach(([id, s]) => batch.set(doc(col, id), cleanRecord(s)));
      await batch.commit();
    }

    let added = 0;
    cloud.forEach((s, id) => {
      if (!local.has(id)) {
        tracker.data.sessions.push(s);
        added++;
      }
    });
    if (added) {
      tracker.data.sessions.sort((a, b) => a.timestamp - b.timestamp);
      tracker.saveData();
      window.dispatchEvent(new CustomEvent("tolnri:data-synced"));
    }
    setStatus("synced");
  } catch (e) {
    console.error("Cloud sync failed:", e);
    setStatus(navigator.onLine ? "error" : "offline");
  }
}

// Save each new movement to the cloud as soon as it's recorded
function hookTracker() {
  const tracker = window.timeTracker;
  if (!tracker || tracker.__cloudHooked) return;
  tracker.__cloudHooked = true;

  const recordMovement = tracker.recordMovement.bind(tracker);
  tracker.recordMovement = (...args) => {
    const before = tracker.data.sessions.length;
    recordMovement(...args);
    const s = tracker.data.sessions[tracker.data.sessions.length - 1];
    if (currentUser && tracker.data.sessions.length > before && isValid(s)) {
      // If this fails (offline), the next sync uploads it
      setDoc(doc(sessionsCollection(), recordId(s)), cleanRecord(s)).catch(() => setStatus("offline"));
    }
  };

  // Clearing stats while signed in clears the cloud copy too, so it doesn't come back
  const clearAllData = tracker.clearAllData.bind(tracker);
  tracker.clearAllData = () => {
    const ids = tracker.data.sessions.map(recordId);
    clearAllData();
    if (currentUser) deleteCloudRecords(ids);
  };

  // Imported backups get uploaded on the next sync
  const importData = tracker.importData.bind(tracker);
  tracker.importData = (json) => {
    const ok = importData(json);
    if (ok && currentUser) syncAll();
    return ok;
  };
}

async function deleteCloudRecords(localIds) {
  try {
    const col = sessionsCollection();
    const snap = await getDocs(col);
    const ids = new Set(localIds);
    snap.forEach(d => ids.add(d.id));
    const all = [...ids];
    for (let i = 0; i < all.length; i += 400) {
      const batch = writeBatch(db);
      all.slice(i, i + 400).forEach(id => batch.delete(doc(col, id)));
      await batch.commit();
    }
  } catch (e) {
    console.error("Clearing cloud data failed:", e);
  }
}

// -------------------------
// Login button in the bottom menu
// -------------------------

const STATUS_LABELS = {
  signedOut: "🔑 Login",
  syncing: "⏳ Syncing",
  synced: "☁️ Synced",
  offline: "📴 Offline",
  error: "⚠️ Retry"
};

function setStatus(status) {
  if (!loginLink) return;
  loginLink.textContent = STATUS_LABELS[status] || STATUS_LABELS.signedOut;
  loginLink.title = currentUser
    ? `Signed in as ${currentUser.email || "you"}. Tap to sign out.`
    : "Sign in with Google to back up your stats";
}

function addLoginLink() {
  const nav = document.querySelector(".footer-nav");
  if (!nav || nav.querySelector("#footer-login")) return;
  loginLink = document.createElement("a");
  loginLink.href = "#";
  loginLink.id = "footer-login";
  const home = [...nav.querySelectorAll("a")].find(a => /index\.html$/.test(a.getAttribute("href") || ""));
  nav.insertBefore(loginLink, home || null);
  loginLink.addEventListener("click", handleLoginClick);
  setStatus("signedOut");
}

async function handleLoginClick(e) {
  e.preventDefault();
  if (currentUser) {
    if (confirm(`Signed in as ${currentUser.email || "your Google account"}.\n\nYour stats stay on this device either way. Sign out?`)) {
      await signOut(auth);
    } else {
      syncAll();
    }
    return;
  }
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    // Some installed apps block popups: fall back to a full-page sign-in
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(err.code)) {
      await signInWithRedirect(auth, provider);
    } else if (err.code !== "auth/popup-closed-by-user") {
      console.error("Sign-in failed:", err);
      alert("Sign-in didn't work. Please try again.");
    }
  }
}

// -------------------------
// Start
// -------------------------

function start() {
  hookTracker();
  addLoginLink();
  getRedirectResult(auth).catch(() => {});
  onAuthStateChanged(auth, user => {
    currentUser = user;
    if (user) syncAll();
    else setStatus("signedOut");
  });
  window.addEventListener("online", () => { if (currentUser) syncAll(); });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
