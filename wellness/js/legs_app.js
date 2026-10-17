// Lower Body Innervation app script for Neocities
// This script powers the legs page by loading the Innervation SVGs, organising them into routines,
// handling user preferences for duration, rest and rounds, and animating a progress bar
// that fills and empties on alternating movements.

// CONFIGURE IMAGE PATH
// The SVGs live in the InnervationSVGs folder at the site root.  Do not rename files or
// directories; simply ensure this constant points to the folder containing the individual
// movement SVGs.  Each file listed in ROUTINES must exist in this folder.
const IMAGE_BASE_PATH = "InnervationSVGs/";

// ROUTINES definition.  Each routine key lists the SVG filename and an order value.  The
// order ensures movements are presented in the correct sequence.  Do not change file names.
const ROUTINES = {
  FEET: [
    { file: "1_FEET_MIDCROSSRIGHT_D_IMG.webp", order: 1 },
    { file: "1_FEET_MIDCROSSLEFT_D_IMG.webp", order: 2 },
    { file: "1_FEET_SIDECROSSRIGHT_D_IMG.webp", order: 3 },
    { file: "1_FEET_SIDECROSSLEFT_D_IMG.webp", order: 4 },
    { file: "1_FEET_BACKRIGHT_D_IMG.webp", order: 5 },
    { file: "1_FEET_BACKLEFT_D_IMG.webp", order: 6 },
    { file: "1_FEET_OUTRIGHT_D_IMG.webp", order: 7 },
    { file: "1_FEET_OUTLEFT_D_IMG.webp", order: 8 }
  ],
  GROUNDING: [
    { file: "1_GROUNDING_FORWARD_D_IMG.webp", order: 1 },
    { file: "1_GROUNDING_OUT_D_IMG.webp", order: 2 },
    { file: "1_GROUNDING_IN_D_IMG.webp", order: 3 },
    { file: "1_GROUNDING_CROSSLEFT_D_IMG.webp", order: 4 },
    { file: "1_GROUNDING_CROSSRIGHT_D_IMG.webp", order: 5 }
  ],
  HIPS1: [
    { file: "1_HIPS1_LEFTFRONTIN_D_IMG.webp", order: 1 },
    { file: "1_HIPS1_LEFTFRONTOUT_D_IMG.webp", order: 2 },
    { file: "1_HIPS1_LEFTMIDIN_D_IMG.webp", order: 3 },
    { file: "1_HIPS1_LEFTMIDOUT_D_IMG.webp", order: 4 },
    { file: "1_HIPS1_LEFTREARIN_D_IMG.webp", order: 5 },
    { file: "1_HIPS1_LEFTREAROUT_D_IMG.webp", order: 6 },
    { file: "1_HIPS1_RIGHTFRONTIN_D_IMG.webp", order: 7 },
    { file: "1_HIPS1_RIGHTFRONTOUT_D_IMG.webp", order: 8 },
    { file: "1_HIPS1_RIGHTMIDIN_D_IMG.webp", order: 9 },
    { file: "1_HIPS1_RIGHTMIDOUT_D_IMG.webp", order: 10 },
    { file: "1_HIPS1_RIGHTREARIN_D_IMG.webp", order: 11 },
    { file: "1_HIPS1_RIGHTREAROUT_D_IMG.webp", order: 12 }
  ],
  HIPS2: [
    { file: "1_HIPS2_PLANKOPPOSITELEFTFRONT_D_IMG.webp", order: 1 },
    { file: "1_HIPS2_PLANKSAMELEFTFRONT_D_IMG.webp", order: 2 },
    { file: "1_HIPS2_PLANKSAMERIGHTFRONT_D_IMG.webp", order: 3 },
    { file: "1_HIPS2_PLANKOPPOSITERIGHTFRONT_D_IMG.webp", order: 4 },
    { file: "1_HIPS2_STAGGEROPPOSITERIGHTFRONT_D_IMG.webp", order: 5 },
    { file: "1_HIPS2_STAGGEROPPOSITELEFTFRONT_D_IMG.webp", order: 6 },
    { file: "1_HIPS2_STAGGERSAMELEFTFRONT_D_IMG.webp", order: 7 },
    { file: "1_HIPS2_STAGGERSAMERIGHTFRONT_D_IMG.webp", order: 8 }
  ]
};

// State variables
let selectedRoutineKey = null;
let selectedRoutineMovements = [];
let prefs = {
  secondsPerMovement: 45,
  restBetween: 3, // default rest between movements (3 seconds)
  rounds: 2
};

