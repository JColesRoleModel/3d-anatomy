// The Check-in's sums, scores and comparisons, kept apart from the page so they can be tested on their own.
// Ratings everywhere run 1 (best) to 4 (worst): 1 Easy, 2 Mild, 3 Strained, 4 Can't.

export const COMFORT = ['Easy', 'Mild', 'Strained', "Can't"];

export const median = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
export const mean = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x));
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
};
// The value below which p (0 to 1) of the values fall, nearest-rank.
export function percentile(xs, p) {
  const a = xs.filter((x) => Number.isFinite(x)).sort((q, r) => q - r);
  if (!a.length) return null;
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil(p * a.length) - 1))];
}
const round = (x, places = 0) => (x == null ? null : Math.round(x * 10 ** places) / 10 ** places);

// A small seeded random number generator, so a test can replay the same questions.
export function rng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

// Mental math: two two-digit numbers, added or subtracted (the answer is never negative), never the same sum twice in a row.
export function mathQuestion(rand, last = '') {
  for (;;) {
    const add = rand() < 0.5;
    let a = int(rand, 10, 99), b = int(rand, 10, 99);
    if (!add && b > a) [a, b] = [b, a];
    if (!add && a === b) continue;
    const q = `${a} ${add ? '+' : '−'} ${b}`;
    if (q === last) continue;
    return { q, answer: add ? a + b : a - b };
  }
}

// trials: [{ q, a, ms, ok, at }] where `at` is ms since the test started. Lasts `lengthMs`.
export function scoreMath(trials, lengthMs = 60000) {
  const ok = trials.filter((t) => t.ok);
  const third = lengthMs / 3;
  const early = median(ok.filter((t) => t.at < third).map((t) => t.ms));
  const late = median(ok.filter((t) => t.at >= lengthMs - third).map((t) => t.ms));
  return {
    correct: ok.length,
    errors: trials.length - ok.length,
    medianMs: round(median(ok.map((t) => t.ms))),
    // Above 1 means slower at the end than at the start.
    slowdown: early && late ? round(late / early, 2) : null,
  };
}

// trials: reaction times in ms; falseStarts counted separately.
export function scoreReaction(times, falseStarts = 0) {
  return {
    medianMs: round(median(times)),
    fastestMs: times.length ? round(Math.min(...times)) : null,
    slowest10Ms: round(percentile(times, 0.9)),
    lapses: times.filter((t) => t > 500).length,
    falseStarts,
  };
}

// Dot-jump trials: [{ ms, errPx }]
export function scoreJumps(trials) {
  return { medianMs: round(median(trials.map((t) => t.ms))), meanErrPx: round(mean(trials.map((t) => t.errPx)), 1) };
}

export const avgRating = (ratings) => round(mean(Object.values(ratings || {})), 2);

// The numbers compared from one check-in to the next. better: 'low' or 'high'.
export const METRICS = [
  { id: 'feel.clarity', label: 'Head clarity', unit: 'rating', better: 'low', get: (c) => c.feel?.clarity },
  { id: 'feel.energy', label: 'Energy', unit: 'rating', better: 'low', get: (c) => c.feel?.energy },
  { id: 'feel.mood', label: 'Mood', unit: 'rating', better: 'low', get: (c) => c.feel?.mood },
  { id: 'feel.sleep', label: 'Sleep quality', unit: 'rating', better: 'low', get: (c) => c.feel?.sleep },
  { id: 'feel.sleepHours', label: 'Hours slept', unit: 'h', better: 'high', get: (c) => c.feel?.sleepHours },
  // Right answers per minute: the daily test is 30 seconds (older check-ins ran 60, so the two compare).
  { id: 'math.correct', label: 'Math: right per minute', unit: '', better: 'high', get: (c) => c.modules?.math?.perMin ?? c.modules?.math?.correct },
  { id: 'math.medianMs', label: 'Math: time per answer', unit: 'ms', better: 'low', get: (c) => c.modules?.math?.medianMs },
  { id: 'math.rating', label: 'Math: fog felt', unit: 'rating', better: 'low', get: (c) => c.modules?.math?.rating },
  { id: 'reaction.medianMs', label: 'Reaction time', unit: 'ms', better: 'low', get: (c) => c.modules?.reaction?.medianMs },
  { id: 'reaction.lapses', label: 'Reaction: lapses', unit: '', better: 'low', get: (c) => c.modules?.reaction?.lapses },
  { id: 'breath.holdS', label: 'Breath hold', unit: 's', better: 'high', get: (c) => c.modules?.breath?.holdS },
  { id: 'breath.perMin', label: 'Breaths a minute', unit: '', better: 'low', get: (c) => c.modules?.breath?.perMin },
  { id: 'eyes.comfort', label: 'Eyes: comfort', unit: 'rating', better: 'low', get: (c) => c.modules?.eyes?.avgRating },
  { id: 'eyes.jumpMs', label: 'Eyes: dot-jump time', unit: 'ms', better: 'low', get: (c) => c.modules?.eyes?.jump?.medianMs },
  { id: 'eyes.jumpErr', label: 'Eyes: dot-jump miss', unit: 'px', better: 'low', get: (c) => c.modules?.eyes?.jump?.meanErrPx },
  { id: 'neck.comfort', label: 'Neck & shoulders: comfort', unit: 'rating', better: 'low', get: (c) => c.modules?.neck?.avgRating },
  { id: 'mudras.comfort', label: 'Mudras: ease', unit: 'rating', better: 'low', get: (c) => c.modules?.mudras?.avgRating },
  { id: 'mudras.setMs', label: 'Mudras: time for all 5', unit: 'ms', better: 'low', get: (c) => c.modules?.mudras?.setMs },
  { id: 'mudras.tapsRight', label: 'Finger taps, right (10 s)', unit: '', better: 'high', get: (c) => c.modules?.mudras?.tapsRight },
  { id: 'mudras.tapsLeft', label: 'Finger taps, left (10 s)', unit: '', better: 'high', get: (c) => c.modules?.mudras?.tapsLeft },
];

