// Path tracing: follow an artery, vein or nerve back to where it starts (the heart, the brainstem or the spinal
// cord), out to everything that branches from it, or along the route between two parts. The branching comes from
// data/paths.json (built by tools/paths.mjs). Traced parts stay solid while everything else fades, a pulse runs
// along them in the direction blood or signals travel, and dotted lines bridge the joins the model doesn't draw.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const NAME = (k) => k.slice(k.indexOf('/') + 1);
const BLOOD_SPEED = 0.12, NERVE_SPEED = 0.16, WAVE = 0.09; // metres per second, metres between pulses

// Which way signals run along a nerve: out from the brain and spinal cord (commands), in (feeling), or both.
const FEEL = /Posterior (horn|root of spinal nerve)|Spinal ganglion|Sensory root|Optic|Olfactory|Vestibul|cochlear|Lateral geniculate|solitary tract|cutaneous|Sural nerve|Dorsal digital branches of superficial/;
const MOVE = /Anterior (horn|root of spinal nerve)|Motor root|Motor nucleus|Oculomotor|oculomotor|Trochlear|trochlear|Abducens|abducens|Accessory nerve|accessory nerve|Hypoglossal|hypoglossal|salivatory|ambiguus|Posterior nucleus of vagus|Intermediolateral|Sympathetic|sympathetic|Long thoracic|Dorsal scapular|Thoracodorsal|subscapular nerve|pectoral nerve|Subclavian nerve|Nerve to |gluteal nerve|Muscular branches/;