let isRunning = false;
let movementTimerId = null;
let currentMovementIndex = 0;
let currentRound = 1;
let currentPhase = "idle"; // possible values: "move", "rest", "idle"
let secondsRemaining = 0;

// Lazy loading
let lazyLoader = null;

// Audio settings
let audioEnabled = true;
let audioEl; // assigned on DOMContentLoaded

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

// DOM helpers
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

// Switch screen visibility based on id
function switchScreen(screenId) {
  qsa(".screen").forEach(s => {
    if (s.id === screenId) s.classList.add("screen-active");
    else s.classList.remove("screen-active");
  });
}

// Pretty names for routines
function prettyRoutineName(key) {
  if (key === "FEET") return "FEET / SHINS";
  if (key === "GROUNDING") return "GROUNDING";
  if (key === "HIPS1") return "HIPS I";
  if (key === "HIPS2") return "HIPS II";
  return key;
}

// Derive human-friendly movement label from filename
function movementLabelFromFile(key, file) {
  const base = file.replace(/\.(svg|webp)$/, "");
  const parts = base.split("_");
  const routinePart = parts[1] || key;
  const movePart = parts[2] || "";
  const label = (routinePart + " " + movePart)
    .toLowerCase()
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return label;
}

// Sort movements by order for a given routine key
function sortedMovementsFor(key) {
  const arr = ROUTINES[key] || [];
  return [...arr].sort((a, b) => a.order - b.order);
}

// Generate a random custom sequence of movements based on user input.
// Prompts the user for a number between 3 and 12, shuffles all available
// movement files across all routines, and creates a new sequence.  The
// preview is updated and the preferences screen is shown.
function handleCustomSequence() {
  // Gather all unique movement filenames from the ROUTINES definitions
  const allMoves = Array.from(new Set([].concat(...Object.values(ROUTINES).map(arr => arr.map(m => m.file)))));
  // Determine maximum allowed (cap at 12 for UX)
  const maxAllowed = Math.min(12, allMoves.length);
  let num = parseInt(prompt(`Enter number of movements for a custom random routine (3–${maxAllowed})`, "5"), 10);
  if (isNaN(num) || num < 3) num = 3;
  if (num > maxAllowed) num = maxAllowed;
  // Shuffle the list and select the requested number
  const shuffled = allMoves.sort(() => Math.random() - 0.5);
  const selectedFiles = shuffled.slice(0, num);
  // Build movement objects with sequential order
  selectedRoutineKey = "CUSTOM";
  selectedRoutineMovements = selectedFiles.map((file, idx) => ({ file: file, order: idx + 1 }));
  // Update preview labels
  qs("#prefs-title").textContent = "Custom Random";
  qs("#prefs-tagline").textContent = "Set your preferred timing, then begin.";
  qs("#prefs-preview-label").textContent = "Custom Random";
  const strip = qs("#prefs-preview-strip");
  strip.innerHTML = "";
  selectedRoutineMovements.forEach(m => {
    const d = document.createElement("div");
    d.className = "preview-thumb";
    const img = document.createElement("img");
    img.src = IMAGE_BASE_PATH + m.file;
    img.alt = movementLabelFromFile("CUSTOM", m.file);
    d.appendChild(img);
    strip.appendChild(d);
  });
  switchScreen("screen-prefs");
}

