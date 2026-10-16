// Builds data/paths.json: the branching of the arteries, veins and nerves, for tracing a part back to its source
// or out to all its branches.
//
// Every link runs from the centre outward: from the heart out along the arteries, from the heart out against the
// flow along the veins (a vein's "parent" is the vein it drains into), and from the brainstem or spinal cord out along
// the nerves. Most links come from the nesting in the original Z-Anatomy files (raw/*.glb, which build.mjs flattens
// away); the rest are written by hand below. Each link is then checked against the shipped 3D models: the two parts
// must touch, or the link must say what joins them (`via`), which is drawn as a dotted line.
//
//   node tools/paths.mjs [raw folder]      (default /home/claude/work/raw)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync, writeFileSync } from 'fs';

const RAW = process.argv[2] || '/home/claude/work/raw';
const FILES = ['cardiovascular', 'nervous'];
const TOUCH = 0.004; // parts closer than 4 mm count as joined

// ---------- Hand-written links ----------
// [parent, child, options]. A '*' in both names stands for each side (.r and .l). Options: via = what joins the two
// when they don't touch in the model (drawn dotted), note = a short line for the card.
const VESSELS = [
  // Heart and great arteries
  ['Left ventricle', 'Ascending aorta'],
  ['Ascending aorta', 'Aortic arch'],
  ['Ascending aorta', 'Right coronary artery'],
  ['Ascending aorta', 'Left coronary artery'],
  ['Aortic arch', 'Left common carotid artery'],
  ['Aortic arch', 'Left subclavian artery'],
  ['Aortic arch', 'Thoracic aorta'],
  ['Brachiocephalic trunk', 'Right common carotid artery'],
  ['Brachiocephalic trunk', 'Right subclavian artery'],
  ['Thoracic aorta', 'Abdominal aorta'],
  ['Abdominal aorta', 'Common iliac artery.r'],
  ['Abdominal aorta', 'Common iliac artery.l'],
  ['Abdominal aorta', 'Median sacral artery'],
  ['External iliac artery.*', 'Femoral artery.*'],
  // The circle of Willis and the arteries of the spinal cord
  ['Vertebral artery.l', 'Basilar artery'],
  ['Vertebral artery.*', 'Anterior spinal artery.*'],
  ['Anterior cerebral artery.r', 'Anterior communicating artery'],
  ['Anterior cerebral artery.l', 'Anterior communicating artery'],
  ['Internal carotid artery.*', 'Posterior communicating artery.*'],
  ['Posterior cerebral artery.*', 'Posterior communicating artery.*'],
  // Fixes: the source files put these under the other side's parent
  ['Internal carotid artery.l', 'Anterior cerebral artery.l'],
  ['Anterior division of internal iliac artery.l', 'Obturator artery.l'],
  // Lungs: out from the right ventricle
  ['Right ventricle', 'Pulmonary trunk'],
  ['Bifurcation of pulmonary trunk', 'Left pulmonary artery'],
  ['Bifurcation of pulmonary trunk', 'Right pulmonary artery'],
  // Veins: each one under the vein it drains into
  ['Right atrium', 'Superior vena cava'],
  ['Right atrium', 'Inferior vena cava (thoracic part)'],
  ['Right atrium', 'Coronary sinus'],
  ['Right brachiocephalic vein', 'Internal jugular vein.r'],
  ['Right brachiocephalic vein', 'Right subclavian vein'],
  ['Left brachiocephalic vein', 'Internal jugular vein.l'],
  ['Left brachiocephalic vein', 'Left subclavian vein'],
  ['Internal jugular vein.*', 'Sigmoid sinus.*'],
  ['Internal jugular vein.*', 'Inferior petrosal sinus.*'],
  ['Inferior petrosal sinus.l', 'Cavernous sinus.l'],
  ['Cavernous sinus.*', 'Superior ophthalmic vein.*'],
  ['Cavernous sinus.*', 'Inferior ophthalmic vein.*'],
  // The sinuses at the back of the skull meet at the confluence and drain out through both transverse sinuses
  ['Straight sinus', 'Inferior sagittal sinus'],
  ['Transverse sinus.l', 'Superior sagittal sinus', { note: 'at the confluence of the sinuses' }],
  ['Transverse sinus.l', 'Straight sinus', { note: 'at the confluence of the sinuses' }],
  ['Transverse sinus.l', 'Occipital sinus', { note: 'at the confluence of the sinuses' }],
  ['Internal iliac vein.*', 'Deep dorsal vein of penis', { via: 'prostatic venous plexus' }],
  ['External iliac vein.*', 'Femoral vein.*'],
  ['Hepatic veins', 'Hepatic portal vein', { via: 'through the liver' }],
  ['Hepatic portal vein', 'Superior mesenteric vein'],
  ['Hepatic portal vein', 'Splenic vein'],
  ['Left atrium', 'Right superior pulmonary vein'],
  ['Left atrium', 'Right inferior pulmonary vein'],
  ['Left atrium', 'Left superior pulmonary vein'],
  ['Left atrium', 'Left inferior pulmonary vein'],
];
// Links in the source files that are wrong (replaced above or below).
const DROP_LINKS = [
  ['Internal carotid artery.r', 'Anterior cerebral artery.l'],
  ['Anterior division of internal iliac artery.r', 'Obturator artery.l'],
  ['Inferior petrosal sinus.r', 'Cavernous sinus.l'],
  ['Trigeminal nerve (V).r', 'Posterior division of mandibular nerve.l'],
  ['Trigeminal nerve (V).r', 'Anterior division of mandibular nerve.l'],
  ['Trigeminal nerve (V).*', 'Sensory root of trigeminal nerve.*'],
  ['Trigeminal nerve (V).*', 'Motor root of trigeminal nerve.*'],
  ['Transverse sinus.r', 'Inferior sagittal sinus'],
];
// Parts with no 3D piece in the model, standing in for the missing link.
const VIRTUAL = {
  'Lateral cord of brachial plexus.*': {},
  'Medial cord of brachial plexus.*': {},
  'Lumbar plexus.*': {},
  'Sacral plexus.*': {},
};
const NERVES = [
  // Spinal cord to the spinal nerves
  ['Anterior horn of spinal cord', 'Anterior root of spinal nerve.*'],
  ['Posterior horn of spinal cord', 'Posterior root of spinal nerve.*'],
  ['Posterior root of spinal nerve.*', 'Spinal ganglion.*'],
  ['Anterior root of spinal nerve.*', 'Roots of brachial plexus.*'],
  ['Spinal ganglion.*', 'Roots of brachial plexus.*'],
  ['Anterior root of spinal nerve.*', 'Intercostal nerves.*'],
  ['Spinal ganglion.*', 'Intercostal nerves.*'],
  ['Anterior horn of spinal cord', 'Cauda equina'],
  ['Posterior horn of spinal cord', 'Cauda equina'],
  // Brachial plexus: roots, trunks, divisions, cords, branches
  ['Roots of brachial plexus.*', 'Superior trunk of brachial plexus.*'],
  ['Roots of brachial plexus.*', 'Middle trunk of brachial plexus.*'],
  ['Roots of brachial plexus.*', 'Inferior trunk of brachial plexus.*'],
  ['Roots of brachial plexus.*', 'Dorsal scapular nerve.*'],
  ['Roots of brachial plexus.*', 'Long thoracic nerve.*'],
  ['Superior trunk of brachial plexus.*', 'Suprascapular nerve.*'],
  ['Superior trunk of brachial plexus.*', 'Subclavian nerve.*'],
  ['Anterior division of superior trunk of brachial plexus.*', 'Lateral cord of brachial plexus.*'],
  ['Anterior division of middle trunk of brachial plexus.*', 'Lateral cord of brachial plexus.*'],
  ['Anterior division of inferior trunk of brachial plexus.*', 'Medial cord of brachial plexus.*'],
  ['Posterior division of superior trunk of brachial plexus.*', 'Posterior cord of brachial plexus.*'],
  ['Posterior division of middle trunk of brachial plexus.*', 'Posterior cord of brachial plexus.*'],
  ['Posterior division of inferior trunk of brachial plexus.*', 'Posterior cord of brachial plexus.*'],
  ['Lateral cord of brachial plexus.*', 'Lateral pectoral nerve.*'],
  ['Lateral cord of brachial plexus.*', 'Musculocutaneous nerve.*'],
  ['Lateral cord of brachial plexus.*', 'Median nerve.*', { note: 'its lateral root' }],
  ['Medial cord of brachial plexus.*', 'Median nerve.*', { note: 'its medial root' }],
  ['Medial cord of brachial plexus.*', 'Ulnar nerve.*'],
  ['Medial cord of brachial plexus.*', 'Medial pectoral nerve.*'],
  ['Medial cord of brachial plexus.*', 'Medial brachial cutaneous nerve.*'],
  ['Medial cord of brachial plexus.*', 'Medial antebrachial cutaneous nerve.*'],
  ['Posterior cord of brachial plexus.*', 'Axillary nerve.*'],
  ['Posterior cord of brachial plexus.*', 'Radial nerve.*'],
  ['Posterior cord of brachial plexus.*', 'Thoracodorsal nerve.*'],
  ['Posterior cord of brachial plexus.*', 'Superior subscapular nerve.*'],
  ['Posterior cord of brachial plexus.*', 'Inferior subscapular nerve.*'],
  // Lumbar and sacral plexuses (their roots run down the spinal canal in the cauda equina)
  ['Cauda equina', 'Lumbar plexus.*'],
  ['Lumbar plexus.*', 'Iliohypogastric nerve.*'],
  ['Lumbar plexus.*', 'Ilio-inguinal nerve.*'],
  ['Lumbar plexus.*', 'Genitofemoral nerve.*'],
  ['Lumbar plexus.*', 'Lateral femoral cutaneous nerve.*'],
  ['Lumbar plexus.*', 'Femoral nerve.*'],
  ['Lumbar plexus.*', 'Obturator nerve.*'],
  ['Cauda equina', 'Sacral plexus.*'],
  ['Lumbar plexus.*', 'Sacral plexus.*', { via: 'lumbosacral trunk (L4–L5)' }],
  ['Sacral plexus.*', 'Sciatic nerve.*'],
  ['Sacral plexus.*', 'Superior gluteal nerve.*'],
  ['Sacral plexus.*', 'Nerve to piriformis muscle.*'],
  ['Sacral plexus.*', 'Nerve to quadratus femoris muscle.*'],
  ['Sacral plexus.*', 'Pudendal nerve.*'],
  ['Sacral plexus.*', 'Anterior root of posterior femoral cutaneous nerve.*'],
  ['Sacral plexus.*', 'Posterior root of posterior femoral cutaneous nerve.*'],
  ['Anterior root of posterior femoral cutaneous nerve.*', 'Posterior femoral cutaneous nerve.*'],
  ['Posterior root of posterior femoral cutaneous nerve.*', 'Posterior femoral cutaneous nerve.*'],
  // Sympathetic chain: from the intermediolateral cell column (T1–L2)
  ['Intermediolateral nucleus', 'Sympathetic trunk.*', { via: 'anterior roots T1–L2 and white rami' }],
  ['Ganglia of sympathetic trunk.*', 'Sympathetic nerves.*'],
  // Cranial nerves from their nuclei in the brainstem (or the spinal cord, for XI)
  ['Nucleus of oculomotor nerve.*', 'Oculomotor nerve (III).*'],
  ['Accessory nucleus of oculomotor nerve.*', 'Oculomotor nerve (III).*'],
  ['Nucleus of trochlear nerve.l', 'Trochlear nerve (IV).r', { via: 'crosses to the other side' }],
  ['Nucleus of trochlear nerve.r', 'Trochlear nerve (IV).l', { via: 'crosses to the other side' }],
  ['Pons.*', 'Sensory root of trigeminal nerve.*'],
  ['Pons.*', 'Motor root of trigeminal nerve.*'],
  ['Sensory root of trigeminal nerve.*', 'Trigeminal nerve (V).*'],
  ['Motor root of trigeminal nerve.*', 'Trigeminal nerve (V).*'],
  ['Trigeminal nerve (V).l', 'Posterior division of mandibular nerve.l'],
  ['Trigeminal nerve (V).l', 'Anterior division of mandibular nerve.l'],
  ['Nucleus of abducens nerve.*', 'Abducens nerve (VI).*'],
  ['Motor nucleus of facial nerve.*', 'Facial nerve (VII).*'],
  ['Superior salivatory nucleus.*', 'Facial nerve (VII).*'],
  ['Nucleus of solitary tract.*', 'Facial nerve (VII).*'],
  ['Vestibular nuclei.*', 'Vestibulocochlear nerve (VIII).*'],
  ['Anterior cochlear nucleus.*', 'Vestibulocochlear nerve (VIII).*'],
  ['Posterior cochlear nucleus.*', 'Vestibulocochlear nerve (VIII).*'],
  ['Inferior salivatory nucleus.*', 'Glossopharyngeal nerve (IX).*'],
  ['Nucleus ambiguus.*', 'Glossopharyngeal nerve (IX).*'],
  ['Nucleus of solitary tract.*', 'Glossopharyngeal nerve (IX).*'],
  ['Posterior nucleus of vagus nerve.*', 'Vagus nerve (X).*'],
  ['Nucleus ambiguus.*', 'Vagus nerve (X).*'],
  ['Nucleus of solitary tract.*', 'Vagus nerve (X).*'],
  ['Nucleus of accessory nerve.*', 'Accessory nerve (XI).*'],
  ['Nucleus of hypoglossal nerve.*', 'Hypoglossal nerve (XII).*'],
  // The visual pathway, back from the eye to the thalamus; half the fibres cross in the chiasm
  ['Lateral geniculate body.*', 'Optic tract.*'],
  ['Optic tract.r', 'Optic chiasm.r'],
  ['Optic tract.l', 'Optic chiasm.l'],
  ['Optic tract.r', 'Optic chiasm.l', { note: 'fibres crossing in the chiasm' }],
  ['Optic tract.l', 'Optic chiasm.r', { note: 'fibres crossing in the chiasm' }],
  ['Optic chiasm.*', 'Optic nerve (II).*'],
];