export async function initTrace(ctx) {
  // ctx: { scene, camera, structures, prettyName, show(keys, label) -> Set, isolated() -> Set|null, select(key),
  //        focusOnKeys(keys), focusPoint(center, radius), applyVisibility(), render(), motion() -> bool }
  const data = await fetch('data/paths.json').then((r) => r.json());
  const nodes = data.nodes;
  const up = new Map(), down = new Map(); // key -> edges to its parents / children
  for (const e of data.edges) {
    (up.get(e.c) || up.set(e.c, []).get(e.c)).push(e);
    (down.get(e.p) || down.set(e.p, []).get(e.p)).push(e);
  }
  const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  const short = (k) => ctx.prettyName(NAME(k)).replace(/ of brachial plexus/, '').replace(/ \((right|left)\)/, '');
  const lower = (t) => (/^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t); // for names inside a sentence

  function walk(start, dir) { // every part reached from start, going up (to the source) or down (to the branches)
    const seen = new Set([start]), stack = [start], map = dir === 'up' ? up : down;
    while (stack.length) for (const e of map.get(stack.pop()) || []) {
      const k = dir === 'up' ? e.p : e.c;
      if (!seen.has(k)) { seen.add(k); stack.push(k); }
    }
    return seen;
  }
  const roots = (set) => [...set].filter((k) => !(up.get(k) || []).some((e) => set.has(e.p)));
  const kindOf = (k) => nodes[k]?.kind;
  const isVessel = (k) => ['artery', 'vein', 'heart'].includes(kindOf(k));
  const flowOf = (k) => {
    const kind = kindOf(k);
    if (kind === 'artery') return 1;
    if (kind === 'vein') return -1;
    const n = NAME(k);
    if (FEEL.test(n)) return -1;
    if (MOVE.test(n)) return 1;
    return 0;
  };
  // Where a vessel starts, for the card's words.
  const source = (k) => {
    if (kindOf(k) === 'heart') return NAME(k);
    const anc = walk(k, 'up');
    if (anc.size === 1) return null; // nothing above it in the model
    const r = roots(anc).map(NAME);
    if (r.includes('Right ventricle')) return 'lungs-out';
    if (r.includes('Left atrium')) return 'lungs-in';
    if (r.includes('Left ventricle')) return 'body-out';
    if (r.includes('Right atrium')) return 'body-in';
    if (r.some((n) => /spinal cord|Intermediolateral/.test(n))) return 'spinal cord';
    if (r.some((n) => /geniculate/.test(n))) return 'brain';
    return r.length ? 'brainstem' : null;
  };

  // ---------- What is traced right now ----------
  let current = null; // { mode, a, b, keys:Set, set (the isolated Set), edges, mats:Map, label }
  let routeFrom = null; // waiting for a second part, for a route
  let mark = null; // a part tapped in the route list
  let stepsOpen = null; // whether the list of steps is unfolded (null: the default for the screen size)
  const phase = { value: 0 };
  const group = new THREE.Group();
  group.renderOrder = 10;
  ctx.scene.add(group);

  // The pulse: a band of light running along each traced part, measured as the distance along the path from where
  // the trace starts. Each part gets the point where it joins the path and how far along the path that point is.
  function makeMaterial(color, entry, d0, dir) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0 });
    const u = {
      uEntry: { value: entry }, uD0: { value: d0 }, uDir: { value: dir }, uPhase: phase,
      uGlow: { value: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.55).multiplyScalar(0.95) },
      uBase: { value: new THREE.Color(color).multiplyScalar(0.16) },
    };
    m.userData.trace = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTraceW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvTraceW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vTraceW; uniform vec3 uEntry, uGlow, uBase; uniform float uD0, uDir, uPhase;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float tPh = (uD0 + distance(vTraceW, uEntry)) / ${WAVE.toFixed(3)};
          float tOut = pow(0.5 + 0.5 * cos(6.2832 * (tPh - uPhase)), 12.0);
          float tIn = pow(0.5 + 0.5 * cos(6.2832 * (tPh + uPhase)), 12.0);
          float tP = uDir > 0.5 ? tOut : uDir < -0.5 ? tIn : max(tOut, tIn);
          totalEmissiveRadiance += uBase + uGlow * tP;`);
    };
    m.customProgramCacheKey = () => 'trace-pulse';
    return m;
  }

  // Distance along the path to each part, from the parts the trace starts at.
  function layout(keys) {
    const edges = data.edges.filter((e) => keys.has(e.p) && keys.has(e.c));
    const entry = new Map(), dist = new Map();
    for (const k of roots(keys)) {
      const inEdge = (up.get(k) || [])[0];
      const outEdge = edges.find((e) => e.p === k);
      const at = inEdge ? V(inEdge.b) : outEdge ? V(outEdge.a) : nodes[k]?.at ? V(nodes[k].at) : centre(k);
      entry.set(k, at); dist.set(k, 0);
    }
    for (let changed = true, n = 0; changed && n < keys.size + 2; n++) {
      changed = false;
      for (const e of edges) {
        if (!dist.has(e.p)) continue;
        const a = V(e.a), b = V(e.b);
        const d = dist.get(e.p) + entry.get(e.p).distanceTo(a) + a.distanceTo(b);
        if (!dist.has(e.c) || d < dist.get(e.c) - 1e-6) { dist.set(e.c, d); entry.set(e.c, b); changed = true; }
      }
    }
    return { edges, entry, dist };
  }
  function centre(k) {
    const box = new THREE.Box3();
    for (const m of ctx.structures.get(k)?.meshes || []) box.expandByObject(m);
    return box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  }

  // Dotted lines for the joins the model doesn't draw, and labels for the parts it lacks.
  const dash = new THREE.LineDashedMaterial({ color: '#ffe7a3', dashSize: 0.006, gapSize: 0.004, transparent: true, opacity: 0.95, depthTest: false });
  function drawGaps(edges) {
    for (const c of [...group.children]) { group.remove(c); c.geometry?.dispose(); c.material?.map?.dispose(); c.material !== dash && c.material?.dispose(); }
    const labels = new Map();
    for (const e of edges) {
      if (!e.gap) continue;
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(e.a), V(e.b)]), dash);
      line.computeLineDistances();
      line.renderOrder = 10;
      group.add(line);
      if (e.via) labels.set(`${e.p}|${e.c}`, [V(e.a).lerp(V(e.b), 0.5), e.via]);
    }
    for (const k of current.keys) if (nodes[k]?.virtual) labels.set(k, [V(nodes[k].at), `${short(k)} (not in the model)`]);
    const placed = [];
    for (const [pos, text] of labels.values()) {
      const s = textSprite(text, pos);
      const near = placed.filter((p) => p.distanceTo(pos) < 0.04).length; // stack labels that would overlap
      s.center.y = -0.4 - near * 1.15;
      placed.push(pos);
      group.add(s);
    }
    sizeLabels();
  }
  function textSprite(text, pos) {
    const c = document.createElement('canvas'), g = c.getContext('2d'), px = 30;
    g.font = `600 ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const w = Math.ceil(g.measureText(text).width) + 24;
    c.width = w; c.height = px + 18;
    g.font = `600 ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    g.fillStyle = 'rgba(17, 14, 40, 0.82)';
    g.beginPath(); g.roundRect(0, 0, w, c.height, 12); g.fill();
    g.fillStyle = '#ffe7a3'; g.textBaseline = 'middle'; g.fillText(text, 12, c.height / 2 + 1);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
    s.position.copy(pos);
    s.center.set(0.5, -0.4);
    s.renderOrder = 11;
    s.userData.aspect = w / c.height;
    return s;
  }
  function sizeLabels() { // about 15 px tall on screen
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov / 2)) * (15 / window.innerHeight);
    for (const s of group.children) if (s.isSprite) s.scale.set(h * s.userData.aspect, h, 1);
  }
  window.addEventListener('resize', sizeLabels);

  function run(mode, a, b, fly = true) {
    let keys, lbl, words = '', r = null;
    if (mode === 'up') { keys = walk(a, 'up'); lbl = `${ctx.prettyName(NAME(a))}, ${backWords(a).toLowerCase()}`; }
    else if (mode === 'down') { keys = walk(a, 'down'); lbl = `${ctx.prettyName(NAME(a))} and ${branchWord(a)}`; }
    else { r = route(a, b); ({ keys, words } = r); lbl = `${short(a)} to ${short(b)}`; }
    const { edges, entry, dist } = layout(keys);
    const set = ctx.show([...keys].filter((k) => ctx.structures.has(k)), lbl, fly);
    current = { mode, a, b, keys, set, edges, entry, dist, mats: new Map(), words, order: r?.order, meet: r?.meet };
    mark = mode === 'route' ? b : null;
    drawGaps(edges);
    ctx.applyVisibility();
    renderCard();
  }

  // The route between two parts: through the nearest part both come from, or (when they come from different
  // places, like an artery and a vein) each one back to where it starts.
  function route(a, b) {
    const hops = (k) => { // part -> fewest steps up from k
      const d = new Map([[k, 0]]), q = [k];
      while (q.length) { const x = q.shift(); for (const e of up.get(x) || []) if (!d.has(e.p)) { d.set(e.p, d.get(x) + 1); q.push(e.p); } }
      return d;
    };
    const upPath = (from, to) => { // a shortest way from `to` down to `from`: [to, ..., from]
      const back = new Map([[from, null]]), q = [from];
      while (q.length) { const x = q.shift(); if (x === to) break; for (const e of up.get(x) || []) if (!back.has(e.p)) { back.set(e.p, x); q.push(e.p); } }
      const out = [];
      for (let x = to; x != null; x = back.get(x)) out.push(x);
      return out;
    };
    const da = hops(a), db = hops(b);
    let best = null;
    for (const [k, n] of da) if (db.has(k) && (!best || n + db.get(k) < best.n)) best = { k, n: n + db.get(k) };
    const A = lower(short(a)), B = lower(short(b));
    if (best) {
      const lca = best.k, L = lower(short(lca));
      const pa = upPath(a, lca), pb = upPath(b, lca); // each runs from where they meet out to the part
      const keys = new Set([...pa, ...pb]);
      const kind = kindOf(lca);
      let words;
      if (lca === a || lca === b) {
        const [top, low] = lca === a ? [A, B] : [B, A];
        words = kindOf(lca) === 'vein' || (kind === 'heart' && /atrium/.test(NAME(lca)))
          ? `The ${low} drains on into the ${top}.`
          : isVessel(lca) ? `Blood flows from the ${top} on to the ${low}.` : `The ${low} comes from the ${top}.`;
      } else if (kind === 'vein' || /atrium/.test(NAME(lca))) words = `Both drain into the ${L}, where their routes meet.`;
      else if (isVessel(lca)) words = `Blood reaches both from the ${L}, where their routes split.`;
      else words = `Both come from the ${L}, where their routes split.`;
      return { keys, words, order: [...pa].reverse().concat(pb.slice(1)), meet: lca };
    }
    const keys = new Set([...walk(a, 'up'), ...walk(b, 'up')]);
    let words;
    const ka = kindOf(a), kb = kindOf(b);
    if (isVessel(a) && isVessel(b)) {
      const art = ka === 'artery' ? A : kb === 'artery' ? B : null, vein = ka === 'vein' ? A : kb === 'vein' ? B : null;
      words = art && vein
        ? `Arteries and veins only meet in the capillaries, which are far too small for the model. So blood runs from the heart out along the ${art}, through capillaries, and back along the ${vein} to the heart. Both are shown back to the heart.`
        : `These two only meet through the heart and the lungs. Both are shown back to the heart.`;
    } else if (!isVessel(a) && !isVessel(b)) {
      words = 'These nerves only meet inside the brain and spinal cord. Both are shown back to where they start.';
    } else {
      words = "A nerve and a blood vessel aren't joined, though they often run side by side in the same bundle. Both are shown back to where they start.";
    }
    return { keys, words, order: null, meet: null };
  }

  // ---------- Words ----------
  function backWords(k) {
    const src = source(k);
    if (kindOf(k) === 'vein') return 'On to the heart';
    if (kindOf(k) === 'artery') return 'Back to the heart';
    return { 'spinal cord': 'Back to the spinal cord', brain: 'Back to the brain', brainstem: 'Back to the brainstem' }[src] || 'Back to the source';
  }
  function branchWord(k) {
    const kind = kindOf(k);
    if (kind === 'vein') return 'everything draining into it';
    if (kind === 'heart') return /atrium/.test(NAME(k)) ? 'the veins that empty into it' : 'the arteries it pumps into';
    return 'all its branches';
  }
  function about(k) {
    const kind = kindOf(k), src = source(k), n = NAME(k).replace(/\.[rl]$/, '');
    if (kind === 'heart') return /atrium/.test(n)
      ? `The ${n.toLowerCase()} receives blood ${n.startsWith('Left') ? 'with fresh oxygen from the lungs' : 'coming back from the body'}.`
      : `The ${n.toLowerCase()} pumps blood out ${n.startsWith('Left') ? 'to the whole body' : 'to the lungs'}.`;
    if (kind === 'artery') return src === 'lungs-out' ? 'Carries blood from the heart to the lungs to pick up oxygen.' : 'Arteries carry blood out from the heart.';
    if (kind === 'vein') {
      if (src === 'lungs-in') return 'Brings blood with fresh oxygen from the lungs back to the heart.';
      if (walk(k, 'up').has('cardiovascular/Hepatic portal vein')) return 'Part of the portal system: its blood goes through the liver first, then on to the heart.';
      return 'Veins carry blood back to the heart.';
    }
    if (kind === 'cns') {
      if (/Anterior horn/.test(n)) return 'The motor nerve cells of the spinal cord. Their fibres leave through the anterior roots.';
      if (/Posterior horn/.test(n)) return 'Where feeling from the body comes into the spinal cord, through the posterior roots.';
      if (/Intermediolateral/.test(n)) return 'The sympathetic nerve cells of the spinal cord, from T1 to L2.';
      if (/geniculate/.test(n)) return 'The relay in the thalamus where the optic tract ends, on the way to the visual cortex.';
      if (n === 'Pons') return 'The trigeminal nerve leaves the brainstem from the side of the pons.';
      const out = [...new Set((down.get(k) || []).map((e) => lower(short(e.c))))];
      return `A group of nerve cells in the ${nodes[k].in || 'brainstem'}. Fibres from here run in the ${out.join(' and ')}.`;
    }
    if (!src) return ''; // nothing to trace in the model: the note says why
    const where = src === 'spinal cord' ? 'the spinal cord' : src === 'brain' ? 'the brain' : 'the brainstem';
    const f = flowOf(k);
    if (f > 0) return `Carries commands out from ${where} to muscles or glands.`;
    if (f < 0) return `Carries feeling in to ${where}.`;
    return `Carries commands out from ${where} and feeling back in, so signals run both ways along it.`;
  }

  // ---------- The card ----------
  const box = $('info-trace');
  let cardKey = null;
  function card(key) { // called whenever the info card shows a part
    cardKey = key;
    const n = key && nodes[key];
    box.hidden = !n;
    if (!n) return;
    renderCard();
  }
  function button(text, fn, cls) {
    const b = document.createElement('button');
    b.textContent = text;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    return b;
  }
  function renderCard() {
    const key = cardKey, n = key && nodes[key];
    if (!n) return;
    const facts = [];
    if (n.levels) facts.push(`Spinal levels: ${n.levels}`);
    if (n.in) facts.push(`In the ${n.in}`);
    $('trace-about').textContent = [about(key), n.note].filter(Boolean).join(' ');
    $('trace-facts').textContent = facts.join(' · ');
    $('trace-facts').hidden = !facts.length;
    const acts = $('trace-actions');
    acts.replaceChildren();
    const hasUp = (up.get(key) || []).length > 0, below = walk(key, 'down').size - 1;
    const on = (mode) => current && current.set === ctx.isolated() && current.mode === mode && current.a === key;
    const toggle = (mode) => () => (on(mode) ? ctx.clear() : run(mode, key)); // tap again to stop tracing
    if (hasUp) acts.append(button(backWords(key), toggle('up'), on('up') ? 'on' : ''));
    if (below) acts.append(button(`${branchWord(key)[0].toUpperCase()}${branchWord(key).slice(1)} (${below})`, toggle('down'), on('down') ? 'on' : ''));
    if (hasUp || below) acts.append(button(routeFrom === key ? 'Cancel route' : 'Route to another part', () => {
      routeFrom = routeFrom === key ? null : key;
      renderCard();
    }, routeFrom === key ? 'on' : ''));
    const msg = $('trace-msg');
    msg.textContent = routeFrom === key ? 'Now tap a second artery, vein or nerve on the body.' : '';
    msg.hidden = routeFrom !== key;
    renderRoute();
  }

  // The route list: what the traced parts are, in the order blood or signals travel. Tap a name to fly to it.
  function renderRoute() {
    const el = $('trace-route');
    el.replaceChildren();
    const live = current && current.set === ctx.isolated() && (current.a === cardKey || current.b === cardKey);
    el.hidden = !live;
    if (!live) return;
    if (current.words) el.append(Object.assign(document.createElement('p'), { className: 'trace-words', textContent: current.words }));
    // The steps fold away on a phone so the body stays in view; they stay open on a bigger screen.
    const steps = document.createElement('details');
    steps.className = 'trace-steps';
    steps.open = stepsOpen ?? window.matchMedia('(min-width: 800px)').matches;
    steps.addEventListener('toggle', () => { stepsOpen = steps.open; });
    const parts = [...current.keys].length;
    steps.append(Object.assign(document.createElement('summary'), { textContent: `Every step along the way (${parts} parts)` }));
    if (current.mode === 'down') steps.append(tree(current.a, 'down', new Set(), 0));
    else if (current.mode === 'up') steps.append(back(current.a));
    else if (current.order) steps.append(list(current.order, current.meet));
    else {
      for (const k of [current.a, current.b]) steps.append(Object.assign(document.createElement('div'), { className: 'trace-sub', textContent: `${short(k)}, ${backWords(k).toLowerCase()}` }), back(k));
    }
    el.append(steps);
    if (current.edges.some((e) => e.gap)) el.append(Object.assign(document.createElement('p'), { className: 'trace-legend', textContent: 'Dotted lines show joins the model doesn’t draw.' }));
  }
  // The way back to the source: a numbered list in the direction blood or signals travel when there is one way,
  // or a tree of what each part comes from when there are several (nerves that gather from many roots).
  function back(k) {
    const keys = walk(k, 'up');
    const ups = (x) => (up.get(x) || []).filter((e) => keys.has(e.p));
    if ([...keys].some((x) => ups(x).length > 1)) return tree(k, 'up', new Set(), 0);
    const order = [k];
    for (let x = k; ups(x).length; ) order.push((x = ups(x)[0].p));
    return list(flowOf(k) < 0 ? order : order.reverse());
  }
  function nameButton(k, extra = '') {
    const b = button(short(k), (e) => { e.preventDefault(); goTo(k); }, `trace-name${k === mark ? ' marked' : ''}${nodes[k]?.virtual ? ' virtual' : ''}`);
    if (nodes[k]?.virtual) b.textContent = `${short(k)} (not in the model)`;
    const lv = nodes[k]?.levels;
    if (lv || extra) b.append(Object.assign(document.createElement('small'), { textContent: ` ${[lv, extra].filter(Boolean).join(' · ')}` }));
    return b;
  }
  function list(order, meet) {
    const ol = document.createElement('ol');
    ol.className = 'trace-list';
    for (const k of order) { const li = document.createElement('li'); li.append(nameButton(k, k === meet ? 'where they meet' : '')); ol.append(li); }
    return ol;
  }
  // A tree out from a part: its branches (down), or what it comes from (up). Parts already listed aren't repeated.
  function tree(k, dir, seen, depth) {
    const kids = (dir === 'up' ? up.get(k) || [] : down.get(k) || []).map((e) => (dir === 'up' ? e.p : e.c));
    const wrap = document.createElement('div');
    wrap.className = 'trace-node';
    if (seen.has(k)) { wrap.append(nameButton(k, 'see above')); return wrap; }
    seen.add(k);
    if (!kids.length) { wrap.append(nameButton(k)); return wrap; }
    const d = document.createElement('details');
    d.open = depth < 2 || dir === 'up';
    const sum = document.createElement('summary');
    const count = dir === 'down' ? walk(k, 'down').size - 1 : 0;
    sum.append(nameButton(k, count && depth ? `${count}` : ''));
    d.append(sum);
    const ul = document.createElement('div');
    ul.className = 'trace-kids';
    if (dir === 'up') ul.dataset.dir = kindOf(k) === 'vein' ? 'drains into' : 'comes from';
    for (const c of kids) ul.append(tree(c, dir, seen, depth + 1));
    d.append(ul);
    wrap.append(d);
    return wrap;
  }
  function goTo(k) {
    mark = mark === k ? null : k;
    if (nodes[k]?.virtual) ctx.focusPoint(V(nodes[k].at), 0.05);
    else if (mark) ctx.focusOnKeys([k]);
    ctx.applyVisibility();
    renderRoute();
  }

  return {
    has: (k) => !!nodes[k],
    card,
    get routing() { return routeFrom; },
    // A tap on the body while choosing the second part of a route. Returns true when the tap was used.
    routeTo(k) {
      if (!routeFrom) return false;
      if (!k) return true;
      if (!nodes[k] || k === routeFrom) {
        const msg = $('trace-msg');
        msg.textContent = k === routeFrom ? 'That is the same part. Tap a different one.' : "That part isn't an artery, vein or nerve on a path. Tap another one.";
        return true;
      }
      const a = routeFrom;
      routeFrom = null;
      cardKey = a;
      run('route', a, k);
      return true;
    },
    cancelRoute() { if (routeFrom) { routeFrom = null; renderCard(); } },
    active: () => !!current && current.set === ctx.isolated(),
    marked: (k) => !!current && current.set === ctx.isolated() && k === mark,
    // The pulsing material for a traced part, or null.
    material(key, color) {
      if (!current || current.set !== ctx.isolated() || !current.dist.has(key)) return null;
      let m = current.mats.get(key);
      if (!m) {
        m = makeMaterial(color, current.entry.get(key), current.dist.get(key), flowOf(key));
        current.mats.set(key, m);
      } else if (m.color.getHexString() !== new THREE.Color(color).getHexString()) {
        m.color.set(color);
        m.userData.trace.uGlow.value.set(color).lerp(new THREE.Color('#ffffff'), 0.55).multiplyScalar(0.95);
        m.userData.trace.uBase.value.set(color).multiplyScalar(0.16);
      }
      return m;
    },
    // Called from applyVisibility: shows the dotted lines only while the trace is what's on screen.
    sync() {
      const on = !!current && current.set === ctx.isolated();
      group.visible = on;
      if (!on && current) {
        for (const m of current.mats.values()) m.dispose();
        current = null; mark = null;
        if (!box.hidden) renderCard();
      }
    },
    // Each frame: moves the pulses. Returns true when a frame should be drawn.
    update(dt) {
      if (!current || current.set !== ctx.isolated() || !ctx.motion()) return false;
      phase.value += dt * (isVessel(current.a) ? BLOOD_SPEED : NERVE_SPEED) / WAVE;
      return true;
    },
    snapshot: () => (current && current.set === ctx.isolated() ? { mode: current.mode, a: current.a, b: current.b || null } : null),
    restore(t) {
      if (!t || !nodes[t.a] || (t.mode === 'route' && !nodes[t.b])) return;
      cardKey = t.a;
      run(t.mode, t.a, t.b, false);
    },
  };
}
