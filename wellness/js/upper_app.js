// Upper Body Innervation app script
// This script powers the upper body page by loading the Innervation SVGs,
// organising them into routines, handling user preferences for duration,
// rest and rounds, and animating a progress bar that fills and empties on
// alternating movements.

// CONFIGURE IMAGE PATH
// The SVGs reside in the InnervationSVGs directory at the site root.
// Do not rename files or directories; simply ensure this constant points
// to the folder containing the individual movement SVGs.
const IMAGE_BASE_PATH = "InnervationSVGs/";

// Upper body routines definition.  Each routine key lists the SVG filename
// and an order value.  The order ensures movements are presented in the
// correct sequence.  Do not change filenames or orders.
const ROUTINES = {
  // Palms together (clasp) – renamed for clarity
  PALMSTOGETHER: [
    { file: "2_CLASPMID_LEFT_D_IMG.webp", order: 1 },
    { file: "2_CLASPMID_RIGHT_D_IMG.webp", order: 4 },
    { file: "2_CLASPUP_LEFT_D_IMG.webp", order: 3 },
    { file: "2_CLASPUP_RIGHT_D_IMG.webp", order: 6 },
    { file: "2_CLASPDOWN_LEFT_D_IMG.webp", order: 2 },
    { file: "2_CLASPDOWN_RIGHT_D_IMG.webp", order: 5 }
  ],
  PALMIN: [
    { file: "2_PALMIN_UP_D_IMG.webp", order: 1 },
    { file: "2_PALMIN_IN_D_IMG.webp", order: 2 },
    { file: "2_PALMIN_DOWN_D_IMG.webp", order: 3 },
    { file: "2_PALMIN_OUT_D_IMG.webp", order: 4 }
  ],
  PALMOPEN: [
    { file: "2_PALMOPEN_UP_D_IMG.webp", order: 1 },
    { file: "2_PALMOPEN_IN_D_IMG.webp", order: 2 },
    { file: "2_PALMOPEN_DOWN_D_IMG.webp", order: 3 },
    { file: "2_PALMOPEN_OUT_D_IMG.webp", order: 4 }
  ],
  PALMOUT: [
    { file: "2_PALMOUT_DOWN_D_IMG.webp", order: 1 },
    { file: "2_PALMOUT_OUT_D_IMG.webp", order: 2 },
    { file: "2_PALMOUT_UP_D_IMG.webp", order: 3 },
    { file: "2_PALMOUT_IN_D_IMG.webp", order: 4 }
  ],
  PALMCLOSED: [
    { file: "2_PALMCLOSED_UP_D_IMG.webp", order: 1 },
    { file: "2_PALMCLOSED_IN_D_IMG.webp", order: 2 },
    { file: "2_PALMCLOSED_DOWN_D_IMG.webp", order: 3 },
    { file: "2_PALMCLOSED_OUT_D_IMG.webp", order: 4 }
  ],
  HEARTOPEN: [
    { file: "2_HEARTOPEN_RIGHT_D_IMG.webp", order: 1 },
    { file: "2_HEARTOPEN_LEFT_D_IMG.webp", order: 2 },
    { file: "2_HEARTOPEN_BOTH_D_IMG.webp", order: 3 }
  ],
  HEARTPROTECTED: [
    { file: "2_HEARTPROTECTED_RIGHT_D_IMG.webp", order: 1 },
    { file: "2_HEARTPROTECTED_LEFT_D_IMG.webp", order: 2 },
    { file: "2_HEARTPROTECTED_BOTH_D_IMG.webp", order: 3 }
  ],
  SCAPULA: [
    { file: "2_SCAPULA_RIGHT_D_IMG.webp", order: 1 },
    { file: "2_SCAPULA_LEFT_D_IMG.webp", order: 2 },
    { file: "2_SCAPULA_BOTH_D_IMG.webp", order: 3 }
  ],
  // Cross – Open Palm sequences (five directions)
  CROSSOPENBACKWARD: [
    { file: "2_CROSSPALM_BACKWARD_0_IMG.webp", order: 1 },
    { file: "2_CROSSPALM_BACKWARD_45L_IMG.webp", order: 2 },
    { file: "2_CROSSPALM_BACKWARD_90L_IMG.webp", order: 3 },
    { file: "2_CROSSPALM_BACKWARD_135L_IMG.webp", order: 4 },
    { file: "2_CROSSPALM_BACKWARD_45R_IMG.webp", order: 5 },
    { file: "2_CROSSPALM_BACKWARD_90R_IMG.webp", order: 6 },
    { file: "2_CROSSPALM_BACKWARD_135R_IMG.webp", order: 7 }
  ],
  CROSSOPENDOWN: [
    { file: "2_CROSSPALM_DOWN_0_IMG.webp", order: 1 },
    { file: "2_CROSSPALM_DOWN_45L_IMG.webp", order: 2 },
    { file: "2_CROSSPALM_DOWN_90L_IMG.webp", order: 3 },
    { file: "2_CROSSPALM_DOWN_135L_IMG.webp", order: 4 },
    { file: "2_CROSSPALM_DOWN_45R_IMG.webp", order: 5 },
    { file: "2_CROSSPALM_DOWN_90R_IMG.webp", order: 6 },
    { file: "2_CROSSPALM_DOWN_135R_IMG.webp", order: 7 }
  ],
  CROSSOPENFORWARD: [
    { file: "2_CROSSPALM_FORWARD_0_IMG.webp", order: 1 },
    { file: "2_CROSSPALM_FORWARD_45L_IMG.webp", order: 2 },
    { file: "2_CROSSPALM_FORWARD_90L_IMG.webp", order: 3 },
    { file: "2_CROSSPALM_FORWARD_135L_IMG.webp", order: 4 },
    { file: "2_CROSSPALM_FORWARD_45R_IMG.webp", order: 5 },
    { file: "2_CROSSPALM_FORWARD_90R_IMG.webp", order: 6 },
    { file: "2_CROSSPALM_FORWARD_135R_IMG.webp", order: 7 }
  ],
  CROSSOPENREVERSE: [
    { file: "2_CROSSPALM_REVERSE_0_IMG.webp", order: 1 },
    { file: "2_CROSSPALM_REVERSE_45L_IMG.webp", order: 2 },
    { file: "2_CROSSPALM_REVERSE_90L_IMG.webp", order: 3 },
    { file: "2_CROSSPALM_REVERSE_135L_IMG.webp", order: 4 },
    { file: "2_CROSSPALM_REVERSE_45R_IMG.webp", order: 5 },
    { file: "2_CROSSPALM_REVERSE_90R_IMG.webp", order: 6 },
    { file: "2_CROSSPALM_REVERSE_135R_IMG.webp", order: 7 }
  ],
  CROSSOPENUP: [
    { file: "2_CROSSPALM_UP_0_IMG.webp", order: 1 },
    { file: "2_CROSSPALM_UP_45L_IMG.webp", order: 2 },
    { file: "2_CROSSPALM_UP_90L_IMG.webp", order: 3 },
    { file: "2_CROSSPALM_UP_135L_IMG.webp", order: 4 },
    { file: "2_CROSSPALM_UP_45R_IMG.webp", order: 5 },
    { file: "2_CROSSPALM_UP_90R_IMG.webp", order: 6 },
    { file: "2_CROSSPALM_UP_135R_IMG.webp", order: 7 }
  ],
  // Cross – Closed Palm sequences (five directions)
  CROSSCLOSEDBACKWARD: [
    { file: "2_CROSSFIST_BACKWARD_0_IMG.webp", order: 1 },
    { file: "2_CROSSFIST_BACKWARD_45L_IMG.webp", order: 2 },
    { file: "2_CROSSFIST_BACKWARD_90L_IMG.webp", order: 3 },
    { file: "2_CROSSFIST_BACKWARD_135L_IMG.webp", order: 4 },
    { file: "2_CROSSFIST_BACKWARD_45R_IMG.webp", order: 5 },
    { file: "2_CROSSFIST_BACKWARD_90R_IMG.webp", order: 6 },
    { file: "2_CROSSFIST_BACKWARD_135R_IMG.webp", order: 7 }
  ],
  CROSSCLOSEDDOWN: [
    { file: "2_CROSSFIST_DOWN_0_IMG.webp", order: 1 },
    { file: "2_CROSSFIST_DOWN_45L_IMG.webp", order: 2 },
    { file: "2_CROSSFIST_DOWN_90L_IMG.webp", order: 3 },
    { file: "2_CROSSFIST_DOWN_135L_IMG.webp", order: 4 },
    { file: "2_CROSSFIST_DOWN_45R_IMG.webp", order: 5 },
    { file: "2_CROSSFIST_DOWN_90R_IMG.webp", order: 6 },
    { file: "2_CROSSFIST_DOWN_135R_IMG.webp", order: 7 }
  ],
  CROSSCLOSEDFORWARD: [
    { file: "2_CROSSFIST_FORWARD_0_IMG.webp", order: 1 },
    { file: "2_CROSSFIST_FORWARD_45L_IMG.webp", order: 2 },
    { file: "2_CROSSFIST_FORWARD_90L_IMG.webp", order: 3 },
    { file: "2_CROSSFIST_FORWARD_135L_IMG.webp", order: 4 },
    { file: "2_CROSSFIST_FORWARD_45R_IMG.webp", order: 5 },
    { file: "2_CROSSFIST_FORWARD_90R_IMG.webp", order: 6 },
    { file: "2_CROSSFIST_FORWARD_135R_IMG.webp", order: 7 }
  ],
  CROSSCLOSEDREVERSE: [
    { file: "2_CROSSFIST_REVERSE_0_IMG.webp", order: 1 },
    { file: "2_CROSSFIST_REVERSE_45L_IMG.webp", order: 2 },
    { file: "2_CROSSFIST_REVERSE_90L_IMG.webp", order: 3 },
    { file: "2_CROSSFIST_REVERSE_135L_IMG.webp", order: 4 },
    { file: "2_CROSSFIST_REVERSE_45R_IMG.webp", order: 5 },
    { file: "2_CROSSFIST_REVERSE_90R_IMG.webp", order: 6 },
    { file: "2_CROSSFIST_REVERSE_135R_IMG.webp", order: 7 }
  ],
  CROSSCLOSEDUP: [
    { file: "2_CROSSFIST_UP_0_IMG.webp", order: 1 },
    { file: "2_CROSSFIST_UP_45L_IMG.webp", order: 2 },
    { file: "2_CROSSFIST_UP_90L_IMG.webp", order: 3 },
    { file: "2_CROSSFIST_UP_135L_IMG.webp", order: 4 },
    { file: "2_CROSSFIST_UP_45R_IMG.webp", order: 5 },
    { file: "2_CROSSFIST_UP_90R_IMG.webp", order: 6 },
    { file: "2_CROSSFIST_UP_135R_IMG.webp", order: 7 }
  ]
};

