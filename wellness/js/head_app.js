// Head Innervation app script for Neocities
// Mirrors the lower/upper/ocular pages: routine picker → prefs → player
// Uses the shared InnervationSVGs folder for images.

const IMAGE_BASE_PATH = "InnervationSVGs/";

// HEAD ROUTINES
// Each key is a routine; each entry has file + order for sequence.
const ROUTINES = {
  CHINBOTTOM: [
    { file: "3_CHINBOTTOM_0_D_IMG.webp", order: 1 },
    { file: "3_CHINBOTTOM_L_D_IMG.webp", order: 2 },
    { file: "3_CHINBOTTOM_R_D_IMG.webp", order: 3 },
    { file: "3_CHINBOTTOM_1_D_IMG.webp", order: 4 },
    { file: "3_CHINBOTTOM_2_D_IMG.webp", order: 5 },
    { file: "3_CHINBOTTOM_3_D_IMG.webp", order: 6 },
    { file: "3_CHINBOTTOM_4_D_IMG.webp", order: 7 },
    { file: "3_CHINBOTTOM_5_D_IMG.webp", order: 8 },
    { file: "3_CHINBOTTOM_6_D_IMG.webp", order: 9 },
    { file: "3_CHINBOTTOM_7_D_IMG.webp", order: 10 },
    { file: "3_CHINBOTTOM_8_D_IMG.webp", order: 11 }
  ],
  CHINTOP: [
    { file: "3_CHINTOP_0_D_IMG.webp", order: 1 },
    { file: "3_CHINTOP_L_D_IMG.webp", order: 2 },
    { file: "3_CHINTOP_R_D_IMG.webp", order: 3 },
    { file: "3_CHINTOP_1_D_IMG.webp", order: 4 },
    { file: "3_CHINTOP_2_D_IMG.webp", order: 5 },
    { file: "3_CHINTOP_3_D_IMG.webp", order: 6 },
    { file: "3_CHINTOP_4_D_IMG.webp", order: 7 },
    { file: "3_CHINTOP_5_D_IMG.webp", order: 8 },
    { file: "3_CHINTOP_6_D_IMG.webp", order: 9 },
    { file: "3_CHINTOP_7_D_IMG.webp", order: 10 },
    { file: "3_CHINTOP_8_D_IMG.webp", order: 11 }
  ],
  LION: [
    { file: "3_LION_0_D_IMG.webp", order: 1 },
    { file: "3_LION_1_D_IMG.webp", order: 2 },
    { file: "3_LION_2_D_IMG.webp", order: 3 },
    { file: "3_LION_3_D_IMG.webp", order: 4 },
    { file: "3_LION_4_D_IMG.webp", order: 5 },
    { file: "3_LION_5_D_IMG.webp", order: 6 },
    { file: "3_LION_6_D_IMG.webp", order: 7 },
    { file: "3_LION_7_D_IMG.webp", order: 8 },
    { file: "3_LION_8_D_IMG.webp", order: 9 }
  ],
  LIONLEFT: [
    { file: "3_LIONLEFT_0_D_IMG.webp", order: 1 },
    { file: "3_LIONLEFT_1_D_IMG.webp", order: 2 },
    { file: "3_LIONLEFT_2_D_IMG.webp", order: 3 },
    { file: "3_LIONLEFT_3_D_IMG.webp", order: 4 },
    { file: "3_LIONLEFT_4_D_IMG.webp", order: 5 },
    { file: "3_LIONLEFT_5_D_IMG.webp", order: 6 },
    { file: "3_LIONLEFT_6_D_IMG.webp", order: 7 },
    { file: "3_LIONLEFT_7_D_IMG.webp", order: 8 },
    { file: "3_LIONLEFT_8_D_IMG.webp", order: 9 }
  ],
  LIONRIGHT: [
    { file: "3_LIONRIGHT_0_D_IMG.webp", order: 1 },
    { file: "3_LIONRIGHT_1_D_IMG.webp", order: 2 },
    { file: "3_LIONRIGHT_2_D_IMG.webp", order: 3 },
    { file: "3_LIONRIGHT_3_D_IMG.webp", order: 4 },
    { file: "3_LIONRIGHT_4_D_IMG.webp", order: 5 },
    { file: "3_LIONRIGHT_5_D_IMG.webp", order: 6 },
    { file: "3_LIONRIGHT_6_D_IMG.webp", order: 7 },
    { file: "3_LIONRIGHT_7_D_IMG.webp", order: 8 },
    { file: "3_LIONRIGHT_8_D_IMG.webp", order: 9 }
  ],
  NOSE: [
    { file: "3_OPENNOSE_CLOSEMOUTH_D_IMG.webp", order: 1 },
    { file: "3_OPENNOSE_OPENMOUTH_D_IMG.webp", order: 2 },
    { file: "3_PULLNOSE_MID_D_IMG.webp", order: 3 },
    { file: "3_PULLNOSE_L_D_IMG.webp", order: 4 },
    { file: "3_PULLNOSE_R_D_IMG.webp", order: 5 },
    { file: "3_SCRUNCHNOSE_MID_D_IMG.webp", order: 6 },
    { file: "3_SCRUNCHNOSE_R_D_IMG.webp", order: 7 },
    { file: "3_SCRUNCHNOSE_L_D_IMG.webp", order: 8 }
  ],
  PULL: [
    { file: "3_PULLTOP_R_D_IMG.webp", order: 1 },
    { file: "3_PULLTOP_L_D_IMG.webp", order: 2 },
    { file: "3_PULLFOREHEAD_R_D_IMG.webp", order: 3 },
    { file: "3_PULLFOREHEAD_L_D_IMG.webp", order: 4 },
    { file: "3_PULLJAW_R_D_IMG.webp", order: 5 },
    { file: "3_PULLJAW_L_D_IMG.webp", order: 6 },
    { file: "3_PULLEAR_R_D_IMG.webp", order: 7 },
    { file: "3_PULLEAR_L_D_IMG.webp", order: 8 }
  ]
};

