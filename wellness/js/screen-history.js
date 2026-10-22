// The phone's back gesture and the browser's Back button step back through a practice page's screens (routine
// list, settings, player) exactly like the on-screen Back buttons, instead of leaving the page part-way through.
// Each screen's Back button names the screen it goes back to in data-back.
(() => {
  const active = () => document.querySelector(".screen.screen-active");
  const backOf = (screen) => screen && screen.querySelector(".back-btn[data-back]");
  const targetOf = (screen) => backOf(screen)?.dataset.back;
  let current = active();
  let popping = false; // moving because of the browser's Back
  let skipPop = 0; // our own history.back() calls, whose popstate isn't a request to go back

  new MutationObserver(() => {
    const next = active();
    if (!next || next === current) return;
    const prev = current;
    current = next;
    if (popping) return;
    if (prev && targetOf(next) === prev.id) history.pushState({ screen: next.id }, "");
    else if (prev && targetOf(prev) === next.id && history.state?.screen === prev.id) { skipPop++; history.back(); }
    else history.replaceState({ screen: next.id }, "");
  }).observe(document.querySelector(".app-main") || document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });

  window.addEventListener("popstate", (e) => {
    if (skipPop) { skipPop--; return; }
    const btn = backOf(current);
    if (!btn) return;
    // Only a step back: the state we've landed on is the screen this one goes back to (or the page's first entry)
    const landed = e.state?.screen;
    if (landed && landed !== targetOf(current)) return;
    popping = true;
    btn.click();
    setTimeout(() => { popping = false; }); // after the screen change has been seen
  });
})();
