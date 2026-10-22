// Mudra Generator App
// Random mudra sequences with simple timing + audio cues.
// Uses numeric filenames: 1.webp, 2.webp, ... up to TOTAL_MUDRAS in assets/mudras/.

const IMAGE_BASE_PATH = "assets/mudras/";
const TOTAL_MUDRAS = 45; // we have 1.webp ... 45.webp (change if you have fewer)

// Build an array: ["1.webp", "2.webp", ..., "45.webp"]
const MUDRA_FILES = Array.from({ length: TOTAL_MUDRAS }, (_, i) => `${i + 1}.webp`);

// STATE
let mudraSequence = [];
let prefs = {
  count: 3,
  secondsPerMudra: 45,
  restBetween: 3
};

let isRunning = false;
let currentIndex = 0;
let currentPhase = "idle"; // "move" | "rest" | "idle"
let secondsRemaining = 0;
let timerId = null;

// Lazy loading
let lazyLoader = null;

// Audio + progress bars
let audioEnabled = true;
let audioEl = null;
let phaseBar = null;

// Helpers
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

function playDing() {
  if (!audioEnabled || !audioEl) return;
  try {
    audioEl.currentTime = 0;
    audioEl.play();
  } catch (e) {
    // ignore autoplay restrictions
  }
}

function switchScreen(id) {
  qsa(".screen").forEach(s => {
    if (s.id === id) s.classList.add("screen-active");
    else s.classList.remove("screen-active");
  });
}

// Generate a random mudra sequence
function generateMudraSequence(count) {
  const maxCount = Math.min(count, MUDRA_FILES.length);
  const shuffled = [...MUDRA_FILES].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, maxCount);

  mudraSequence = selected.map((file, idx) => ({
    file,
    label: `Mudra ${idx + 1}`
  }));
}

// Build preview strip and setup player UI
function setupPlayerUI() {
  const title = qs("#player-title");
  const label = qs("#player-preview-label");
  const strip = qs("#player-preview-strip");

  if (title) title.textContent = "Mudra Session";
  if (label) label.textContent = "Sequence";

  if (strip) {
    strip.innerHTML = "";
    mudraSequence.forEach(m => {
      const d = document.createElement("div");
      d.className = "preview-thumb";
      const img = document.createElement("img");
      img.dataset.src = IMAGE_BASE_PATH + m.file;
      img.alt = m.label;
      d.appendChild(img);
      strip.appendChild(d);
      if (lazyLoader) lazyLoader.observe(img);
    });
  }

  updateMudraUI();
}

// Progress bars
// Whole session = every hold, plus a rest between mudras (none after the last one)
function sessionTotalSeconds() {
  const n = mudraSequence.length;
  return n * prefs.secondsPerMudra + Math.max(0, n - 1) * prefs.restBetween;
}

function resetProgressBar() {
  if (!phaseBar) return;
  phaseBar.reset();
  phaseBar.setTotal(sessionTotalSeconds());
}

// Start a fresh session (does not auto-start the timer)
function prepareSession() {
  if (!mudraSequence.length) return;

  isRunning = false;
  currentIndex = 0;
  currentPhase = "idle";
  secondsRemaining = 0;
  resetProgressBar();
  updateMudraUI();

  const phaseLabel = qs("#phase-label");
  if (phaseLabel) phaseLabel.textContent = "Ready";

  const playBtn = qs("#btn-play-pause");
  if (playBtn) playBtn.textContent = "Start";

  const status = qs("#status-message");
  if (status) status.textContent = "";

  switchScreen("screen-player");
}

function startSession() {
  if (!mudraSequence.length) return;
  if (isRunning) return;

  isRunning = true;
  const playBtn = qs("#btn-play-pause");
  if (playBtn) playBtn.textContent = "Pause";
  currentPhase = "move";
  secondsRemaining = prefs.secondsPerMudra;
  resetProgressBar();

  // Start time tracking
  if (window.timeTracker) {
    window.timeTracker.startSession('Mudras', 'Random');
  }

  if (phaseBar) phaseBar.startPhase("move", prefs.secondsPerMudra);
  beginMudraClock();

  runTimerTick();
}

// Start the clock for the mudra on screen
function beginMudraClock() {
  const current = mudraSequence[currentIndex];
  if (window.timeTracker && current) window.timeTracker.beginMovement(current.label, prefs.secondsPerMudra);
}