// Render cards for each routine on the picker screen
function renderRoutineCards() {
  const container = qs("#routine-list");
  container.innerHTML = "";
  Object.keys(ROUTINES).forEach(key => {
    const moves = sortedMovementsFor(key);
    const card = document.createElement("div");
    card.className = "routine-card";
    card.dataset.key = key;

    const header = document.createElement("div");
    header.className = "routine-header-row";

    const title = document.createElement("div");
    title.className = "routine-name";
    title.textContent = prettyRoutineName(key);

    const count = document.createElement("div");
    count.className = "routine-count";
    count.textContent = moves.length + " movements";

    header.appendChild(title);
    header.appendChild(count);
    card.appendChild(header);

    const strip = document.createElement("div");
    strip.className = "thumb-strip";
    moves.forEach(m => {
      const t = document.createElement("div");
      t.className = "thumb";
      const img = document.createElement('img');
      img.dataset.src = IMAGE_BASE_PATH + m.file;
      img.alt = movementLabelFromFile(key, m.file);
      t.appendChild(img);
      strip.appendChild(t);
      if (lazyLoader) lazyLoader.observe(img);
    });
    card.appendChild(strip);

    card.addEventListener("click", () => {
      handleRoutineSelected(key);
    });

    container.appendChild(card);
  });

  // Add a dedicated card for creating a custom random sequence.  This card
  // allows the user to choose any number of movements and generates a random
  // sequence from the entire lower body library.
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
  countLabel.textContent = "3–12 movements";
  header.appendChild(title);
  header.appendChild(countLabel);
  customCard.appendChild(header);
  const strip = document.createElement("div");
  strip.className = "thumb-strip";
  // Populate with a few preview images from the full set
  const previewFiles = Array.from(new Set([].concat(...Object.values(ROUTINES).map(arr => arr.map(m => m.file))))).slice(0, 3);
  previewFiles.forEach(file => {
    const t = document.createElement("div");
    t.className = "thumb";
    const img = document.createElement('img');
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

// Handle clicking a routine card
function handleRoutineSelected(key) {
  selectedRoutineKey = key;
  selectedRoutineMovements = sortedMovementsFor(key);

  // Update preview for preferences screen
  qs("#prefs-title").textContent = prettyRoutineName(key);
  qs("#prefs-tagline").textContent = "Set your preferred timing, then begin.";
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

// Random routine selection
function pickRandomRoutine() {
  // Choose a random existing routine key (FEET, GROUNDING, HIPS1, HIPS2)
  const keys = Object.keys(ROUTINES);
  if (!keys.length) return;
  const key = keys[Math.floor(Math.random() * keys.length)];
  handleRoutineSelected(key);
}

// Collect preferences from inputs and start the routine
function collectPrefsAndStart() {
  const sec = parseInt(qs("#input-seconds").value, 10) || 45;
  const rest = parseInt(qs("#input-rest").value, 10) || 3;
  const rounds = parseInt(qs("#input-rounds").value, 10) || 2;

  prefs.secondsPerMovement = Math.max(5, sec);
  prefs.restBetween = Math.max(0, rest);
  prefs.rounds = Math.max(1, rounds);

  startRoutine();
}

// Initialise the player UI
function setupPlayerUI() {
  if (!selectedRoutineKey || !selectedRoutineMovements.length) return;
  qs("#player-title").textContent = prettyRoutineName(selectedRoutineKey);
  qs("#player-tagline").textContent = "Stay curious about what you feel in the feet, hips and spine.";
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

// -------------------------
// Progress bar animation logic
// -------------------------
// Main bar: current move (green) or transition (blue). Thin bar: whole routine.
let phaseBar = null;

// Whole routine = every move in every round, plus a transition between moves (none after the last)
function routineTotalSeconds() {
  const steps = selectedRoutineMovements.length * prefs.rounds;
  return steps * prefs.secondsPerMovement + Math.max(0, steps - 1) * prefs.restBetween;
}

function isLastStep() {
  return currentMovementIndex >= selectedRoutineMovements.length - 1 && currentRound >= prefs.rounds;
}

// -------------------------
// Routine lifecycle
// -------------------------
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
    window.timeTracker.startSession('Lower Body Innervation', selectedRoutineKey);
  }
  startPhase("move");
}

// Stop any existing timers
function stopRoutineTimers() {
  if (movementTimerId) {
    clearInterval(movementTimerId);
    movementTimerId = null;
  }
}

// Start a phase: 'move' or 'rest'. With resume = true, carry on with the time that was left.
function startPhase(phase, resume = false) {
  currentPhase = phase;
  if (resume) {
    if (phaseBar) phaseBar.resume();
  } else {
    secondsRemaining = phase === "move" ? prefs.secondsPerMovement : prefs.restBetween;
    if (phaseBar) phaseBar.startPhase(phase, secondsRemaining);
  }
  updateMovementUI();
  // Manage timers
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

// When a phase ends
function handlePhaseComplete() {
  // Record movement that just completed
  if (currentPhase === "move" && window.timeTracker) {
    const move = selectedRoutineMovements[currentMovementIndex];
    if (move) {
      const label = movementLabelFromFile(selectedRoutineKey, move.file);
      window.timeTracker.recordMovement(label, prefs.secondsPerMovement);
    }
  }
  // Play ding at the end of every phase
  playDing();
  if (currentPhase === "move" && prefs.restBetween > 0 && !isLastStep()) {
    startPhase("rest");
  } else {
    advanceMovement();
  }
}

// Move to the next movement or next round
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

// Complete routine
function finishRoutine() {
  isRunning = false;
  stopRoutineTimers();
  currentPhase = "idle";
  if (phaseBar) phaseBar.finish();
  qs("#btn-play-pause").textContent = "Restart";
  qs("#phase-label").textContent = "Complete";
  qs("#status-message").textContent = "Routine complete. Notice how your lower body feels.";
  // Final ding when routine finishes
  playDing();
  // Stop time tracking and show summary
  if (window.timeTracker) {
    window.timeTracker.stopSession();
    const sessionTime = window.timeTracker.getLastSessionDuration();
    if (window.TimeStatsUI) {
      setTimeout(() => {
        TimeStatsUI.showQuickSummary('Lower Body Innervation', sessionTime);
      }, 500);
    }
  }
}

// UI update for current movement and phase
function updateMovementUI() {
  const move = selectedRoutineMovements[currentMovementIndex];
  if (!move) return;
  const label = movementLabelFromFile(selectedRoutineKey, move.file);
  qs("#current-movement-label").textContent = label;
  const img = qs("#current-movement-image");
  // Load current movement image immediately (not lazy)
  img.src = IMAGE_BASE_PATH + move.file;
  img.alt = label;
  qs("#movement-count").textContent = `Movement ${currentMovementIndex + 1} of ${selectedRoutineMovements.length}`;
  qs("#round-count").textContent = `Round ${currentRound} of ${prefs.rounds}`;
  // Time tracking happens when movement completes
  updatePhaseLabel();
}

function updatePhaseLabel() {
  let txt = "";
  if (currentPhase === "move") {
    txt = `Move · ${secondsRemaining}s`;
  } else if (currentPhase === "rest") {
    txt = `Transition · ${secondsRemaining}s`;
  } else {
    txt = "Ready";
  }
  qs("#phase-label").textContent = txt;
}

// Play/pause toggle
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
  } else {
    isRunning = true;
    qs("#btn-play-pause").textContent = "Pause";
    // Continue the current phase from where it was paused
    startPhase(currentPhase || "move", true);
  }
}

// Restart the routine from the beginning
function restartRoutine() {
  if (!selectedRoutineMovements.length) return;
  startRoutine();
}

// Initialise back buttons for navigation
function initBackButtons() {
  qsa(".back-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.back;
      if (!target) return;
      if (btn.closest("#screen-player")) {
        // Stop timers when leaving player
        stopRoutineTimers();
        isRunning = false;
        qs("#btn-play-pause").textContent = "Start";
        currentPhase = "idle";
        if (phaseBar) phaseBar.reset();
        qs("#phase-label").textContent = "Ready";
      }
      switchScreen(target);
    });
  });
}

