// Search: one box that finds anything on the 3D page — every part of the body, groups of parts (like "Rotator cuff
// muscles"), the systems and their filters, every occult symbol (chakras, sephiroth, mudras, nadis…) and what's
// written on its card, and the Conditions studies. Typing part of a word is enough ("levator" finds levator scapulae),
// small typos are forgiven, and everyday names work too ("collarbone", "lats", "third eye").
// Picking a result turns on whatever layer it needs and flies to it.

const $ = (id) => document.getElementById(id);
const RECENT_KEY = 'tolnri.search.recent.v1';
const MAX_RESULTS = 40;

// Everyday words for the anatomical names the model uses. Each query word also matches any of these.
const SYNONYMS = {
  lat: ['latissimus'], lats: ['latissimus'], trap: ['trapezius'], traps: ['trapezius'],
  pec: ['pectoralis'], pecs: ['pectoralis'], delt: ['deltoid'], delts: ['deltoid'],
  glute: ['gluteus', 'gluteal'], glutes: ['gluteus', 'gluteal'], abs: ['abdominis', 'abdominal'], quad: ['quadriceps', 'vastus', 'rectus femoris'],
  quads: ['quadriceps', 'vastus', 'rectus femoris'], hamstring: ['biceps femoris', 'semitendinosus', 'semimembranosus'],
  hamstrings: ['biceps femoris', 'semitendinosus', 'semimembranosus'], calf: ['gastrocnemius', 'soleus', 'sural'],
  calves: ['gastrocnemius', 'soleus'], bicep: ['biceps'], tricep: ['triceps'], scm: ['sternocleidomastoid'],
  rhomboids: ['rhomboid'], obliques: ['oblique'], lumbricals: ['lumbrical'],
  collarbone: ['clavicle'], kneecap: ['patella'], shin: ['tibia'], shinbone: ['tibia'], thighbone: ['femur'],
  skull: ['cranium', 'cranial'], jaw: ['mandible', 'maxilla'], jawbone: ['mandible'], cheekbone: ['zygomatic'],
  breastbone: ['sternum'], tailbone: ['coccyx'], spine: ['vertebral', 'vertebra', 'spinal'], backbone: ['vertebral'],
  vertebrae: ['vertebra'], ribcage: ['ribs', 'thoracic'], hip: ['hip', 'coxal', 'pelvic'], hipbone: ['hip bone', 'coxal'],
  pelvis: ['pelvic', 'pelvis'], wrist: ['carpal', 'wrist'], ankle: ['talocrural', 'ankle', 'tarsal'], toe: ['phalanx', 'hallux', 'toe'],
  finger: ['finger', 'phalanx'], thumb: ['thumb', 'pollicis'], pinky: ['little finger', 'digiti minimi'], heel: ['calcaneus', 'calcaneal'],
  windpipe: ['trachea'], gullet: ['oesophagus'], esophagus: ['oesophagus'], esophageal: ['oesophageal'], voicebox: ['larynx', 'laryngeal'],
  adrenal: ['suprarenal'], adrenals: ['suprarenal'], pituitary: ['hypophysis', 'adenohypophysis', 'neurohypophysis', 'pituitary'],
  heart: ['heart', 'cardiac', 'ventricle', 'atrium', 'coronary'], brain: ['brain', 'cerebral', 'cerebrum', 'cerebellum', 'midbrain'],
  belly: ['umbilicus', 'abdominal'], bellybutton: ['umbilicus'], navel: ['umbilicus'], armpit: ['axilla', 'axillary'],
  gut: ['intestine', 'colon', 'jejunum', 'ileum'], bowel: ['colon', 'intestine'], womb: ['uterus'], testicle: ['testis'], testicles: ['testis'],
  lymph: ['lymph', 'lymphatic', 'nodes'], gland: ['gland'], tonsil: ['tonsil'], nerve: ['nerve'],
  third: ['3rd'], '3rd': ['third'], solar: ['solar'], pinecone: ['pineal'],
  sephirot: ['sephira', 'sephiroth'], sephiroth: ['sephira'], sefirot: ['sephira'], kabbalah: ['tree of life'], qabalah: ['tree of life'],
  winging: ['winging'], winged: ['winging'],
};
// Phrases worth swapping as a whole before the words are matched.
const PHRASES = [
  ['shoulder blade', 'scapula'], ['thigh bone', 'femur'], ['shin bone', 'tibia'], ['collar bone', 'clavicle'],
  ['voice box', 'larynx'], ['belly button', 'umbilicus'], ['tail bone', 'coccyx'], ['breast bone', 'sternum'],
  ['third eye', 'ajna'], ['crown chakra', 'sahasrara'], ['root chakra', 'muladhara'], ['heart chakra', 'anahata'],
  ['throat chakra', 'visuddha'], ['sacral chakra', 'svadhisthana'], ['solar plexus chakra', 'manipura'],
  ['funny bone', 'ulnar nerve'], ['adams apple', 'thyroid cartilage'], ['rotator cuff', 'rotator cuff muscles'],
];
const OCCULT_KIND = (layer, item) => (layer === 'hands' && item.id.startsWith('mudra-') ? 'Mudra'
  : { chakras: 'Chakra', elements: 'Element', trinity: 'Gland trinity', hands: 'Hand map', tree: 'Tree of Life', nadis: 'Nadi', polarity: 'Polarity' }[layer] || 'Occult');
