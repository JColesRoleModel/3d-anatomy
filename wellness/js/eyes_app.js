// Neuro‑Ocular Activation app script for Neocities
// This script powers the eyes page by loading the ocular SVGs, organising them into
// specific gaze sequences, handling user preferences for duration, rest and rounds,
// and animating a progress bar that fills and empties on alternating gazes.  Do not
// rename any files in InnervationSVGs; simply ensure they exist as listed here.

// Base path to the ocular SVGs.  The files live in the InnervationSVGs directory
// alongside the lower/upper/head region assets.  No trailing slash needed.
const IMAGE_BASE_PATH = "InnervationSVGs/";

// Define the gaze sequences.  Each routine key lists the SVG filename and an
// order value.  The order ensures gazes are presented in the intended sequence.
// Do not change the filenames or their order assignments.
const ROUTINES = {
  FULL: [
    { file: "9_HEIGHT_C_D_IMG.webp", order: 1 },  // Up
    { file: "9_WEST_C_D_IMG.webp", order: 2 },  // Left
    { file: "9_DEPTH_C_D_IMG.webp", order: 3 },  // Down
    { file: "9_EAST_C_D_IMG.webp", order: 4 },  // Right
    { file: "9_HEIGHTWEST_C_D_IMG.webp", order: 5 }, // Up‑Left
    { file: "9_HEIGHTEAST_C_D_IMG.webp", order: 6 }, // Up‑Right
    { file: "9_DEPTHWEST_C_D_IMG.webp", order: 7 }, // Down‑Left
    { file: "9_DEPTHEAST_C_D_IMG.webp", order: 8 }, // Down‑Right
    { file: "9_INWARD_C_D_IMG.webp", order: 9 }   // Inward / Circular
  ],
  CORE: [
    { file: "9_HEIGHT_C_D_IMG.webp", order: 1 }, // Up
    { file: "9_DEPTH_C_D_IMG.webp", order: 2 },  // Down
    { file: "9_WEST_C_D_IMG.webp", order: 3 },  // Left
    { file: "9_EAST_C_D_IMG.webp", order: 4 }   // Right
  ],
  DIAGONAL: [
    { file: "9_HEIGHTWEST_C_D_IMG.webp", order: 1 }, // Up‑Left
    { file: "9_HEIGHTEAST_C_D_IMG.webp", order: 2 }, // Up‑Right
    { file: "9_DEPTHWEST_C_D_IMG.webp", order: 3 }, // Down‑Left
    { file: "9_DEPTHEAST_C_D_IMG.webp", order: 4 }  // Down‑Right
  ],

  // Alertness flow: energises the system with vertical and lateral gazes
  ALERT: [
    { file: "9_HEIGHT_C_D_IMG.webp", order: 1 },      // Up
    { file: "9_WEST_C_D_IMG.webp", order: 2 },      // Left
    { file: "9_EAST_C_D_IMG.webp", order: 3 },      // Right
    { file: "9_HEIGHTEAST_C_D_IMG.webp", order: 4 }, // Up‑Right
    { file: "9_INWARD_C_D_IMG.webp", order: 5 }       // Circular/inward
  ],

  // Grounding flow: settles the nervous system with downward and lateral gazes
  GROUND: [
    { file: "9_DEPTHWEST_C_D_IMG.webp", order: 1 }, // Down‑Left
    { file: "9_DEPTH_C_D_IMG.webp", order: 2 }, // Down
    { file: "9_DEPTHEAST_C_D_IMG.webp", order: 3 }, // Down‑Right
    { file: "9_WEST_C_D_IMG.webp", order: 4 }, // Left
    { file: "9_INWARD_C_D_IMG.webp", order: 5 }  // Circular/inward
  ],

  // Restoring flow: encourages release with downward and circular gazes
  RESTORE: [
    { file: "9_DEPTHWEST_C_D_IMG.webp", order: 1 }, // Down‑Left
    { file: "9_DEPTHEAST_C_D_IMG.webp", order: 2 }, // Down‑Right
    { file: "9_INWARD_C_D_IMG.webp", order: 3 }, // Circular/inward
    { file: "9_INWARD_C_D_IMG.webp", order: 4 }  // Repeat circular for extended unwinding
  ]
};