function runTimerTick() {
  if (timerId) clearInterval(timerId);
  updatePhaseLabel();

  timerId = setInterval(() => {
    if (!isRunning) return;
    secondsRemaining--;
    if (secondsRemaining <= 0) {
      clearInterval(timerId);
      timerId = null;
      handlePhaseComplete();
    } else {
      updatePhaseLabel();
    }
  }, 1000);
}

function handlePhaseComplete() {
  // Keep the time actually spent on the mudra that just ended
  if (currentPhase === "move" && window.timeTracker) window.timeTracker.endMovement();

  playDing();

  const isLastMudra = currentIndex >= mudraSequence.length - 1;
  if (currentPhase === "move" && prefs.restBetween > 0 && !isLastMudra) {
    // Go into rest
    currentPhase = "rest";
    secondsRemaining = prefs.restBetween;
    if (phaseBar) phaseBar.startPhase("rest", prefs.restBetween);
    updatePhaseLabel();
    runTimerTick();
    return;
  }

  // Finished rest or no rest: advance to next mudra
  currentIndex++;
  if (currentIndex >= mudraSequence.length) {
    finishSession();
    return;
  }

  currentPhase = "move";
  secondsRemaining = prefs.secondsPerMudra;
  updateMudraUI();
  if (phaseBar) phaseBar.startPhase("move", prefs.secondsPerMudra);
  beginMudraClock();

  runTimerTick();
}

function finishSession() {
  isRunning = false;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  currentIndex = mudraSequence.length - 1;
  currentPhase = "idle";
  if (phaseBar) phaseBar.finish();

  const playBtn = qs("#btn-play-pause");
  if (playBtn) playBtn.textContent = "Restart";

  const phaseLabel = qs("#phase-label");
  if (phaseLabel) phaseLabel.textContent = "Complete";

  const status = qs("#status-message");
  if (status) status.textContent = "Session complete. Sit for a moment and notice what shifted.";

  playDing();

  // Stop time tracking and show summary
  if (window.timeTracker) {
    window.timeTracker.stopSession();
    const sessionTime = window.timeTracker.getLastSessionDuration();
    if (window.TimeStatsUI) {
      setTimeout(() => {
        TimeStatsUI.showQuickSummary('Mudras', sessionTime);
      }, 500);
    }
  }

  // Show completion prompt after 2 seconds
  if (window.routineCompletionPrompt) {
    setTimeout(() => {
      window.routineCompletionPrompt.show();
    }, 2000);
  }
}

function updateMudraUI() {
  const current = mudraSequence[currentIndex];
  const labelEl = qs("#current-mudra-label");
  const imgEl = qs("#current-mudra-image");
  const countEl = qs("#mudra-count");

  if (current) {
    if (labelEl) labelEl.textContent = current.label;
    if (imgEl) {
      imgEl.src = IMAGE_BASE_PATH + current.file;
      imgEl.alt = current.label;
    }
    if (countEl) {
      countEl.textContent = `Mudra ${currentIndex + 1} of ${mudraSequence.length}`;
    }
    // Time tracking happens when mudra completes
  } else {
    if (labelEl) labelEl.textContent = "Mudra";
    if (countEl) countEl.textContent = "";
  }

  updatePhaseLabel();
}

function updatePhaseLabel() {
  const phaseLabel = qs("#phase-label");
  if (!phaseLabel) return;

  let txt = "Ready";
  if (currentPhase === "move") {
    txt = `Hold · ${secondsRemaining}s`;
  } else if (currentPhase === "rest") {
    txt = `Rest · ${secondsRemaining}s`;
  }
  phaseLabel.textContent = txt;
}

function togglePlayPause() {
  if (!mudraSequence.length) return;

  const playBtn = qs("#btn-play-pause");

  if (!isRunning && currentPhase === "idle") {
    startSession();
    return;
  }

  if (isRunning) {
    // Pause
    isRunning = false;
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
    if (playBtn) playBtn.textContent = "Resume";
    if (phaseBar) phaseBar.pause();
    if (window.timeTracker) window.timeTracker.pauseMovement();
  } else {
    // Resume
    isRunning = true;
    if (playBtn) playBtn.textContent = "Pause";
    if (phaseBar) phaseBar.resume();
    if (window.timeTracker && currentPhase === "move") window.timeTracker.resumeMovement();
    const status = qs("#status-message");
    if (status) status.textContent = "";

    runTimerTick();
  }
}

