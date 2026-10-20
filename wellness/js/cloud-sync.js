// Cloud backup for practice history, in the same account as the rest of the site (the account button in the top
// menu). Stats always save on the device first. Signed in, every record is also kept in the account, so it survives
// a lost, broken or reset phone and follows you between devices.

const hub = await waitForHub();
const account = hub.account;
let uid = null;

function waitForHub() {
  return new Promise((resolve) => {
    if (window.tolnriHub) return resolve(window.tolnriHub);
    const t = setInterval(() => { if (window.tolnriHub) { clearInterval(t); resolve(window.tolnriHub); } }, 50);
  });
}

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

const STATUS = {
  syncing: "Practice history: syncing…",
  synced: "Practice history is kept in your account.",
  offline: "Practice history: offline, it will sync when you're back online.",
  error: "Practice history couldn't sync yet.",
};
const setStatus = (s, detail = "") => hub.setStatus("practice", uid ? STATUS[s] + (detail ? ` (${detail})` : "") : "");

// Upload what only this device has, download what only the cloud has
async function syncAll() {
  const tracker = window.timeTracker;
  if (!tracker || !uid) return;
  const me = uid;
  setStatus("syncing");
  try {
    const cloud = new Map(await account.listSessions(me));
    if (uid !== me) return;
    const local = new Map(tracker.data.sessions.map(s => [recordId(s), s]));
    const toUpload = [...local].filter(([id, s]) => !cloud.has(id) && isValid(s)).map(([id, s]) => [id, cleanRecord(s)]);
    if (toUpload.length) await account.putSessions(me, toUpload);

    let added = 0;
    cloud.forEach((s, id) => {
      if (!local.has(id)) { tracker.data.sessions.push(s); added++; }
    });
    if (added) {
      tracker.data.sessions.sort((a, b) => a.timestamp - b.timestamp);
      tracker.saveData();
      window.dispatchEvent(new CustomEvent("tolnri:data-synced"));
    }
    setStatus("synced");
  } catch (e) {
    console.error("Cloud sync failed:", e);
    setStatus(navigator.onLine ? "error" : "offline", navigator.onLine ? account.message(e) : "");
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
    if (uid && tracker.data.sessions.length > before && isValid(s)) {
      // If this fails (offline), the next sync uploads it
      account.putSession(uid, recordId(s), cleanRecord(s)).catch(() => setStatus("offline"));
    }
  };

  // Clearing stats while signed in clears the cloud copy too, so it doesn't come back
  const clearAllData = tracker.clearAllData.bind(tracker);
  tracker.clearAllData = () => {
    const ids = tracker.data.sessions.map(recordId);
    clearAllData();
    if (uid) deleteCloudRecords(uid, ids);
  };

  // Imported backups get uploaded on the next sync
  const importData = tracker.importData.bind(tracker);
  tracker.importData = (json) => {
    const ok = importData(json);
    if (ok && uid) syncAll();
    return ok;
  };
}

async function deleteCloudRecords(me, localIds) {
  try {
    const ids = new Set(localIds);
    for (const [id] of await account.listSessions(me)) ids.add(id);
    await account.deleteSessions(me, [...ids]);
  } catch (e) {
    console.error("Clearing cloud data failed:", e);
  }
}

hookTracker();
hub.onUser((u) => {
  uid = u ? u.uid : null;
  if (uid) syncAll(); else setStatus("synced");
});
window.addEventListener("online", () => { if (uid) syncAll(); });