// Previously each routine card showed an icon in the ocular page.  The user has
// requested that these icons live on the home/landing page only, so the
// ocular page no longer uses ICON_MAP.  We leave this constant empty to
// avoid undefined references in future code.  See index.html for the icons
// displayed in the menu.
const ICON_MAP = {};

// Generate a custom random gaze sequence.  Prompts the user for a number
// between 3 and 9, shuffles all available gaze files and creates a new
// sequence.  This does not overwrite the built‑in routines; instead it
// presents a one‑off sequence under the "Custom Random" label.
function handleCustomSequence() {
  // Collect all unique gaze filenames from the defined routines
  const allFiles = Array.from(new Set([].concat(...Object.values(ROUTINES).map(arr => arr.map(m => m.file)))));
  // Determine the maximum number of gazes (cap at 9 since there are only 9 unique positions)
  const maxAllowed = Math.min(9, allFiles.length);
  let num = parseInt(prompt(`Enter number of gazes for a custom random sequence (3–${maxAllowed})`, "5"), 10);
  if (isNaN(num) || num < 3) num = 3;
  if (num > maxAllowed) num = maxAllowed;
  // Shuffle and pick the requested number of gazes
  const shuffled = allFiles.sort(() => Math.random() - 0.5);
  const selectedFiles = shuffled.slice(0, num);
  // Build movement objects with sequential order
  selectedRoutineKey = "CUSTOM";
  selectedRoutineMovements = selectedFiles.map((file, idx) => ({ file: file, order: idx + 1 }));
  // Update preference labels and preview
  qs("#prefs-title").textContent = "Custom Random";
  qs("#prefs-tagline").textContent = "Set your gaze duration and rest.";
  qs("#prefs-preview-label").textContent = "Custom Random";
  const strip = qs("#prefs-preview-strip");
  strip.innerHTML = "";
  selectedRoutineMovements.forEach(m => {
    const d = document.createElement("div");
    d.className = "preview-thumb";
    const img = document.createElement("img");
    img.dataset.src = IMAGE_BASE_PATH + m.file;
    img.alt = movementLabelFromFile("CUSTOM", m.file);
    d.appendChild(img);
    strip.appendChild(d);
    if (lazyLoader) lazyLoader.observe(img);
  });
  // Show preferences screen for this custom sequence
  switchScreen("screen-prefs");
}

// Map filenames to human‑friendly labels with emojis.  This allows the app to
// display clear gaze directions on the player screen.
const FILE_TO_LABEL = {
  // Height (vertical): subject looks up → Height
  "9_HEIGHT_C_D_IMG.webp": "Height (Up) ⬆️",
  // Depth: subject looks down
  "9_DEPTH_C_D_IMG.webp": "Depth (Down) ⬇️",
  // West: subject's right (viewer sees left)
  "9_WEST_C_D_IMG.webp": "West (Right) ➡️",
  // East: subject's left (viewer sees right)
  "9_EAST_C_D_IMG.webp": "East (Left) ⬅️",
  // Diagonals: combine height/depth with west/east
  "9_HEIGHTWEST_C_D_IMG.webp": "Height‑West (Up‑Right) ↗️",
  "9_HEIGHTEAST_C_D_IMG.webp": "Height‑East (Up‑Left) ↖️",
  "9_DEPTHWEST_C_D_IMG.webp": "Depth‑West (Down‑Right) ↘️",
  "9_DEPTHEAST_C_D_IMG.webp": "Depth‑East (Down‑Left) ↙️",
  // Circular/inward tracking
  "9_INWARD_C_D_IMG.webp": "Inward (Circular) 🎯"
};

// State variables for managing the sequence and timers
let selectedRoutineKey = null;
let selectedRoutineMovements = [];
let prefs = {
  secondsPerMovement: 45,
  restBetween: 3,
  rounds: 2
};
let isRunning = false;
let movementTimerId = null;
let currentMovementIndex = 0;
let currentRound = 1;
let currentPhase = "idle"; // "move", "rest" or "idle"
let secondsRemaining = 0;

// Lazy loading
let lazyLoader = null;