// State variables
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
let currentPhase = "idle";
let secondsRemaining = 0;

// Lazy loading
let lazyLoader = null;

// Audio settings
let audioEnabled = true;
let audioEl;

function playDing() {
  if (!audioEnabled || !audioEl) return;
  try {
    audioEl.currentTime = 0;
    audioEl.play();
  } catch (e) {
    // ignore playback error
  }
}

// DOM helper functions
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

function switchScreen(screenId) {
  qsa(".screen").forEach(s => {
    if (s.id === screenId) s.classList.add("screen-active");
    else s.classList.remove("screen-active");
  });
}

function prettyRoutineName(key) {
  const map = {
    PALMSTOGETHER: "Palms Together",
    PALMIN: "Palms In",
    PALMOPEN: "Palms Open",
    PALMOUT: "Palms Out",
    PALMCLOSED: "Palms Closed",
    HEARTOPEN: "Heart Open",
    HEARTPROTECTED: "Heart Protected",
    SCAPULA: "Scapula",
    CROSSOPENBACKWARD: "Cross – Open Palm Backward",
    CROSSOPENDOWN: "Cross – Open Palm Down",
    CROSSOPENFORWARD: "Cross – Open Palm Forward",
    CROSSOPENREVERSE: "Cross – Open Palm Reverse",
    CROSSOPENUP: "Cross – Open Palm Up",
    CROSSCLOSEDBACKWARD: "Cross – Closed Palm Backward",
    CROSSCLOSEDDOWN: "Cross – Closed Palm Down",
    CROSSCLOSEDFORWARD: "Cross – Closed Palm Forward",
    CROSSCLOSEDREVERSE: "Cross – Closed Palm Reverse",
    CROSSCLOSEDUP: "Cross – Closed Palm Up",
    CUSTOM: "Custom Random"
  };
  return map[key] || key;
}