// Where the brainstem nuclei sit, for the card.
const IN = {
  'Nucleus of oculomotor nerve': 'midbrain', 'Accessory nucleus of oculomotor nerve': 'midbrain', 'Nucleus of trochlear nerve': 'midbrain',
  'Nucleus of abducens nerve': 'pons', 'Motor nucleus of facial nerve': 'pons', 'Superior salivatory nucleus': 'pons', 'Vestibular nuclei': 'pons and medulla',
  'Anterior cochlear nucleus': 'medulla', 'Posterior cochlear nucleus': 'medulla', 'Inferior salivatory nucleus': 'medulla', 'Nucleus ambiguus': 'medulla',
  'Posterior nucleus of vagus nerve': 'medulla', 'Nucleus of hypoglossal nerve': 'medulla', 'Nucleus of solitary tract': 'medulla',
  'Nucleus of accessory nerve': 'spinal cord (C1–C5)',
};
// Spinal levels, for the nerves where the textbooks agree.
const LEVELS = {
  'Roots of brachial plexus': 'C5–T1', 'Superior trunk of brachial plexus': 'C5–C6', 'Middle trunk of brachial plexus': 'C7',
  'Inferior trunk of brachial plexus': 'C8–T1', 'Lateral cord of brachial plexus': 'C5–C7', 'Medial cord of brachial plexus': 'C8–T1',
  'Posterior cord of brachial plexus': 'C5–T1', 'Dorsal scapular nerve': 'C5', 'Long thoracic nerve': 'C5–C7', 'Suprascapular nerve': 'C5–C6',
  'Subclavian nerve': 'C5–C6', 'Lateral pectoral nerve': 'C5–C7', 'Medial pectoral nerve': 'C8–T1', 'Musculocutaneous nerve': 'C5–C7',
  'Median nerve': 'C6–T1 (sometimes C5)', 'Ulnar nerve': 'C8–T1 (often C7)', 'Radial nerve': 'C5–T1', 'Axillary nerve': 'C5–C6',
  'Thoracodorsal nerve': 'C6–C8', 'Superior subscapular nerve': 'C5–C6', 'Inferior subscapular nerve': 'C5–C6',
  'Medial brachial cutaneous nerve': 'C8–T1', 'Medial antebrachial cutaneous nerve': 'C8–T1', 'Intercostal nerves': 'T1–T11',
  'Iliohypogastric nerve': 'T12–L1', 'Ilio-inguinal nerve': 'L1', 'Genitofemoral nerve': 'L1–L2', 'Lateral femoral cutaneous nerve': 'L2–L3',
  'Femoral nerve': 'L2–L4', 'Obturator nerve': 'L2–L4', 'Lumbar plexus': 'T12–L4', 'Sacral plexus': 'L4–S4', 'Sciatic nerve': 'L4–S3',
  'Tibial nerve': 'L4–S3', 'Common fibular nerve': 'L4–S2', 'Superior gluteal nerve': 'L4–S1', 'Nerve to piriformis muscle': 'S1–S2',
  'Nerve to quadratus femoris muscle': 'L4–S1', 'Posterior femoral cutaneous nerve': 'S1–S3', 'Pudendal nerve': 'S2–S4',
  'Accessory nerve (XI)': 'C1–C5 (its spinal root)', 'Cauda equina': 'L2–Co1 roots', 'Sympathetic trunk': 'outflow from T1–L2',
};
// A line for the card where the model itself limits what can be traced.
const NOTES = {
  'Olfactory nerve (I)': 'The smell nerve runs straight into the olfactory bulb under the front of the brain. It is the one cranial nerve that has no nucleus in the brainstem.',
  'Optic nerve (II)': 'The optic nerve is really an outgrowth of the brain. Its signals run back through the chiasm and optic tract to the thalamus (lateral geniculate body).',
  'Vagus nerve (X)': 'The model draws the vagus as one piece, so its branches to the throat, heart, lungs and gut are part of it and can\'t be picked one by one.',
  'Facial nerve (VII)': 'The model draws the facial nerve\'s branches in the face as part of the nerve itself.',
  'Roots of brachial plexus': 'The model joins the five roots (C5 to T1) into one piece.',
  'Cauda equina': 'The model draws the cauda equina as one bundle, so both sides share it.',
  'Intercostal nerves': 'The model draws all the intercostal nerves of one side as one piece.',
};
// Not part of any path: the valves and muscles inside the heart, and unnamed pieces.
const SKIP = /leaflet|papillary muscle|^\?|^\?{3,}/i;
const HEART = new Set(['Right atrium', 'Right ventricle', 'Left atrium', 'Left ventricle']);