// Audio settings
let audioEnabled = true;
let audioEl; // will be assigned on DOMContentLoaded

// Play the ding sound if enabled
function playDing() {
  if (!audioEnabled || !audioEl) return;
  try {
    audioEl.currentTime = 0;
    audioEl.play();
  } catch (e) {
    // Ignore playback errors (e.g. autoplay restrictions)
  }
}

// Helper functions for DOM access
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

// Switch visible screen
function switchScreen(screenId) {
  qsa(".screen").forEach(s => {
    if (s.id === screenId) s.classList.add("screen-active");
    else s.classList.remove("screen-active");
  });
}

// Pretty names for sequences
function prettyRoutineName(key) {
  if (key === "FULL") return "All 9 Points";
  if (key === "CORE") return "Main 4 Directions";
  if (key === "DIAGONAL") return "Supplemental 4 Angles";
  if (key === "ALERT") return "Alertness Flow";
  if (key === "GROUND") return "Grounding Flow";
  if (key === "RESTORE") return "Restoring Flow";
  return key;
}

// Derive label from filename using the map
function movementLabelFromFile(key, file) {
  return FILE_TO_LABEL[file] || file.replace(/_/g, " ");
}

// Sort movements by order for a routine
function sortedMovementsFor(key) {
  const arr = ROUTINES[key] || [];
  return [...arr].sort((a, b) => a.order - b.order);
}

// Render sequence cards on picker screen
function renderRoutineCards() {
  const container = qs("#routine-list");
  container.innerHTML = "";
  Object.keys(ROUTINES).forEach(key => {
    const moves = sortedMovementsFor(key);
    const card = document.createElement("div");
    card.className = "routine-card";
    card.dataset.key = key;
    // No icons are inserted on the ocular routine picker.  Icons live on the
    // landing page menu instead.  Previously an icon was prepended here if
    // defined in ICON_MAP, but ICON_MAP is now empty per user request.

    // Header
    const header = document.createElement("div");
    header.className = "routine-header-row";
    const title = document.createElement("div");
    title.className = "routine-name";
    title.textContent = prettyRoutineName(key);
    const count = document.createElement("div");
    count.className = "routine-count";
    count.textContent = moves.length + " gazes";
    header.appendChild(title);
    header.appendChild(count);
    card.appendChild(header);
    // Thumbnail strip
    const strip = document.createElement("div");
    strip.className = "thumb-strip";
    moves.forEach(m => {
      const t = document.createElement("div");
      t.className = "thumb";
      const img = document.createElement("img");
      img.dataset.src = IMAGE_BASE_PATH + m.file;
      img.alt = movementLabelFromFile(key, m.file);
      t.appendChild(img);
      strip.appendChild(t);
      if (lazyLoader) lazyLoader.observe(img);
    });
    card.appendChild(strip);
    // Click handler
    card.addEventListener("click", () => {
      handleRoutineSelected(key);
    });
    container.appendChild(card);
  });

  // Add a dedicated card for creating a custom random gaze sequence.  This card
  // allows the user to choose any number of gazes from the full library and
  // generates a one‑off sequence.  It does not replace the built‑in routines.
  const customCard = document.createElement("div");
  customCard.className = "routine-card";
  customCard.dataset.key = "CUSTOM";
  const header = document.createElement("div");
  header.className = "routine-header-row";
  const title = document.createElement("div");
  title.className = "routine-name";
  title.textContent = "Custom Random";
  const countLabel = document.createElement("div");
  countLabel.className = "routine-count";
  countLabel.textContent = "3–9 gazes";
  header.appendChild(title);
  header.appendChild(countLabel);
  customCard.appendChild(header);
  const strip = document.createElement("div");
  strip.className = "thumb-strip";
  // Use a few preview images from the unique file set for visuals
  const previewFiles = Array.from(new Set([].concat(...Object.values(ROUTINES).map(arr => arr.map(m => m.file))))).slice(0, 3);
  previewFiles.forEach(file => {
    const t = document.createElement("div");
    t.className = "thumb";
    const img = document.createElement("img");
    img.dataset.src = IMAGE_BASE_PATH + file;
    img.alt = movementLabelFromFile("CUSTOM", file);
    t.appendChild(img);
    strip.appendChild(t);
    if (lazyLoader) lazyLoader.observe(img);
  });
  customCard.appendChild(strip);
  customCard.addEventListener("click", handleCustomSequence);
  container.appendChild(customCard);
}