const SIDE_WORDS = { left: 'l', right: 'r' };

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);

// Optimal string alignment distance, giving up once it passes max.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
const allowedTypos = (len) => (len < 4 ? 0 : len < 7 ? 1 : 2);

// How well one query word matches one word of a name: 0 is no match. Remembered for the search being run, since the
// same few thousand words come up again and again.
let memo = new Map();
function wordScore(q, w) {
  const id = `${q}|${w}`;
  let v = memo.get(id);
  if (v === undefined) memo.set(id, (v = rawWordScore(q, w)));
  return v;
}
function rawWordScore(q, w) {
  if (w === q) return 1;
  if (w.startsWith(q)) return 0.85 + 0.1 * (q.length / w.length);
  if (q.length >= 3 && w.includes(q)) return 0.6;
  const k = allowedTypos(q.length);
  if (!k || w.length < 3) return 0;
  // A typo in a whole word, or in the start of a longer word ("levatr" for "levator", "scapu" for "scapulae").
  if (editDistance(q, w, k) <= k) return 0.55;
  if (w.length > q.length && editDistance(q, w.slice(0, q.length), k) <= k) return 0.45;
  return 0;
}
// The best match for a query word (or any of its everyday synonyms) among a list of words.
function bestIn(alts, list) {
  let best = 0, at = -1;
  for (const alt of alts) {
    const parts = alt.split(' ');
    for (let i = 0; i < list.length; i++) {
      let s = wordScore(parts[0], list[i]);
      // A multi-word synonym ("biceps femoris") has to match words in a row.
      for (let p = 1; s && p < parts.length; p++) s = list[i + p] && wordScore(parts[p], list[i + p]) ? s : 0;
      if (alt !== alts[0]) s *= 0.9;
      if (s > best) { best = s; at = i; }
    }
  }
  return { s: best, at };
}