// STATE
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
let currentPhase = "idle"; // "move" | "rest" | "idle"
let secondsRemaining = 0;

// Lazy loading
let lazyLoader = null;

// AUDIO
let audioEnabled = true;
let audioEl = null;

function playDing() {
  if (!audioEnabled || !audioEl) return;
  try {
    audioEl.currentTime = 0;
    audioEl.play();
  } catch (e) {
    // ignore autoplay errors
  }
}

// DOM HELPERS
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

// SCREEN SWITCH
function switchScreen(screenId) {
  qsa(".screen").forEach(s => {
    if (s.id === screenId) s.classList.add("screen-active");
    else s.classList.remove("screen-active");
  });
}

// PRETTY NAMES
function prettyRoutineName(key) {
  const map = {
    CHINBOTTOM: "Chin – Bottom",
    CHINTOP: "Chin – Top",
    LION: "Lion (Center)",
    LIONLEFT: "Lion (Left Bias)",
    LIONRIGHT: "Lion (Right Bias)",
    NOSE: "Nose & Mid-Face",
    PULL: "Top / Forehead / Jaw / Ear Pulls",
    CUSTOM: "Custom Random"
  };
  return map[key] || key;
}

// LABEL FROM FILENAME (similar to lower/upper)
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

// SORTED MOVES
function sortedMovementsFor(key) {
  const arr = ROUTINES[key] || [];
  return [...arr].sort((a, b) => a.order - b.order);
}

// CUSTOM RANDOM SEQUENCE (3–12 positions from all head files)
function handleCustomSequence() {
  const allMoves = Array.from(
    new Set([].concat(...Object.values(ROUTINES).map(arr => arr.map(m => m.file))))
  );
  const maxAllowed = Math.min(12, allMoves.length);
  let num = parseInt(
    prompt(`Enter number of movements for a custom random routine (3–${maxAllowed})`, "5"),
    10
  );
  if (isNaN(num) || num < 3) num = 3;
  if (num > maxAllowed) num = maxAllowed;

  const shuffled = allMoves.sort(() => Math.random() - 0.5);
  const selectedFiles = shuffled.slice(0, num);

  selectedRoutineKey = "CUSTOM";
  selectedRoutineMovements = selectedFiles.map((file, idx) => ({
    file,
    order: idx + 1
  }));

  qs("#prefs-title").textContent = "Custom Random";
  qs("#prefs-tagline").textContent = "Set your timing, then begin.";
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

// RENDER ROUTINE CARDS
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
    count.textContent = moves.length + " positions";

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

    card.addEventListener("click", () => handleRoutineSelected(key));

    container.appendChild(card);
  });

  // Custom random card
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
  countLabel.textContent = "3–12 positions";

  header.appendChild(title);
  header.appendChild(countLabel);
  customCard.appendChild(header);

  const strip = document.createElement("div");
  strip.className = "thumb-strip";

  const previewFiles = Array.from(
    new Set([].concat(...Object.values(ROUTINES).map(arr => arr.map(m => m.file))))
  ).slice(0, 3);

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