// ---------- Read the catalog and the source nesting ----------
const catalog = JSON.parse(readFileSync('data/catalog.json', 'utf8'));
const TRACE_PARTS = new Set(['cranial', 'spinal', 'autonomic']);
const known = new Map(); // name -> key, for the parts that can be in a path
for (const s of catalog.structures) {
  if (s.file === 'cardiovascular' && !SKIP.test(s.name)) known.set(s.name, `cardiovascular/${s.name}`);
  if (s.file === 'nervous' && (TRACE_PARTS.has(s.f?.['nervous.part']) || s.f?.['nervous.part'] === 'spinalcord' || s.f?.['nervous.part'] === 'brain')) known.set(s.name, `nervous/${s.name}`);
}
const partOf = new Map(catalog.structures.filter((s) => s.file === 'nervous').map((s) => [s.name, s.f?.['nervous.part']]));
const cns = (name) => ['brain', 'spinalcord'].includes(partOf.get(name));
const sides = (name) => (name.includes('*') ? ['r', 'l'].map((x) => name.replace('*', x)) : [name]);
const expand = (list) => list.flatMap(([a, b, o = {}]) => {
  if (a.includes('*') !== b.includes('*') && (a.includes('*') || b.includes('*'))) {
    return a.includes('*') ? sides(a).map((x) => [x, b, o]) : sides(b).map((x) => [a, x, o]);
  }
  return a.includes('*') ? ['r', 'l'].map((x) => [a.replace('*', x), b.replace('*', x), o]) : [[a, b, o]];
});
const virtual = new Map(Object.keys(VIRTUAL).flatMap(sides).map((n) => [n, `virtual/${n}`]));
const keyOf = (name) => known.get(name) || virtual.get(name);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
await MeshoptDecoder.ready;
const edges = new Map(); // "parent|child" -> { p, c, via, note, from }
const addEdge = (p, c, o, from) => {
  const kp = keyOf(p), kc = keyOf(c);
  if (!kp) throw new Error(`unknown part: ${p}`);
  if (!kc) throw new Error(`unknown part: ${c}`);
  edges.set(`${kp}|${kc}`, { p: kp, c: kc, via: o.via, note: o.note, from });
};
for (const file of FILES) {
  const doc = await io.read(`${RAW}/${file}.glb`);
  const parentOf = new Map();
  for (const n of doc.getRoot().listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
  for (const n of doc.getRoot().listNodes()) {
    const name = n.getName();
    if (!known.has(name) || known.get(name) !== `${file}/${name}`) continue;
    let p = parentOf.get(n);
    while (p && !(known.get(p.getName()) === `${file}/${p.getName()}`)) p = parentOf.get(p);
    if (!p) continue;
    // Inside the brain and spinal cord the nesting is regions within regions, not pathways: leave it out.
    if (file === 'nervous' && cns(name) && cns(p.getName())) continue;
    addEdge(p.getName(), name, {}, 'source');
  }
}
for (const [p, c] of expand(DROP_LINKS)) {
  const k = `${keyOf(p)}|${keyOf(c)}`;
  if (!edges.delete(k)) throw new Error(`dropped link not found: ${p} -> ${c}`);
}
for (const [p, c, o] of expand([...VESSELS, ...NERVES])) addEdge(p, c, o, 'hand');

// Keep only the parts that are on a path, and the nerves the card has something to say about.
const used = new Set();
for (const e of edges.values()) { used.add(e.p); used.add(e.c); }
for (const [name, key] of known) if (NOTES[name.replace(/\.[rl]$/, '')]) used.add(key);

// ---------- Check every link against the shipped models ----------
// World-space points of each part, from models/<file>.glb.
const points = new Map();
for (const file of FILES) {
  const doc = await io.read(`models/${file}.glb`);
  for (const node of doc.getRoot().listNodes()) {
    const key = `${file}/${node.getName()}`;
    if (!node.getMesh() || !used.has(key)) continue;
    const m = node.getWorldMatrix();
    const pts = points.get(key) || [];
    for (const prim of node.getMesh().listPrimitives()) {
      const pos = prim.getAttribute('POSITION'), v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        pts.push([m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]);
      }
    }
    points.set(key, pts);
  }
}
for (const k of used) if (!k.startsWith('virtual/') && !points.has(k)) throw new Error(`no 3D model for ${k}`);