// Generate human-friendly labels from the filename.  This parses the file name
// and attempts to generate a name like "Up 45 Left", etc.  For routines
// where the key already describes the direction, we omit additional text.
function movementLabelFromFile(key, file) {
  // If the key is not a cross routine, derive from file name by splitting on underscores.
  const base = file.replace(/\.(svg|webp)$/, "");
  const parts = base.split("_");
  // parts[1] will be e.g. PALMOPEN, HEARTOPEN, etc.  parts[2] is variation (e.g. UP, DOWN).
  const category = parts[1] || key;
  const variation = parts[2] || "";
  let label = (category + " " + variation)
    .toLowerCase()
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  // For cross routines, keep file pattern (e.g. 0_IMG) but remove suffixes
  if (category === "CROSSPALM" || category === "CROSSFIST") {
    // Variation may be BACKWARD, DOWN, FORWARD, REVERSE, UP
    // The angle comes after that; we want "0", "45L", etc.
    const angle = parts[3] || "";
    // Compose label using direction and angle
    label = variation.toLowerCase().replace(/_/g, " ");
    label = label.charAt(0).toUpperCase() + label.slice(1);
    if (angle) {
      label += " " + angle.replace(/_/g, "");
    }
    label = label
      .split(" ")
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return label;
}

function sortedMovementsFor(key) {
  const arr = ROUTINES[key] || [];
  return [...arr].sort((a, b) => a.order - b.order);
}

// Custom random routine builder for upper body.  Prompts user for number of movements
// (between 3 and 12) and shuffles all available movements across all routines.
function handleCustomSequence() {
  const allMoves = Array.from(new Set([].concat(...Object.values(ROUTINES).map(arr => arr.map(m => m.file)))));
  const maxAllowed = Math.min(12, allMoves.length);
  let num = parseInt(prompt(`Enter number of movements for a custom random routine (3–${maxAllowed})`, "5"), 10);
  if (isNaN(num) || num < 3) num = 3;
  if (num > maxAllowed) num = maxAllowed;
  const shuffled = allMoves.sort(() => Math.random() - 0.5);
  const selectedFiles = shuffled.slice(0, num);
  selectedRoutineKey = "CUSTOM";
  selectedRoutineMovements = selectedFiles.map((file, idx) => ({ file: file, order: idx + 1 }));
  qs("#prefs-title").textContent = "Custom Random";
  qs("#prefs-tagline").textContent = "Set your preferred timing, then begin.";
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
  switchScreen("screen-prefs");
}

function renderRoutineCards() {
  const container = qs("#upper-routine-list");
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
      const img = document.createElement("img");
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
  // Append custom random card
  const customCard = document.createElement("div");
  customCard.className = "routine-card";
  customCard.addEventListener("click", () => {
    handleCustomSequence();
  });
  const header = document.createElement("div");
  header.className = "routine-header-row";
  const title = document.createElement("div");
  title.className = "routine-name";
  title.textContent = "Custom Random";
  const count = document.createElement("div");
  count.className = "routine-count";
  count.textContent = "3–12 movements";
  header.appendChild(title);
  header.appendChild(count);
  customCard.appendChild(header);
  const strip = document.createElement("div");
  strip.className = "thumb-strip";
  // leave empty for custom random card
  customCard.appendChild(strip);
  container.appendChild(customCard);
}

function handleRoutineSelected(key) {
  selectedRoutineKey = key;
  selectedRoutineMovements = sortedMovementsFor(key);
  // Populate preview in preferences
  const titleEl = qs("#prefs-title");
  const taglineEl = qs("#prefs-tagline");
  const labelEl = qs("#prefs-preview-label");
  titleEl.textContent = prettyRoutineName(key);
  taglineEl.textContent = "Set your preferred timing, then begin.";
  labelEl.textContent = prettyRoutineName(key);
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

// Main bar: current move (green) or rest (blue). Thin bar: whole routine.
let phaseBar = null;

// Whole routine = every move in every round, plus a rest between moves (none after the last)
function routineTotalSeconds() {
  const steps = selectedRoutineMovements.length * prefs.rounds;
  return steps * prefs.secondsPerMovement + Math.max(0, steps - 1) * prefs.restBetween;
}

function isLastStep() {
  return currentMovementIndex >= selectedRoutineMovements.length - 1 && currentRound >= prefs.rounds;
}

function startRoutine() {
  stopRoutineTimers();
  // Set initial state
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
    window.timeTracker.startSession('Upper Body Innervation', selectedRoutineKey);
  }
  startPhase("move");
}

function stopRoutineTimers() {
  if (movementTimerId) {
    clearInterval(movementTimerId);
    movementTimerId = null;
  }
}

// With resume = true, carry on with the time that was left
function startPhase(phase, resume = false) {
  currentPhase = phase;
  if (resume) {
    if (phaseBar) phaseBar.resume();
  } else {
    secondsRemaining = (phase === "move") ? prefs.secondsPerMovement : prefs.restBetween;
    if (phaseBar) phaseBar.startPhase(phase, secondsRemaining);
  }
  updateMovementUI();
  if (movementTimerId) clearInterval(movementTimerId);
  if (!isRunning) return;
  if (secondsRemaining <= 0) {
    handlePhaseComplete();
    return;
  }
  movementTimerId = setInterval(() => {
    if (!isRunning) return;
    secondsRemaining -= 1;
    if (secondsRemaining <= 0) {
      clearInterval(movementTimerId);
      movementTimerId = null;
      handlePhaseComplete();
    } else {
      updatePhaseLabel();
    }
  }, 1000);
}

function handlePhaseComplete() {
  // Record the movement that just completed
  if (currentPhase === "move" && window.timeTracker) {
    const move = selectedRoutineMovements[currentMovementIndex];
    if (move) {
      const label = movementLabelFromFile(selectedRoutineKey, move.file);
      window.timeTracker.recordMovement(label, prefs.secondsPerMovement);
    }
  }

  if (currentPhase === "move" && prefs.restBetween > 0 && !isLastStep()) {
    playDing();
    startPhase("rest");
  } else {
    playDing();
    advanceMovement();
  }
}

function advanceMovement() {
  currentMovementIndex += 1;
  if (currentMovementIndex >= selectedRoutineMovements.length) {
    currentRound += 1;
    if (currentRound > prefs.rounds) {
      finishRoutine();
      return;
    }
    currentMovementIndex = 0;
  }
  startPhase("move");
}

function finishRoutine() {
  isRunning = false;
  stopRoutineTimers();
  currentPhase = "idle";
  if (phaseBar) phaseBar.finish();
  qs("#btn-play-pause").textContent = "Restart";
  qs("#phase-label").textContent = "Complete";
  qs("#status-message").textContent = "Routine complete.";
  // Stop time tracking and show summary
  if (window.timeTracker) {
    window.timeTracker.stopSession();
    const sessionTime = window.timeTracker.getLastSessionDuration();
    if (window.TimeStatsUI) {
      setTimeout(() => {
        TimeStatsUI.showQuickSummary('Upper Body Innervation', sessionTime);
      }, 500);
    }
  }
}

function updateMovementUI() {
  const move = selectedRoutineMovements[currentMovementIndex];
  if (!move) return;
  const label = movementLabelFromFile(selectedRoutineKey, move.file);
  qs("#current-movement-label").textContent = label;
  const imgEl = qs("#current-movement-image");
  imgEl.src = IMAGE_BASE_PATH + move.file;
  imgEl.alt = label;
  qs("#movement-count").textContent = `Movement ${currentMovementIndex + 1} of ${selectedRoutineMovements.length}`;
  qs("#round-count").textContent = `Round ${currentRound} of ${prefs.rounds}`;
  // Time tracking happens when movement completes, not here
  updatePhaseLabel();
}

function updatePhaseLabel() {
  let txt = "";
  if (currentPhase === "move") {
    txt = `Move · ${secondsRemaining}s`;
  } else if (currentPhase === "rest") {
    txt = `Rest · ${secondsRemaining}s`;
  } else {
    txt = "Ready";
  }
  qs("#phase-label").textContent = txt;
}

function togglePlayPause() {
  if (!selectedRoutineMovements.length) return;
  if (!isRunning && currentPhase === "idle") {
    startRoutine();
    return;
  }
  if (isRunning) {
    isRunning = false;
    stopRoutineTimers();
    qs("#btn-play-pause").textContent = "Resume";
    if (phaseBar) phaseBar.pause();
  } else {
    isRunning = true;
    qs("#btn-play-pause").textContent = "Pause";
    // Continue the current phase from where it was paused
    startPhase(currentPhase || "move", true);
  }
}

function restartRoutine() {
  if (!selectedRoutineMovements.length) return;
  startRoutine();
}

function initBackButtons() {
  qsa(".back-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.back;
      if (!target) return;
      // Reset player state when navigating back
      stopRoutineTimers();
      isRunning = false;
      qs("#btn-play-pause").textContent = "Start";
      currentPhase = "idle";
      if (phaseBar) phaseBar.reset();
      qs("#phase-label").textContent = "Ready";
      switchScreen(target);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Initialize lazy image loader
  lazyLoader = new LazyImageLoader({ rootMargin: '100px' });
  phaseBar = new PhaseBar(document.getElementById("prog"));

  renderRoutineCards();
  initBackButtons();
  const randomBtn = qs("#upper-btn-random");
  if (randomBtn) randomBtn.addEventListener("click", handleCustomSequence);
  const playPauseBtn = qs("#btn-play-pause");
  const restartBtn = qs("#btn-restart");
  playPauseBtn.addEventListener("click", togglePlayPause);
  restartBtn.addEventListener("click", restartRoutine);
  // Audio toggle setup
  audioEl = document.getElementById("audio-ding");
  const toggle = qs("#upper-audio-toggle");
  toggle.addEventListener("click", () => {
    const on = toggle.dataset.on === "1";
    if (on) {
      toggle.dataset.on = "0";
      audioEnabled = false;
      toggle.classList.remove("pill-on");
      toggle.querySelector(".pill-label").textContent = "Off";
    } else {
      toggle.dataset.on = "1";
      audioEnabled = true;
      toggle.classList.add("pill-on");
      toggle.querySelector(".pill-label").textContent = "On";
    }
  });
  // Set defaults from preferences inputs
  const secInput = qs("#input-seconds");
  const restInput = qs("#input-rest");
  const roundsInput = qs("#input-rounds");
  secInput.addEventListener("change", () => {
    prefs.secondsPerMovement = Math.max(5, parseInt(secInput.value, 10) || 45);
  });
  restInput.addEventListener("change", () => {
    prefs.restBetween = Math.max(0, parseInt(restInput.value, 10) || 3);
  });
  roundsInput.addEventListener("change", () => {
    prefs.rounds = Math.max(1, parseInt(roundsInput.value, 10) || 2);
  });
  // Start routine button
  const startBtn = qs("#btn-start-routine");
  startBtn.addEventListener("click", () => {
    // Read the fields at start so typed values count even without leaving the field (0 rest is allowed)
    const sec = parseInt(secInput.value, 10);
    const rest = parseInt(restInput.value, 10);
    const rounds = parseInt(roundsInput.value, 10);
    prefs.secondsPerMovement = isNaN(sec) ? 45 : Math.max(5, sec);
    prefs.restBetween = isNaN(rest) ? 3 : Math.max(0, rest);
    prefs.rounds = isNaN(rounds) ? 2 : Math.max(1, rounds);
    startRoutine();
    switchScreen("screen-player");
  });
  // Parse URL query parameter for routine
  const params = new URLSearchParams(window.location.search);
  const randomFlag = params.get("random");
  const r = params.get("routine");
  if (randomFlag === "1") {
    handleCustomSequence();
  } else if (r) {
    const upperKey = r.toUpperCase();
    if (ROUTINES[upperKey]) {
      handleRoutineSelected(upperKey);
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