// DOMContentLoaded initialisation
document.addEventListener("DOMContentLoaded", () => {
  // Initialize lazy image loader
  lazyLoader = new LazyImageLoader({ rootMargin: '100px' });
  phaseBar = new PhaseBar(document.getElementById("prog"));

  // If a routine query parameter is present in the URL, automatically load that routine
  const params = new URLSearchParams(window.location.search);
  const routineParam = params.get("routine");
  if (routineParam) {
    const upperKey = routineParam.toUpperCase();
    if (ROUTINES[upperKey]) {
      // Preselect the routine on load.  This mimics clicking its card and brings up the preferences screen.
      handleRoutineSelected(upperKey);
    }
  }
  renderRoutineCards();
  initBackButtons();
  qs("#btn-random").addEventListener("click", pickRandomRoutine);
  qs("#btn-start-routine").addEventListener("click", collectPrefsAndStart);
  qs("#btn-play-pause").addEventListener("click", togglePlayPause);
  qs("#btn-restart").addEventListener("click", restartRoutine);

  // Stats button handler
  const statsBtn = document.getElementById('stats-btn');
  if (statsBtn && window.timeStatsUI) {
    statsBtn.addEventListener('click', () => {
      window.timeStatsUI.open();
    });
  }

  // Set up audio element and toggle control
  audioEl = document.getElementById("audio-ding");
  const audioToggle = document.getElementById("legs-audio-toggle");
  if (audioToggle) {
    audioToggle.addEventListener("click", () => {
      audioEnabled = !audioEnabled;
      audioToggle.dataset.on = audioEnabled ? "1" : "0";
      const labelSpan = audioToggle.querySelector(".pill-label");
      if (labelSpan) labelSpan.textContent = audioEnabled ? "On" : "Off";
    });
  }
});
