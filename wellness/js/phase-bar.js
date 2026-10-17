// Phase progress bars shared by the routine players.
// The main bar shows the current hold or rest (each in its own color),
// and a thin bar underneath shows how far through the whole session you are.
// The bars follow their own clock, so pausing freezes them exactly where they are.

class PhaseBar {
  constructor(fillEl) {
    this.fill = fillEl;
    this.sessionFill = null;
    this.phase = "idle";
    this.duration = 0;
    this.elapsed = 0;
    this.doneBefore = 0;
    this.total = 0;
    this.running = false;
    this.resumedAt = 0;
    this.baseElapsed = 0;
    this.rafId = null;
    this.intervalId = null;

    if (!this.fill) return;
    this.fill.style.transition = "none";

    const wrap = this.fill.parentElement;
    if (wrap && !wrap.nextElementSibling?.classList.contains("session-progress-wrap")) {
      const sessionWrap = document.createElement("div");
      sessionWrap.className = "session-progress-wrap";
      sessionWrap.title = "Whole session";
      this.sessionFill = document.createElement("div");
      sessionWrap.appendChild(this.sessionFill);
      this.sessionFill.className = "session-progress-fill";
      wrap.insertAdjacentElement("afterend", sessionWrap);
    } else if (wrap) {
      this.sessionFill = wrap.nextElementSibling.firstElementChild;
    }
    this.render();
  }

  // Total length of the session in seconds (all holds plus all rests)
  setTotal(seconds) {
    this.total = Math.max(0, seconds);
    this.render();
  }

  // Back to empty, ready to start
  reset() {
    this.stopLoop();
    this.running = false;
    this.phase = "idle";
    this.duration = 0;
    this.elapsed = 0;
    this.doneBefore = 0;
    this.render();
  }

  // Begin a hold ("move") or "rest" phase lasting `seconds`
  startPhase(phase, seconds) {
    if (this.phase !== "idle" && this.duration > 0) {
      this.doneBefore += this.duration;
    }
    this.phase = phase;
    this.duration = Math.max(0, seconds);
    this.elapsed = 0;
    this.resume();
  }

  pause() {
    this.elapsed = this.currentElapsed();
    this.running = false;
    this.stopLoop();
    this.render();
  }

  resume() {
    this.running = true;
    this.resumedAt = performance.now();
    this.baseElapsed = this.elapsed;
    this.stopLoop();
    this.rafId = requestAnimationFrame(() => this.tick());
    // Animation frames pause in background tabs, so also redraw on a plain timer
    this.intervalId = setInterval(() => this.render(), 250);
  }

  // Seconds into the current phase, measured by the clock
  currentElapsed() {
    if (!this.running) return this.elapsed;
    return this.baseElapsed + (performance.now() - this.resumedAt) / 1000;
  }

  // Session finished: both bars full
  finish() {
    this.stopLoop();
    this.running = false;
    this.phase = "done";
    this.render(true);
  }

  stopLoop() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.intervalId) clearInterval(this.intervalId);
    this.rafId = null;
    this.intervalId = null;
  }

  tick() {
    if (!this.running) return;
    this.render();
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  render(full = false) {
    if (!this.fill) return;
    const inPhase = Math.min(this.currentElapsed(), this.duration);
    const phaseFrac = full ? 1 : (this.duration ? inPhase / this.duration : 0);
    const sessionFrac = full ? 1 : (this.total ? Math.min((this.doneBefore + inPhase) / this.total, 1) : 0);

    this.fill.style.width = `${phaseFrac * 100}%`;
    this.fill.classList.toggle("is-rest", this.phase === "rest");
    if (this.sessionFill) this.sessionFill.style.width = `${sessionFrac * 100}%`;
  }
}

window.PhaseBar = PhaseBar;