// When a user picks a sequence
function handleRoutineSelected(key) {
  selectedRoutineKey = key;
  selectedRoutineMovements = sortedMovementsFor(key);
  // Update preferences preview
  qs("#prefs-title").textContent = prettyRoutineName(key);
  qs("#prefs-tagline").textContent = "Set your gaze duration and rest.";
  qs("#prefs-preview-label").textContent = prettyRoutineName(key);
  const strip = qs("#prefs-preview-strip");
  strip.innerHTML = "";
  selectedRoutineMovements.forEach(m => {
    const d = document.createElement("div");
    d.className = "preview-thumb";
    const img = document.createElement("img");
    img.dataset.src = IMAGE_BASE_PATH + m.file;
    img.alt = movementLabelFromFile(key, m.file);
    d.appendChild(img);
    strip.appendChild(d);
    if (lazyLoader) lazyLoader.observe(img);
  });
  switchScreen("screen-prefs");
}

// Randomly choose a routine
function pickRandomRoutine() {
  // Choose a random defined routine key (FULL, CORE, DIAGONAL, ALERT, GROUND, RESTORE)
  const keys = Object.keys(ROUTINES);
  if (!keys.length) return;
  const key = keys[Math.floor(Math.random() * keys.length)];
  handleRoutineSelected(key);
}

// Collect user preferences and start sequence
function collectPrefsAndStart() {
  const sec = parseInt(qs("#input-seconds").value, 10) || 45;
  const rest = parseInt(qs("#input-rest").value, 10) || 3;
  const rounds = parseInt(qs("#input-rounds").value, 10) || 2;
  prefs.secondsPerMovement = Math.max(5, sec);
  prefs.restBetween = Math.max(0, rest);
  prefs.rounds = Math.max(1, rounds);
  startRoutine();
}

// Set up the player UI
function setupPlayerUI() {
  if (!selectedRoutineKey || !selectedRoutineMovements.length) return;
  qs("#player-title").textContent = prettyRoutineName(selectedRoutineKey);
  qs("#player-tagline").textContent = "Stay curious about what you feel in your eyes, brain and body.";
  qs("#player-preview-label").textContent = prettyRoutineName(selectedRoutineKey);
  const strip = qs("#player-preview-strip");
  strip.innerHTML = "";
  selectedRoutineMovements.forEach(m => {
    const d = document.createElement("div");
    d.className = "preview-thumb";
    const img = document.createElement("img");
    img.dataset.src = IMAGE_BASE_PATH + m.file;
    img.alt = movementLabelFromFile(selectedRoutineKey, m.file);
    d.appendChild(img);
    strip.appendChild(d);
    if (lazyLoader) lazyLoader.observe(img);
  });
  switchScreen("screen-player");
}

// Progress bars
// Main bar: current gaze (green) or rest (blue). Thin bar: whole sequence.
let phaseBar = null;

// Whole sequence = every gaze in every round, plus a rest between gazes (none after the last)
function routineTotalSeconds() {
  const steps = selectedRoutineMovements.length * prefs.rounds;
  return steps * prefs.secondsPerMovement + Math.max(0, steps - 1) * prefs.restBetween;
}

function isLastStep() {
  return currentMovementIndex >= selectedRoutineMovements.length - 1 && currentRound >= prefs.rounds;
}

// Begin the sequence
function startRoutine() {
  stopRoutineTimers();
  setupPlayerUI();
  currentMovementIndex = 0;
  currentRound = 1;
  isRunning = true;
  qs("#btn-play-pause").textContent = "Pause";
  qs("#status-message").textContent = "";
  if (phaseBar) {
    phaseBar.reset();
    phaseBar.setTotal(routineTotalSeconds());
  }
  // Start time tracking
  if (window.timeTracker) {
    window.timeTracker.startSession('Neuro-Ocular Activation', selectedRoutineKey);
  }
  startPhase("move");
}