// ON ROUTINE SELECT
function handleRoutineSelected(key) {
  selectedRoutineKey = key;
  selectedRoutineMovements = sortedMovementsFor(key);

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

// RANDOM ROUTINE
function pickRandomRoutine() {
  const keys = Object.keys(ROUTINES);
  if (!keys.length) return;
  const key = keys[Math.floor(Math.random() * keys.length)];
  handleRoutineSelected(key);
}

// COLLECT PREFS & START
function collectPrefsAndStart() {
  const sec = parseInt(qs("#input-seconds").value, 10) || 45;
  const rest = parseInt(qs("#input-rest").value, 10) || 3;
  const rounds = parseInt(qs("#input-rounds").value, 10) || 2;

  prefs.secondsPerMovement = Math.max(5, sec);
  prefs.restBetween = Math.max(0, rest);
  prefs.rounds = Math.max(1, rounds);

  startRoutine();
}

// SETUP PLAYER UI
function setupPlayerUI() {
  if (!selectedRoutineKey || !selectedRoutineMovements.length) return;

  qs("#player-title").textContent = prettyRoutineName(selectedRoutineKey);
  qs("#player-tagline").textContent =
    "Stay curious about what you feel in jaw, face, scalp and neck.";
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

// PROGRESS BARS
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

// ROUTINE LIFECYCLE
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
    window.timeTracker.startSession('Head Innervation', selectedRoutineKey);
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

function handlePhaseComplete() {
  // Keep the time actually spent on the movement that just ended
  if (currentPhase === "move" && window.timeTracker) window.timeTracker.endMovement();

  playDing();
  if (currentPhase === "move" && prefs.restBetween > 0 && !isLastStep()) {
    startPhase("rest");
  } else {
    advanceMovement();
  }
}

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

function finishRoutine() {
  isRunning = false;
  stopRoutineTimers();
  currentPhase = "idle";
  if (phaseBar) phaseBar.finish();
  qs("#btn-play-pause").textContent = "Restart";
  qs("#phase-label").textContent = "Complete";
  qs("#status-message").textContent =
    "Routine complete. Notice how your head, jaw and face feel.";
  playDing();
  // Stop time tracking and show summary
  if (window.timeTracker) {
    window.timeTracker.stopSession();
    const sessionTime = window.timeTracker.getLastSessionDuration();
    if (window.TimeStatsUI) {
      setTimeout(() => {
        TimeStatsUI.showQuickSummary('Head Innervation', sessionTime);
      }, 500);
    }
  }
}

// UI UPDATES
function updateMovementUI() {
  const move = selectedRoutineMovements[currentMovementIndex];
  if (!move) return;

  const label = movementLabelFromFile(selectedRoutineKey, move.file);
  qs("#current-movement-label").textContent = label;

  const img = qs("#current-movement-image");
  img.src = IMAGE_BASE_PATH + move.file;
  img.alt = label;

  qs("#movement-count").textContent =
    `Movement ${currentMovementIndex + 1} of ${selectedRoutineMovements.length}`;
  qs("#round-count").textContent =
    `Round ${currentRound} of ${prefs.rounds}`;

  // Time tracking happens when movement completes

  updatePhaseLabel();
}

function updatePhaseLabel() {
  let txt = "Ready";
  if (currentPhase === "move") {
    txt = `Move · ${secondsRemaining}s`;
  } else if (currentPhase === "rest") {
    txt = `Rest · ${secondsRemaining}s`;
  }
  qs("#phase-label").textContent = txt;
}

// CONTROLS
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
    qs("#status-message").textContent = "";
    startPhase(currentPhase || "move", true);
  }
}

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
    if (sessionTime > 0 && window.TimeStatsUI) TimeStatsUI.showQuickSummary('Head Innervation', sessionTime);
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

// BACK BUTTONS
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

// INIT
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

  audioEl = document.getElementById("audio-ding");
  const audioToggle = qs("#head-audio-toggle");
  if (audioToggle) {
    audioToggle.addEventListener("click", () => {
      audioEnabled = !audioEnabled;
      audioToggle.dataset.on = audioEnabled ? "1" : "0";
      const labelSpan = audioToggle.querySelector(".pill-label");
      if (labelSpan) labelSpan.textContent = audioEnabled ? "On" : "Off";
    });
  }

  // Optional deep link: head.html?routine=lion, etc.
  const params = new URLSearchParams(window.location.search);
  const r = params.get("routine");
  if (r) {
    const key = r.toUpperCase();
    if (ROUTINES[key]) {
      handleRoutineSelected(key);
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
