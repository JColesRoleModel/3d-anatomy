// The living night sky behind the wellness pages, in the spirit of the 3D site's: twinkling stars that breathe on
// the same nine-second cycle, a few coloured ones, and a shooting star every few seconds. Drawn on one canvas.
(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.createElement('canvas');
  canvas.className = 'hub-sky';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const TINTS = ['255,255,255', '255,244,214', '214,226,255', '230,189,106', '199,170,255', '159,227,192'];
  let w = 0, h = 0, dpr = 1, stars = [], streaks = [], nextStreak = 2;

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(w * h / 1700);
    stars = Array.from({ length: n }, () => {
      const big = Math.random() < 0.06;
      return {
        x: Math.random() * w, y: Math.random() * h,
        r: big ? 1.1 + Math.random() * 1.1 : 0.3 + Math.random() * 0.8,
        tint: TINTS[Math.random() < 0.75 ? 0 : 1 + Math.floor(Math.random() * (TINTS.length - 1))],
        base: 0.35 + Math.random() * 0.6, speed: 0.6 + Math.random() * 2.2, phase: Math.random() * Math.PI * 2, big,
      };
    });
  }

  function streak() {
    const fromLeft = Math.random() < 0.5;
    streaks.push({
      x: fromLeft ? Math.random() * w * 0.6 : w * 0.4 + Math.random() * w * 0.6, y: Math.random() * h * 0.45,
      vx: (fromLeft ? 1 : -1) * (650 + Math.random() * 350), vy: 260 + Math.random() * 220,
      life: 0, max: 0.7 + Math.random() * 0.5,
    });
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    const t = now / 1000;
    const breath = 0.82 + 0.18 * Math.sin(t * Math.PI * 2 / 9); // the slow nine-second breath
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const a = still ? s.base : s.base * breath * (0.55 + 0.45 * Math.sin(t * s.speed + s.phase));
      ctx.fillStyle = `rgba(${s.tint},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      if (s.big) { // a soft halo and a faint cross on the brightest
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 6);
        g.addColorStop(0, `rgba(${s.tint},${(a * 0.35).toFixed(3)})`); g.addColorStop(1, `rgba(${s.tint},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${s.tint},${(a * 0.4).toFixed(3)})`; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(s.x - s.r * 5, s.y); ctx.lineTo(s.x + s.r * 5, s.y); ctx.moveTo(s.x, s.y - s.r * 5); ctx.lineTo(s.x, s.y + s.r * 5); ctx.stroke();
      }
    }
    if (!still) {
      nextStreak -= dt;
      if (nextStreak <= 0) { streak(); nextStreak = 3 + Math.random() * 6; }
      streaks = streaks.filter((m) => (m.life += dt) < m.max);
      for (const m of streaks) {
        const k = m.life / m.max, fade = Math.sin(k * Math.PI);
        const x = m.x + m.vx * m.life, y = m.y + m.vy * m.life;
        const tx = x - m.vx * 0.12, ty = y - m.vy * 0.12;
        const g = ctx.createLinearGradient(x, y, tx, ty);
        g.addColorStop(0, `rgba(255,248,225,${(0.9 * fade).toFixed(3)})`); g.addColorStop(1, 'rgba(255,248,225,0)');
        ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
      }
    }
    if (!still) requestAnimationFrame(frame);
  }

  resize();
  addEventListener('resize', () => { resize(); if (still) requestAnimationFrame(frame); });
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });
})();