// Clear existing timers
function stopRoutineTimers() {
  if (movementTimerId) {
    clearInterval(movementTimerId);
    movementTimerId = null;
  }
}

// Start a phase: move or rest. With resume = true, carry on with the time that was left.
function startPhase(phase, resume = false) {
  currentPhase = phase;
  if (resume) {
    if (phaseBar) phaseBar.resume();
  } else {
    secondsRemaining = phase === "move" ? prefs.secondsPerMovement : prefs.restBetween;
    if (phaseBar) phaseBar.startPhase(phase, secondsRemaining);
  }
  updateMovementUI();
  if (window.timeTracker && phase === "move") {
    const move = selectedRoutineMovements[currentMovementIndex];
    if (resume) window.timeTracker.resumeMovement();
    else if (move) window.timeTracker.beginMovement(movementLabelFromFile(selectedRoutineKey, move.file), prefs.secondsPerMovement);
  }
  if (movementTimerId) clearInterval(movementTimerId);
  if (!isRunning) return;
  if (secondsRemaining <= 0) {
    handlePhaseComplete();
    return;
  }
  movementTimerId = setInterval(() => {
    if (!isRunning) return;
    secondsRemaining--;
    if (secondsRemaining <= 0) {
      clearInterval(movementTimerId);
      movementTimerId = null;
      handlePhaseComplete();
    } else {
      updatePhaseLabel();
    }
  }, 1000);
}

// When a phase completes
function handlePhaseComplete() {
  // When a movement or rest phase completes
  playDing();

  // Keep the time actually spent on the movement that just ended
  if (currentPhase === "move" && window.timeTracker) window.timeTracker.endMovement();

  if (currentPhase === "move" && prefs.restBetween > 0 && !isLastStep()) {
    // Move to rest phase
    startPhase("rest");
  } else {
    // Move to next movement
    advanceMovement();
  }
}

// Advance to next gaze or next round
function advanceMovement() {
  currentMovementIndex++;
  if (currentMovementIndex >= selectedRoutineMovements.length) {
    currentRound++;
    if (currentRound > prefs.rounds) {
      finishRoutine();
      return;
    }
    currentMovementIndex = 0;
  }
  startPhase("move");
}

// Finish the entire sequence
function finishRoutine() {
  isRunning = false;
  stopRoutineTimers();
  currentPhase = "idle";
  if (phaseBar) phaseBar.finish();
  qs("#btn-play-pause").textContent = "Restart";
  qs("#phase-label").textContent = "Complete";
  qs("#status-message").textContent = "Sequence complete. Notice how your vision and mind feel.";
  // Final ding when routine ends
  playDing();
  // Stop time tracking and show summary
  if (window.timeTracker) {
    window.timeTracker.stopSession();
    const sessionTime = window.timeTracker.getLastSessionDuration();
    if (window.TimeStatsUI) {
      setTimeout(() => {
        TimeStatsUI.showQuickSummary('Neuro-Ocular Activation', sessionTime);
      }, 500);
    }
  }
}

// Update the UI for the current gaze and phase
function updateMovementUI() {
  const move = selectedRoutineMovements[currentMovementIndex];
  if (!move) return;
  const label = movementLabelFromFile(selectedRoutineKey, move.file);
  qs("#current-movement-label").textContent = label;
  const img = qs("#current-movement-image");
  img.src = IMAGE_BASE_PATH + move.file;
  img.alt = label;
  qs("#movement-count").textContent = `Gaze ${currentMovementIndex + 1} of ${selectedRoutineMovements.length}`;
  qs("#round-count").textContent = `Round ${currentRound} of ${prefs.rounds}`;
  // No time tracking here - we record when movement completes in handlePhaseComplete
  updatePhaseLabel();
}

// Update the phase label (move/rest/ready)
function updatePhaseLabel() {
  let txt = "";
  if (currentPhase === "move") {
    txt = `Gaze • ${secondsRemaining}s`;
  } else if (currentPhase === "rest") {
    txt = `Rest • ${secondsRemaining}s`;
  } else {
    txt = "Ready";
  }
  qs("#phase-label").textContent = txt;
}