export function initSearch(api) {
  const entries = buildIndex(api);
  let recent = [];
  try { recent = (JSON.parse(localStorage.getItem(RECENT_KEY)) || []).filter((id) => entries.byId.has(id)); } catch {}

  const box = $('search');
  const input = $('search-input');
  const list = $('search-results');
  const hint = $('search-hint');
  let results = [], active = 0;

  function open(text) {
    box.hidden = false;
    document.body.classList.add('searching');
    if (typeof text === 'string') input.value = text;
    run();
    input.focus();
    input.select();
    fitToScreen();
  }
  function close() {
    if (box.hidden) return;
    box.hidden = true;
    document.body.classList.remove('searching');
    input.blur();
  }

  // On phones the keyboard covers the bottom of the screen, so keep the list above it.
  function fitToScreen() {
    const vv = window.visualViewport;
    const h = vv ? vv.height + vv.offsetTop : window.innerHeight;
    const top = list.getBoundingClientRect().top;
    list.style.maxHeight = `${Math.max(160, h - top - 16)}px`;
  }
  window.visualViewport?.addEventListener('resize', () => !box.hidden && fitToScreen());
  window.addEventListener('resize', () => !box.hidden && fitToScreen());

  function run() {
    const q = input.value;
    results = q.trim() ? search(entries, q) : recent.map((id) => ({ e: entries.byId.get(id), marks: [] })).filter((r) => r.e);
    active = 0;
    render(q);
  }

  function render(q) {
    list.replaceChildren();
    const empty = !q.trim();
    hint.hidden = !(empty || !results.length);
    hint.innerHTML = empty
      ? (recent.length ? '<b>Recent</b>' : 'Search every part of the body, the chakras, the Tree of Life, mudras and more. Try <i>levator</i>, <i>vagus</i>, <i>third eye</i> or <i>Keter</i>.')
      : `Nothing on the page matches "${esc(q.trim())}". Try fewer letters, or another name for it.`;
    if (empty && recent.length) hint.hidden = false;
    results.forEach((r, i) => {
      const li = document.createElement('li');
      li.id = `search-opt-${i}`;
      li.setAttribute('role', 'option');
      li.className = 'search-row';
      li.setAttribute('aria-selected', i === active);
      li.innerHTML = `${r.e.icon || `<span class="search-dot" style="--c:${r.e.color || '#e6bd6a'}"></span>`}
        <span class="search-text"><span class="search-name">${markUp(r.e.name, r.marks)}</span><span class="search-sub">${esc(r.why || r.e.sub || '')}</span></span>
        <span class="search-kind">${esc(r.e.kind)}</span>`;
      li.addEventListener('pointerdown', (ev) => ev.preventDefault()); // keep the keyboard up until the pick
      li.addEventListener('click', () => choose(i));
      li.addEventListener('pointermove', () => { if (active !== i) { active = i; syncActive(); } });
      list.append(li);
    });
    input.setAttribute('aria-activedescendant', results.length ? `search-opt-${active}` : '');
  }
  function syncActive() {
    [...list.children].forEach((li, i) => li.setAttribute('aria-selected', i === active));
    list.children[active]?.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', results.length ? `search-opt-${active}` : '');
  }

  function choose(i) {
    const r = results[i];
    if (!r) return;
    recent = [r.e.id, ...recent.filter((id) => id !== r.e.id)].slice(0, 8);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch {}
    close();
    api.before?.();
    r.e.go(r.side);
  }

  input.addEventListener('input', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { active = Math.min(results.length - 1, active + 1); syncActive(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); syncActive(); }
    else if (e.key === 'Enter') choose(active);
    else if (e.key === 'Escape') { if (input.value) { input.value = ''; run(); } else close(); }
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  $('search-close').addEventListener('click', close);
  // Tapping the body (or anywhere else) puts the search away.
  document.addEventListener('pointerdown', (e) => {
    if (!box.hidden && !box.contains(e.target) && !e.target.closest('[data-search-open]')) close();
  });
  for (const b of document.querySelectorAll('[data-search-open]')) b.addEventListener('click', () => (box.hidden ? open() : close()));

  return { open, close, get isOpen() { return !box.hidden; }, query: (q) => search(entries, q) };
}

// ---------- The index ----------
function buildIndex(api) {
  const { structures, systems, systemsById, prettyName } = api;
  const list = [];
  const add = (e) => {
    e.words = words(e.name);
    e.extra = words(e.alt || '');
    e.normName = norm(e.name);
    list.push(e);
  };
  const sysName = (id) => systemsById[id]?.name || id;
  const sysColor = (id) => systemsById[id]?.color;

  // Parts: a left and right pair is one result (both sides show); "left" or "right" in the search picks one side.
  const parts = new Map();
  for (const [key, s] of structures) {
    const side = /\.([lr])$/.exec(s.name)?.[1] || null;
    const base = s.name.replace(/\.[lr]$/, '');
    const id = `p:${s.file}/${base}`;
    if (!parts.has(id)) parts.set(id, { base, s, keys: {} });
    parts.get(id).keys[side || 'one'] = key;
  }
  for (const [id, p] of parts) {
    const { s, keys } = p;
    const sides = [keys.r, keys.l].filter(Boolean);
    const all = keys.one ? [keys.one, ...sides] : sides;
    const where = s.groups[s.groups.length - 1];
    add({
      id, kind: 'Part', name: p.base.trim(), color: s.color || sysColor(s.tags[0]),
      sub: [s.tags.map(sysName).join(' · '), where, sides.length === 2 ? 'both sides' : sides.length ? (keys.r ? 'right' : 'left') : ''].filter(Boolean).join(' · '),
      alt: `${s.tags.map(sysName).join(' ')} ${s.groups.join(' ')}`,
      sides: keys,
      rank: 0,
      go: (side) => {
        const one = side && keys[side];
        const show = one ? [one] : all;
        api.showPart(show, one ? prettyName(structures.get(one).name) : p.base.trim(), one || keys.r || keys.one || keys.l);
      },
    });
  }

  // Groups of parts, as the model names them ("Cranial nerves", "Rotator cuff muscles").
  const groups = new Map();
  for (const [key, s] of structures) {
    for (const g of s.groups) {
      const id = `g:${s.file}/${g}`;
      if (!groups.has(id)) groups.set(id, { g, s, keys: [] });
      groups.get(id).keys.push(key);
    }
  }
  for (const [id, { g, s, keys }] of groups) {
    if (keys.length < 2) continue;
    add({
      id, kind: 'Group', name: g, color: sysColor(s.tags[0]),
      sub: `${sysName(s.tags[0])} · ${keys.length} parts`,
      alt: s.tags.map(sysName).join(' '),
      rank: 0.15,
      go: () => api.showGroup(keys, g),
    });
  }

  // Systems and their filters ("Deep" muscles, "Ethmoid" sinuses).
  for (const sys of systems) {
    add({ id: `s:${sys.id}`, kind: 'System', name: sys.name, color: sys.color, sub: 'Turn this system on', alt: 'system layer', rank: 0.3, go: () => api.showSystem(sys.id) });
    for (const fc of sys.facets || []) {
      for (const o of fc.options) {
        const k = `${sys.id}.${fc.id}`;
        const keys = [...structures].filter(([, s]) => s.f?.[k] === o.id).map(([key]) => key);
        if (!keys.length) continue;
        add({
          id: `f:${k}:${o.id}`, kind: 'Filter', name: `${o.name} (${sys.name})`, color: sys.color,
          sub: `${sys.name} · ${fc.name} · ${keys.length} parts`, alt: `${fc.name} ${sys.name}`, rank: 0.2,
          go: () => api.showGroup(keys, `${o.name} (${sys.name})`),
        });
      }
    }
  }

  // Occult anatomy: each layer, each symbol, and what's written on its card (so "saturn" or "zaphikiel" finds Sahasrara).
  for (const layer of api.occult?.catalog || []) {
    add({ id: `ol:${layer.id}`, kind: 'Occult layer', name: layer.name, color: layer.color, icon: api.occult.iconHTML(layer, 'search-icon'), sub: 'Occult anatomy · turn this layer on', alt: 'occult', rank: 0.3, go: () => api.occult.showLayer(layer.id) });
    for (const item of layer.items) {
      add({
        id: `o:${layer.id}/${item.id}`, kind: OCCULT_KIND(layer.id, item), name: item.name, color: item.color || layer.color,
        icon: api.occult.iconHTML(item.icon || item.glyph || item.color ? item : layer, 'search-icon'),
        sub: [layer.name, item.sub].filter(Boolean).join(' · '),
        alt: `${item.sub || ''} ${layer.name} occult`,
        fields: (item.fields || []).map((f) => ({ k: f.k, v: String(f.v), w: words(f.v) })),
        rank: 0.05,
        go: () => api.occult.open(layer.id, item.id),
      });
    }
  }

  // Conditions: the study and each of its types.
  const cond = api.conditions?.catalog;
  if (cond) {
    add({ id: `c:${cond.id}`, kind: 'Condition', name: cond.name, color: '#e6bd6a', sub: 'Conditions · open the study', alt: 'condition study', rank: 0.1, go: () => api.conditions.open() });
    for (const t of (cond.types || []).filter((t) => t.id !== 'normal')) {
      add({ id: `c:${cond.id}/${t.id}`, kind: 'Condition', name: `${t.name} ${cond.name.toLowerCase()}`, color: '#e6bd6a', sub: `${cond.name} · ${t.name}`, alt: `${cond.name} condition`, rank: 0.12, go: () => api.conditions.open({ type: t.id }) });
    }
  }

  list.byId = new Map(list.map((e) => [e.id, e]));
  return list;
}

// ---------- Matching ----------
function search(entries, raw) {
  memo = new Map();
  let q = norm(raw);
  // "left levator scapulae" / "levator scapulae right" picks a side.
  let side = null;
  q = q.split(' ').filter((w) => { if (SIDE_WORDS[w]) { side = SIDE_WORDS[w]; return false; } return true; }).join(' ');
  const variants = [q];
  for (const [from, to] of PHRASES) if (` ${q} `.includes(` ${from} `)) variants.push(` ${q} `.replace(` ${from} `, ` ${to} `).trim());
  const out = [];
  for (const e of entries) {
    let best = null;
    for (const v of variants) {
      const r = scoreEntry(e, v.split(' ').filter(Boolean), v);
      if (r && (!best || r.score > best.score)) best = r;
    }
    if (!best) continue;
    if (side && e.sides) {
      if (!e.sides[side]) continue;
      best.side = side;
      best.why = e.sub.replace('both sides', side === 'r' ? 'right side' : 'left side');
      best.score += 0.2;
    }
    out.push({ e, ...best });
  }
  out.sort((a, b) => b.score - a.score || a.e.name.length - b.e.name.length);
  return out.slice(0, MAX_RESULTS);
}

function scoreEntry(e, qs, q) {
  if (!qs.length) return null;
  let total = 0, inName = 0, last = -1, inOrder = true;
  const marks = [];
  let why = '';
  for (const w of qs) {
    const alts = [w, ...(SYNONYMS[w] || [])];
    const n = bestIn(alts, e.words);
    if (n.s) {
      total += n.s; inName++;
      marks.push(n.at);
      if (n.at < last) inOrder = false;
      last = n.at;
      continue;
    }
    const x = bestIn(alts, e.extra);
    if (x.s >= 0.45) { total += x.s * 0.45; continue; }
    // Occult cards: match the values written on them.
    let hit = null;
    for (const f of e.fields || []) {
      const m = bestIn(alts, f.w);
      if (m.s >= 0.55 && (!hit || m.s > hit.s)) hit = { s: m.s, f };
    }
    if (hit) { total += hit.s * 0.5; why ||= `${hit.f.k}: ${hit.f.v}`; continue; }
    return null; // every word has to match something
  }
  if (!inName && !why && qs.length === 1 && e.kind !== 'Part') return null; // a lone word only in the extra text is too loose
  let score = total / qs.length;
  if (inName === qs.length) score += 0.5;
  if (inOrder && inName > 1) score += 0.1;
  if (e.normName === q) score += 1.5;
  else if (e.normName.startsWith(q)) score += 0.6;
  // Fewer extra words in the name means a closer match ("Levator scapulae" before "Levator palpebrae superioris").
  score -= 0.03 * Math.max(0, e.words.length - qs.length);
  score -= e.rank || 0;
  return { score, marks, why };
}

// Bold the matched words of a name.
function markUp(name, marks) {
  if (!marks?.length) return esc(name);
  const set = new Set(marks);
  let i = -1;
  return name.split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok) || !norm(tok)) return esc(tok);
    // A token like "(X)." can hold several words or none; count the words it holds.
    const n = words(tok).length;
    const hit = [...Array(n)].some((_, j) => set.has(i + 1 + j));
    i += n;
    return hit ? `<mark>${esc(tok)}</mark>` : esc(tok);
  }).join('');
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
export const _test = { buildIndex, search };