// Closest pair of points between two parts (a grid over one of them).
function closest(A, B) {
  const C = 0.01, grid = new Map(), cell = (p) => p.map((x) => Math.floor(x / C));
  for (const p of A) { const k = cell(p).join(); (grid.get(k) || grid.set(k, []).get(k)).push(p); }
  let best = Infinity, pa = null, pb = null;
  const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  for (const q of B) {
    const [x, y, z] = cell(q);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const p of grid.get(`${x + dx},${y + dy},${z + dz}`) || []) { const d = d2(p, q); if (d < best) { best = d; pa = p; pb = q; } }
    }
  }
  if (!pa) { // farther than a grid cell: check everything
    for (const p of A) for (const q of B) { const d = d2(p, q); if (d < best) { best = d; pa = p; pb = q; } }
  }
  return { d: Math.sqrt(best), a: pa, b: pb };
}
const r4 = (p) => p.map((x) => Math.round(x * 1e4) / 1e4);

// A virtual part sits between what joins it: at the middle of the closest points of its parents and children.
const vpos = new Map();
for (const [, vk] of virtual) {
  const ps = [...edges.values()].filter((e) => e.c === vk).map((e) => e.p).filter((k) => points.has(k));
  const cs = [...edges.values()].filter((e) => e.p === vk).map((e) => e.c).filter((k) => points.has(k));
  const near = [];
  for (const p of ps) for (const c of cs) { const r = closest(points.get(p), points.get(c)); near.push(r.a, r.b); }
  const m = [0, 0, 0];
  for (const p of near) for (let i = 0; i < 3; i++) m[i] += p[i] / near.length;
  vpos.set(vk, m);
}
const problems = [];
for (const e of edges.values()) {
  const A = points.get(e.p), B = points.get(e.c);
  let r;
  if (A && B) r = closest(A, B);
  else if (A) { const v = vpos.get(e.c); r = closest(A, [v]); r.b = v; }
  else if (B) { const v = vpos.get(e.p); r = closest([v], B); r.a = v; }
  else { const a = vpos.get(e.p), b = vpos.get(e.c); r = { d: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), a, b }; }
  e.d = r.d; e.a = r4(r.a); e.b = r4(r.b);
  const isVirtual = e.p.startsWith('virtual/') || e.c.startsWith('virtual/');
  e.gap = r.d > TOUCH; // drawn as a dotted line: the join isn't shown in the model
  if (r.d > TOUCH && !isVirtual && !e.via) problems.push(`${(r.d * 1000).toFixed(1)} mm  ${e.from}  ${e.p} -> ${e.c}`);
}
problems.sort((a, b) => parseFloat(b) - parseFloat(a));
console.log(`${edges.size} links, ${used.size} parts; links over ${TOUCH * 1000} mm apart without a stated join:`);
console.log(problems.join('\n') || '  none');