// Play/pause control
function togglePlayPause() {
  if (!selectedRoutineMovements.length) return;
  if (!isRunning && currentPhase === "idle") {
    startRoutine();
    return;
  }
  if (isRunning) {
    isRunning = false;
    if (movementTimerId) {
      clearInterval(movementTimerId);
      movementTimerId = null;
    }
    qs("#btn-play-pause").textContent = "Resume";
    if (phaseBar) phaseBar.pause();
    if (window.timeTracker) window.timeTracker.pauseMovement();
  } else {
    isRunning = true;
    qs("#btn-play-pause").textContent = "Pause";
    // Continue the current phase from where it was paused
    qs("#status-message").textContent = "";
    startPhase(currentPhase || "move", true);
  }
}

// Restart control
// Stop part-way through: the time done so far is kept, and shown
function stopRoutine() {
  stopRoutineTimers();
  isRunning = false;
  currentPhase = "idle";
  if (phaseBar) phaseBar.reset();
  qs("#btn-play-pause").textContent = "Start";
  qs("#phase-label").textContent = "Ready";
  qs("#status-message").textContent = "";
  if (window.timeTracker && window.timeTracker.sessionStartTime) {
    window.timeTracker.stopSession();
    const sessionTime = window.timeTracker.getLastSessionDuration();
    if (sessionTime > 0 && window.TimeStatsUI) TimeStatsUI.showQuickSummary('Neuro-Ocular Activation', sessionTime);
  }
}

// Leaving the page pauses the routine, so time away is never counted
window.addEventListener("practice:away", () => {
  if (!isRunning) return;
  togglePlayPause();
  qs("#status-message").textContent = "Paused while you were away. Press Resume to carry on.";
});

function restartRoutine() {
  if (!selectedRoutineMovements.length) return;
  startRoutine();
}

// Initialise back button behaviour
function initBackButtons() {
  qsa(".back-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.back;
      if (!target) return;
      if (btn.closest("#screen-player")) stopRoutine();
      switchScreen(target);
    });
  });
}

// DOM ready initialisation
document.addEventListener("DOMContentLoaded", () => {
  // Initialize lazy image loader
  lazyLoader = new LazyImageLoader({ rootMargin: '100px' });
  phaseBar = new PhaseBar(document.getElementById("prog"));

  renderRoutineCards();
  initBackButtons();
  qs("#btn-stop").addEventListener("click", stopRoutine);
  qs("#btn-random").addEventListener("click", pickRandomRoutine);
  qs("#btn-start-routine").addEventListener("click", collectPrefsAndStart);
  qs("#btn-play-pause").addEventListener("click", togglePlayPause);
  qs("#btn-restart").addEventListener("click", restartRoutine);

  // Audio control setup: assign the audio element and toggle
  audioEl = document.getElementById("audio-ding");
  const audioToggle = document.getElementById("ocular-audio-toggle");
  if (audioToggle) {
    audioToggle.addEventListener("click", () => {
      // Toggle on/off
      audioEnabled = !audioEnabled;
      // Update dataset and label
      audioToggle.dataset.on = audioEnabled ? "1" : "0";
      const labelSpan = audioToggle.querySelector(".pill-label");
      if (labelSpan) labelSpan.textContent = audioEnabled ? "On" : "Off";
    });
  }

  // If a routine is specified in the query string, automatically select and
  // display it.  The parameter name is "routine" and should correspond to a
  // key in the ROUTINES object (case‑insensitive).  For example,
  // eyes.html?routine=alert will select the Alert sequence.  This does not
  // trigger start immediately; it simply preselects the sequence and shows
  // the preferences screen.
  const params = new URLSearchParams(window.location.search);
  if (params.has("routine")) {
    const r = params.get("routine");
    if (r) {
      const key = r.toUpperCase();
      if (ROUTINES[key]) {
        handleRoutineSelected(key);
      }
    }
  }

  // Stats button handler
  const statsBtn = document.getElementById('stats-btn');
  if (statsBtn && window.timeStatsUI) {
    statsBtn.addEventListener('click', () => {
      window.timeStatsUI.open();
    });
  }
});