const DAY = 86400000;
// The average of a metric over the check-ins in the `days` before `now` (not counting `exceptId`).
export function averageOf(metric, checkins, days, now = Date.now(), exceptId = null) {
  const vals = checkins
    .filter((c) => c.id !== exceptId && c.startedAt < now && c.startedAt >= now - days * DAY)
    .map((c) => metric.get(c))
    .filter((v) => Number.isFinite(v));
  return vals.length ? { avg: mean(vals), n: vals.length } : null;
}

// 'better', 'worse' or 'same' (within 3% of the average, or a quarter point on a rating).
export function trend(metric, value, avg) {
  if (value == null || avg == null) return null;
  // Phone angle readings wobble by a few degrees, so under 5° counts as the same.
  const close = metric.unit === 'rating' ? 0.25 : metric.unit === 'deg' ? 5 : Math.max(Math.abs(avg) * 0.03, 1e-9);
  if (Math.abs(value - avg) <= close) return 'same';
  return (value < avg) === (metric.better === 'low') ? 'better' : 'worse';
}

export function fmtMetric(metric, v) {
  if (v == null) return '–';
  if (metric.unit === 'ms') return v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`;
  if (metric.unit === 'deg') return `${Math.round(v)}°`;
  if (metric.unit === 's') return `${v.toFixed(1)} s`;
  if (metric.unit === 'h') return `${v.toFixed(2).replace(/\.?0+$/, '')} h`;
  if (metric.unit === 'px') return `${v.toFixed(1)} px`;
  if (metric.unit === 'rating') return Number.isInteger(v) ? `${v} ${COMFORT[v - 1] || ''}`.trim() : v.toFixed(2);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Hours between a bed time and a wake time ("23:30", "07:15"), across midnight.
export function sleepHours(bed, wake) {
  if (!bed || !wake) return null;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  let d = toMin(wake) - toMin(bed);
  if (d <= 0) d += 1440;
  return round(d / 60, 2);
}

// ---------------------------------------------------------------------------------------------------------------
// Range of motion: the phone's gravity sensor reads how far it tilts from where it was when you were still at the
// start. Only movements that tilt against gravity are measured, since those read within a few degrees.

export const ROM_AREAS = [
  ['neck', 'Neck'], ['shoulders', 'Shoulders'], ['hips', 'Hips'], ['knees', 'Knees'], ['ankles', 'Ankles'],
];
const both = (id, label, area, setup, move) => ['Left', 'Right'].map((side) => ({
  id: `${id}${side[0]}`, label: `${label}, ${side.toLowerCase()}`, area,
  setup: setup.replace(/\{side\}/g, side.toLowerCase()), move: move.replace(/\{side\}/g, side.toLowerCase()),
}));
const FOREHEAD = 'Sit tall with your back against the chair. Hold the phone flat against your forehead, screen facing out.';
export const ROM_MEASURES = [
  { id: 'neckFlex', label: 'Neck: chin to chest', area: 'neck', setup: FOREHEAD, move: 'Slowly drop your chin toward your chest, hold, then come back up.' },
  { id: 'neckExt', label: 'Neck: look up', area: 'neck', setup: FOREHEAD, move: 'Slowly tip your head back to look up, hold, then come back.' },
  ...both('neckSide', 'Neck: ear to shoulder', 'neck', FOREHEAD, 'Tip your {side} ear toward your {side} shoulder without lifting the shoulder, hold, then come back.'),
  ...both('neckRot', 'Neck: turn', 'neck', 'Lie on your back, head on the floor or bed without a pillow. Hold the phone flat on your forehead.', 'Roll your head to look {side}, hold, then come back to the middle.'),
  ...both('shFlex', 'Shoulder: arm forward and up', 'shoulders', 'Stand tall, {side} arm straight down by your side. Hold the phone flat along the outside of that forearm (an armband is easiest).', 'Raise the straight arm forward and up as high as it goes, hold, then lower it.'),
  ...both('shAbd', 'Shoulder: arm out to the side and up', 'shoulders', 'Stand tall, {side} arm straight down by your side, phone along the outside of the forearm.', 'Raise the straight arm out to the side and up, hold, then lower it.'),
  ...both('slr', 'Hip: straight-leg raise', 'hips', 'Lie on your back, legs straight. Rest the phone flat on the front of your {side} shin (a long sock or band holds it).', 'Keeping the knee straight, raise the leg as high as is comfortable, hold, then lower it.'),
  ...both('hipFlex', 'Hip: knee to chest', 'hips', 'Lie on your back, legs straight. Hold the phone flat on the front of your {side} thigh.', 'Draw the knee toward your chest, hold, then straighten the leg back down.'),
  ...both('hipIR', 'Hip: turn in', 'hips', 'Sit on a high chair or table edge, knees bent, feet hanging. Phone flat against the outside of the {side} shin.', 'Keeping the thigh still, swing the foot outward (this turns the hip in), hold, then come back.'),
  ...both('hipER', 'Hip: turn out', 'hips', 'Sit on a high chair or table edge, knees bent, feet hanging. Phone flat against the inside of the {side} shin.', 'Keeping the thigh still, swing the foot inward (this turns the hip out), hold, then come back.'),
  ...both('kneeFlex', 'Knee: bend', 'knees', 'Lie on your stomach, legs straight. Phone flat on the back of your {side} shin (a band or sock holds it).', 'Bend the knee to bring the heel toward your bottom, hold, then lower it.'),
  ...both('ankleDorsi', 'Ankle: knee to wall', 'ankles', 'Stand facing a wall, {side} foot forward, heel down. Hold the phone flat on the front of that shin, shin upright.', 'Bend the knee toward the wall, keeping the heel on the floor, hold, then straighten up.'),
];
for (const m of ROM_MEASURES) {
  METRICS.push({ id: `rom.${m.id}`, label: m.label, unit: 'deg', better: 'high', get: (c) => c.modules?.rom?.measures?.[m.id]?.deg });
}

// Angle in degrees between two gravity readings [x, y, z].
export function angleBetween(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const n = Math.hypot(...a) * Math.hypot(...b);
  if (!n) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / n))) * 180) / Math.PI;
}

// ---------------------------------------------------------------------------------------------------------------
// The body parts behind each range-of-motion measure, for "See it on the body": the muscles that make the movement
// and the main ones whose tightness limits it (standard anatomy). Names are the 3D model's, without .l / .r.
// `same` are on the side measured (both sides for a middle measure), `opp` on the other side.
const NECK_FRONT = ['Sternocleidomastoid muscle', 'Longus colli muscle', 'Longus capitis muscle', 'Scalenus anterior muscle'];
const NECK_BACK = ['Splenius capitis muscle', 'Splenius colli muscle', 'Semispinalis colli muscle', 'Descending part of trapezius muscle', 'Rectus posterior major capitis muscle', 'Levator scapulae'];
const HAMSTRINGS = ['Long head of biceps femoris', 'Short head of biceps femoris', 'Semitendinosus muscle', 'Semimembranosus muscle'];
const HIP_FLEXORS = ['Psoas major', 'Iliacus muscle', 'Rectus femoris muscle'];
const DEEP_ROTATORS = ['Piriformis muscle', 'Obturator internus', 'Quadratus femoris muscle'];
export const ROM_PARTS = {
  neckFlex: { same: [...NECK_FRONT, ...NECK_BACK] },
  neckExt: { same: [...NECK_BACK, ...NECK_FRONT] },
  neckSide: { same: ['Scalenus anterior muscle', 'Scalenus medius muscle', 'Scalenus posterior muscle', 'Sternocleidomastoid muscle', 'Levator scapulae', 'Descending part of trapezius muscle'], opp: ['Scalenus medius muscle', 'Descending part of trapezius muscle', 'Levator scapulae'] },
  neckRot: { same: ['Splenius capitis muscle', 'Splenius colli muscle', 'Obliquus inferior capitis muscle', 'Levator scapulae'], opp: ['Sternocleidomastoid muscle', 'Semispinalis colli muscle'] },
  shFlex: { same: ['Clavicular part of deltoid muscle', 'Clavicular head of pectoralis major muscle', 'Coracobrachialis muscle', 'Long head of biceps brachii', 'Serratus anterior muscle', 'Latissimus dorsi muscle', 'Teres major muscle'] },
  shAbd: { same: ['Acromial part of deltoid muscle', 'Supraspinatus muscle', 'Serratus anterior muscle', 'Descending part of trapezius muscle', 'Latissimus dorsi muscle', 'Teres major muscle'] },
  slr: { same: [...HIP_FLEXORS, ...HAMSTRINGS] },
  hipFlex: { same: [...HIP_FLEXORS, 'Gluteus maximus muscle'] },
  hipIR: { same: ['Gluteus minimus muscle', 'Tensor fasciae latae', ...DEEP_ROTATORS] },
  hipER: { same: [...DEEP_ROTATORS, 'Gluteus maximus muscle', 'Sartorius muscle', 'Gluteus minimus muscle', 'Tensor fasciae latae'] },
  kneeFlex: { same: [...HAMSTRINGS, 'Rectus femoris muscle', 'Vastus lateralis muscle', 'Vastus medialis muscle'] },
  ankleDorsi: { same: ['Tibialis anterior muscle', 'Soleus muscle', 'Medial head of gastrocnemius', 'Lateral head of gastrocnemius'] },
};
// [{ name, side }] for one measure id, e.g. 'neckRotL' → the left splenius, the right sternocleidomastoid…
export function partsOfMeasure(id) {
  const m = /^(.*?)([LR])?$/.exec(id);
  const base = ROM_PARTS[m[1]];
  if (!base) return [];
  const side = m[2]?.toLowerCase() || null, other = side === 'l' ? 'r' : 'l';
  const out = [];
  for (const name of base.same || []) for (const s of side ? [side] : ['l', 'r']) out.push({ name, side: s });
  for (const name of side ? base.opp || [] : []) out.push({ name, side: other });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// What helps: each score on check-ins that had an activity in the 24 hours before them, against check-ins that
// didn't. entries: [{ at (ms), seconds, kind }] where kind names the activity ('Breathwork', 'Watch'…). A pair is
// only compared once both sides have `minN` check-ins, and the counts always show.
export const HELPS_METRICS = ['feel.clarity', 'feel.energy', 'math.correct', 'reaction.medianMs', 'breath.holdS', 'neck.comfort'];
export function whatHelps(checkins, entries, { minN = 7, windowMs = 86400000, metricIds = HELPS_METRICS } = {}) {
  const kinds = [...new Set(entries.map((e) => e.kind))].sort();
  const rows = [], waiting = [];
  for (const kind of kinds) {
    const times = entries.filter((e) => e.kind === kind && e.seconds >= 60).map((e) => e.at).sort((a, b) => a - b);
    const had = (c) => times.some((t) => t <= c.startedAt && t > c.startedAt - windowMs);
    for (const id of metricIds) {
      const m = METRICS.find((x) => x.id === id);
      const withIt = [], without = [];
      for (const c of checkins) {
        const v = m.get(c);
        if (!Number.isFinite(v)) continue;
        (had(c) ? withIt : without).push(v);
      }
      if (withIt.length >= minN && without.length >= minN) {
        const a = mean(withIt), b = mean(without);
        rows.push({ kind, metric: m, with: a, without: b, nWith: withIt.length, nWithout: without.length, trend: trend(m, a, b) });
      } else if (withIt.length + without.length) {
        waiting.push({ kind, metric: m, nWith: withIt.length, nWithout: without.length });
      }
    }
  }
  return { rows, waiting };
}
