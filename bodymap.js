// "See it on the body": ?view=3d&checkin=latest (or a check-in's id) colours the muscles behind each range-of-motion
// measure in that check-in against your 7-day average: green better, gold about the same, red worse, cream when there
// is no average yet. Tapping a part shows its numbers. The colours are only for this visit and are not saved.
import { ROM_MEASURES, METRICS, averageOf, trend, fmtMetric, partsOfMeasure } from './checkin/logic.js';

const COLOR = { better: '#3fe08f', same: '#e6bd6a', worse: '#ff6b5e', none: '#f6e3b4' };
const RANK = { worse: 3, same: 2, better: 1, none: 0 };

export function initBodyMap(api) {
  const want = new URLSearchParams(location.search).get('checkin');
  if (!want) return;
  let done = false;
  api.hub.onUser(async (user) => {
    if (!user || done) return;
    done = true;
    let list;
    try {
      list = await api.account.readCollectionSince(user.uid, 'checkins', 'startedAt', Date.now() - 60 * 86400000);
    } catch (err) { api.note("Couldn't read your check-ins just now."); console.error(err); return; }
    list.sort((a, b) => b.startedAt - a.startedAt);
    // The chosen check-in, or the latest one with range of motion in it.
    const c = want === 'latest' ? list.find((x) => x.modules?.rom?.measures) : list.find((x) => x.id === want);
    if (!c?.modules?.rom?.measures) { api.note('No range-of-motion check-in in the last 60 days to show on the body yet.'); return; }
    const byKey = new Map(); // structure key -> { trend, lines[] }
    for (const m of ROM_MEASURES) {
      const metric = METRICS.find((x) => x.id === `rom.${m.id}`);
      const v = metric.get(c);
      if (!Number.isFinite(v)) continue;
      const avg = averageOf(metric, list, 7, c.startedAt, c.id);
      const tr = trend(metric, v, avg?.avg ?? null) || 'none';
      const line = `${m.label}: ${fmtMetric(metric, v)}${avg ? ` (7-day average ${fmtMetric(metric, avg.avg)})` : ' (no 7-day average yet)'}`;
      for (const p of partsOfMeasure(m.id)) {
        const key = api.keyOf(`${p.name}.${p.side}`);
        if (!key) continue;
        const cur = byKey.get(key) || { trend: 'none', lines: [] };
        if (RANK[tr] > RANK[cur.trend]) cur.trend = tr;
        cur.lines.push(line);
        byKey.set(key, cur);
      }
    }
    if (!byKey.size) { api.note('That check-in has no range-of-motion numbers to show.'); return; }
    for (const [key, x] of byKey) { api.tint.set(key, COLOR[x.trend]); api.notes.set(key, x.lines.join('\n')); }
    const when = new Date(c.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    api.show([...byKey.keys()], `Check-in ${when}`);
    api.note('Green: better than your 7-day average. Gold: about the same. Red: worse. Tap a muscle for its numbers.');
  });
}