function restartSession() {
  if (!mudraSequence.length) return;
  if (window.timeTracker) window.timeTracker.stopSession(); // keeps the time already done
  isRunning = false;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  currentIndex = 0;
  currentPhase = "idle";
  secondsRemaining = 0;
  prepareSession();
}

// Stop part-way through: the time done so far is kept, and shown
function stopMudraSession() {
  isRunning = false;
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  currentIndex = 0;
  currentPhase = "idle";
  secondsRemaining = 0;
  resetProgressBar();
  updateMudraUI();
  const playBtn = qs("#btn-play-pause");
  if (playBtn) playBtn.textContent = "Start";
  const status = qs("#status-message");
  if (status) status.textContent = "";
  if (window.timeTracker && window.timeTracker.sessionStartTime) {
    window.timeTracker.stopSession();
    const sessionTime = window.timeTracker.getLastSessionDuration();
    if (sessionTime > 0 && window.TimeStatsUI) TimeStatsUI.showQuickSummary('Mudras', sessionTime);
  }
}

// Leaving the page pauses the session, so time away is never counted
window.addEventListener("practice:away", () => {
  if (!isRunning) return;
  togglePlayPause();
  const status = qs("#status-message");
  if (status) status.textContent = "Paused while you were away. Press Resume to carry on.";
});

// Handle Generate button (random sequence) and One Mudra Now
function handleGenerateClick(single) {
  const countInput = qs("#input-mudra-count");
  const secInput = qs("#input-seconds");
  const restInput = qs("#input-rest");
  const status = qs("#status-message");

  let count = parseInt(countInput && countInput.value, 10) || prefs.count;
  let seconds = parseInt(secInput && secInput.value, 10) || prefs.secondsPerMudra;
  let rest = parseInt(restInput && restInput.value, 10);
  if (isNaN(rest)) rest = prefs.restBetween;

  if (single) count = 1;

  // clamp values
  count = Math.max(1, Math.min(count, MUDRA_FILES.length));
  seconds = Math.max(5, Math.min(seconds, 300));
  rest = Math.max(0, Math.min(rest, 120));

  prefs.count = count;
  prefs.secondsPerMudra = seconds;
  prefs.restBetween = rest;

  if (status) status.textContent = "";

  generateMudraSequence(count);
  setupPlayerUI();
  prepareSession();
}

// INIT
function initMudrasApp() {
  // Initialize lazy image loader
  lazyLoader = new LazyImageLoader({ rootMargin: '100px' });

  audioEl = document.getElementById("audio-ding");
  phaseBar = new PhaseBar(document.getElementById("prog"));

  const audioToggle = qs("#mudra-audio-toggle");
  if (audioToggle) {
    audioToggle.addEventListener("click", () => {
      audioEnabled = !audioEnabled;
      audioToggle.dataset.on = audioEnabled ? "1" : "0";
      const labelSpan = audioToggle.querySelector(".pill-label");
      if (labelSpan) labelSpan.textContent = audioEnabled ? "On" : "Off";
    });
  }

  const genBtn = qs("#btn-generate-sequence");
  if (genBtn) {
    genBtn.addEventListener("click", () => handleGenerateClick(false));
  }

  const singleBtn = qs("#btn-single-mudra");
  if (singleBtn) {
    singleBtn.addEventListener("click", () => handleGenerateClick(true));
  }

  const playBtn = qs("#btn-play-pause");
  if (playBtn) {
    playBtn.addEventListener("click", togglePlayPause);
  }

  const stopBtn = qs("#btn-stop");
  if (stopBtn) stopBtn.addEventListener("click", stopMudraSession);

  const restartBtn = qs("#btn-restart");
  if (restartBtn) {
    restartBtn.addEventListener("click", restartSession);
  }

  const backBtn = qs("#btn-back-to-config");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      stopMudraSession();
      switchScreen("screen-config");
    });
  }
}

// Stats button handler
const statsBtn = document.getElementById('stats-btn');
if (statsBtn && window.timeStatsUI) {
  statsBtn.addEventListener('click', () => {
    window.timeStatsUI.open();
  });
}

// Run init whether script is deferred or at bottom of body
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMudrasApp);
} else {
  initMudrasApp();
}