// The links must not loop back on themselves.
{
  const out = new Map();
  for (const e of edges.values()) (out.get(e.p) || out.set(e.p, []).get(e.p)).push(e.c);
  const state = new Map();
  const visit = (k, trail) => {
    if (state.get(k) === 2) return;
    if (state.get(k) === 1) throw new Error(`links loop: ${[...trail, k].join(' -> ')}`);
    state.set(k, 1);
    for (const c of out.get(k) || []) visit(c, [...trail, k]);
    state.set(k, 2);
  };
  for (const k of out.keys()) visit(k, []);
}

// ---------- Write ----------
const kindOf = new Map();
// Walk out from each root to label vessels as arteries or veins by the chamber they come from.
const kids = new Map();
for (const e of edges.values()) (kids.get(e.p) || kids.set(e.p, []).get(e.p)).push(e.c);
const label = (root, kind) => { const stack = [root]; while (stack.length) { const k = stack.pop(); if (kindOf.has(k) && k !== root) continue; kindOf.set(k, kind); stack.push(...(kids.get(k) || [])); } };
for (const h of HEART) kindOf.set(`cardiovascular/${h}`, 'heart');
for (const [h, kind] of [['Left ventricle', 'artery'], ['Right ventricle', 'artery'], ['Right atrium', 'vein'], ['Left atrium', 'vein']]) for (const c of kids.get(`cardiovascular/${h}`) || []) label(c, kind);
const nodes = {};
for (const k of [...used].sort()) {
  const name = k.slice(k.indexOf('/') + 1), base = name.replace(/\.[rl]$/, '');
  const s = catalog.structures.find((x) => `${x.file}/${x.name}` === k);
  const part = s?.f?.['nervous.part'];
  const kind = k.startsWith('cardiovascular/') ? kindOf.get(k) : k.startsWith('virtual/') ? 'nerve' : (part === 'brain' || part === 'spinalcord') ? 'cns' : 'nerve';
  if (!kind) throw new Error(`no kind for ${k} (not reached from the heart)`);
  const n = { kind };
  if (k.startsWith('virtual/')) { n.virtual = true; n.at = r4(vpos.get(k)); }
  if (LEVELS[base]) n.levels = LEVELS[base];
  if (IN[base]) n.in = IN[base];
  if (NOTES[base]) n.note = NOTES[base];
  nodes[k] = n;
}
const out = {
  note: 'Generated by tools/paths.mjs. Links run from the centre (heart, brainstem, spinal cord) outward.',
  nodes,
  edges: [...edges.values()].map((e) => {
    const o = { p: e.p, c: e.c, a: e.a, b: e.b };
    if (e.gap) o.gap = true;
    if (e.via) o.via = e.via;
    if (e.note) o.note = e.note;
    return o;
  }),
};
writeFileSync('data/paths.json', JSON.stringify(out));
console.log(`wrote data/paths.json: ${Object.keys(nodes).length} parts, ${out.edges.length} links, ${out.edges.filter((e) => e.gap).length} drawn as dotted lines`);
