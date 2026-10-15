// Builds data/occult.json: Brian's occult anatomy layers placed on the 3D body.
//
// Every correspondence below is copied from Brian's Canva boards, not filled in from other sources:
//   WB  = "OCCULT ANATOMY OF MAN - WHITEBOARD" (DAG27NqRPzI)
//   UM  = "UNIVERSAL MAP" (DAG4byTJC6M), page 1 (hand, pentad, septenary) and page 6 (mudra table, chakra legend)
//   7C  = "7 CHAKRAS" (DAG3ydq7LR4), page 1 (septenary table with petals), page 3 (common names)
// Cells that are "???", "?" or "xxx" on the boards are kept as written and flagged as unsure.
// Where the boards disagree with each other, both values are shown and flagged.
// Anatomical placement (where each item sits on the body) is computed from the model and explained in `placement`.
//
// Usage: node tools/occult.mjs   (reads models/*.glb, writes data/occult.json)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import fs from 'fs';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

// ---------- Geometry from the models ----------
const docs = {};
async function verts(file, name) {
  docs[file] ||= await io.read(`models/${file}.glb`);
  const out = [];
  for (const n of docs[file].getRoot().listNodes()) {
    const mesh = n.getMesh();
    if (!mesh || n.getName() !== name) continue;
    const M = new THREE.Matrix4().fromArray(n.getWorldMatrix()), e = [];
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute('POSITION');
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); out.push(new THREE.Vector3(...e).applyMatrix4(M)); }
    }
  }
  if (!out.length) throw new Error(`No mesh named "${name}" in ${file}`);
  return out;
}
const mean = (vs) => vs.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(vs.length);
const centroid = async (file, ...names) => mean((await Promise.all(names.map((n) => verts(file, n)))).flat());
const box = (vs) => new THREE.Box3().setFromPoints(vs);
const r3 = (v) => [+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)];
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// The model's right side is -x, its front is +z, and y is up (metres).

// Sushumna: the central channel. Anatomically traced up the vertebral canal:
// coccyx tip -> sacral canal and lumbar cistern (cauda equina) -> central canal of the spinal cord ->
// central canal of the medulla -> fourth ventricle -> aqueduct of midbrain -> third ventricle -> crown.
const coccyx = await verts('skeletal', 'Coccyx');
const coccyxTip = coccyx.reduce((a, v) => (v.y < a.y ? v : a)).clone().setX(0);
const slices = (vs, y0, y1, step) => {
  const out = [];
  for (let y = y0; y <= y1 + 1e-9; y += step) {
    const s = vs.filter((v) => Math.abs(v.y - y) < step / 2);
    if (s.length) out.push(V(0, y, mean(s).z));
  }
  return out;
};
const cauda = await verts('nervous', 'Cauda equina');
const canal = await verts('nervous', 'Central canal');
const caudaBox = box(cauda), canalBox = box(canal);
const parietal = [...await verts('skeletal', 'Parietal bone.r'), ...await verts('skeletal', 'Parietal bone.l')];
const skullTop = parietal.reduce((a, v) => (v.y > a.y ? v : a)).clone().setX(0);
const sushumna = [
  coccyxTip,
  ...slices(cauda.filter((v) => Math.abs(v.x) < 0.012), caudaBox.min.y + 0.01, canalBox.min.y - 0.01, 0.025),
  ...slices(canal, canalBox.min.y + 0.005, canalBox.max.y - 0.005, 0.03),
  (await centroid('nervous', "Central canal'")).setX(0),
  (await centroid('nervous', 'Fourth ventricle')).setX(0),
  (await centroid('nervous', 'Aqueduct of midbrain')).setX(0),
  (await centroid('nervous', 'Third ventricle')).setX(0),
  skullTop.clone(),
];
// z of the sushumna line at a given height
function zAt(y) {
  for (let i = 1; i < sushumna.length; i++) {
    const a = sushumna[i - 1], b = sushumna[i];
    if (y >= a.y && y <= b.y) return a.z + (b.z - a.z) * ((y - a.y) / (b.y - a.y || 1));
  }
  return y < sushumna[0].y ? sushumna[0].z : sushumna.at(-1).z;
}
const onSushumna = (y) => V(0, y, zAt(y));

// Landmarks
const sacrum = await centroid('skeletal', 'Sacrum');
const umbilicus = await centroid('regions', 'Umbilicus.r', 'Umbilicus.l');
const heart = await centroid('cardiovascular', 'Right atrium', 'Right ventricle', 'Left atrium', 'Left ventricle');
const thyroidCart = await centroid('skeletal', 'Thyroid cartilage');
const eyebrows = await centroid('regions', 'Eyebrow.r', 'Eyebrow.l');
const pineal = await centroid('visceral', 'Pineal gland');
const pituitary = await centroid('visceral', 'Adenohypophysis', 'Neurohypophysis');
const thalamus = await centroid('nervous', 'Thalamus.r', 'Thalamus.l');
const stomach = await centroid('visceral', 'Stomach');
const digestive = await centroid('visceral', 'Stomach', 'Duodenum', 'Jejunum', 'Pancreas', 'Liver');
const pelvic = await centroid('visceral', 'Urinary bladder', 'Sigmoid colon');
const pubic = await centroid('joints', 'Pubic symphysis');
async function nostril(side) {
  const vs = await verts('regions', `Nasal region.${side}`);
  const minY = Math.min(...vs.map((v) => v.y));
  return mean(vs.filter((v) => v.y < minY + 0.006));
}
const nostrilL = await nostril('l'), nostrilR = await nostril('r');
const nasalCavity = await centroid('visceral', 'Mucosa of nasal cavity');
async function topOf(file, name, depth) {
  const vs = await verts(file, name);
  const maxY = Math.max(...vs.map((v) => v.y));
  return mean(vs.filter((v) => v.y > maxY - depth));
}
const shoulderR = await topOf('skeletal', 'Humerus.r', 0.04), shoulderL = await topOf('skeletal', 'Humerus.l', 0.04);
// The outer point of the hip: the greater trochanter at the top of the femur.
async function trochanter(side) {
  const vs = await verts('skeletal', `Femur.${side}`);
  const maxY = Math.max(...vs.map((v) => v.y));
  const top = vs.filter((v) => v.y > maxY - 0.08);
  const lateral = Math.max(...top.map((v) => Math.abs(v.x)));
  return mean(top.filter((v) => Math.abs(v.x) > lateral - 0.015));
}
const hipR = await trochanter('r'), hipL = await trochanter('l');
const headHalfWidth = Math.max(...parietal.map((v) => Math.abs(v.x)));

// ---------- Helpers for the data ----------
// A field: label, value, optional flags. `q` marks a value that is incomplete or unsure on the board.
const F = (k, v, o = {}) => ({ k, v: String(v), ...(o.q || /\?|xxx/i.test(String(v)) ? { q: true } : {}), ...(o.note ? { note: o.note } : {}), ...(o.src ? { src: o.src } : {}) });
const P = r3;

// ---------- 1. Chakras ----------
// Septenary table (WB + UM p1 + 7C p1). Order: crown to root.
const SEPTENARY = [
  { id: 'sahasrara', name: 'Sahasrara', common: 'crown', numeral: 'VII', planetGlyph: '♄', planetSym: 'saturn', angel: 'zaphikiel', metal: 'lead', sin: 'greed', virtue: 'charity', color: 'violet', body: 'saturn (/ sun)', hz: '963 hz', petals: '1,000', principle: 'thought', tint: '#8e44ad' },
  { id: 'ajna', name: 'Ajna', common: '3rd eye', numeral: 'VI', planetGlyph: '♃', planetSym: 'jupiter', angel: 'zadikiel', metal: 'tin', sin: 'gluttony', virtue: 'temperance', color: 'indigo', body: 'jupiter', hz: 'LA - 852 hz', petals: '2 / 96', principle: 'light', tint: '#5b3fa8' },
  { id: 'vishuddha', name: 'Visuddha', common: 'throat', numeral: 'V', planetGlyph: '♂', planetSym: 'mars', angel: 'samael', metal: 'iron', sin: 'wrath', virtue: 'patience', color: 'blue', body: 'mars', hz: 'SOL - 741 hz', petals: '16', principle: 'aether', tint: '#3fa0d8' },
  { id: 'anahata', name: 'Anahata', common: 'heart', numeral: 'IV', planetGlyph: '☉', planetSym: 'sun', angel: 'michael', metal: 'gold', sin: 'pride', virtue: 'humility', color: 'green', body: 'earth (/ sun)', hz: 'FA - 639 hz', petals: '12', principle: 'air', tint: '#43873f' },
  { id: 'manipura', name: 'Manipura', common: 'solar', numeral: 'III', planetGlyph: '♀', planetSym: 'venus', angel: 'haniel', metal: 'copper', sin: 'lust', virtue: 'chastity', color: 'yellow', body: 'venus', hz: 'MI - 528 hz', petals: '10', principle: 'fire', tint: '#ffbd59' },
  { id: 'svadhisthana', name: 'Svadhisthana', common: 'sacral', numeral: 'II', planetGlyph: '☿', planetSym: 'mercury', angel: 'raphael', metal: 'mercury', sin: 'envy', virtue: 'kindness', color: 'orange', body: 'mercury', hz: 'RE - 417 hz', petals: '6', principle: 'water', tint: '#ff751f' },
  { id: 'muladhara', name: 'Muladhara', common: 'root', numeral: 'I', planetGlyph: '☽', planetSym: 'moon', angel: 'gabriel', metal: 'silver', sin: 'sloth', virtue: 'diligence', color: 'red', body: 'moon', hz: 'UT - 396 hz', petals: '4', principle: 'earth', tint: '#c0392b' },
];
const CHAKRA_PLACE = {
  sahasrara: { pos: V(0, skullTop.y + 0.035, skullTop.z), text: 'Just above the crown of the skull (the top of the parietal bones), where the sushumna ends.' },
  ajna: { pos: onSushumna(eyebrows.y), text: 'Inside the head at eyebrow height, on the sushumna line beside the third ventricle, behind the point between the eyebrows.' },
  vishuddha: { pos: onSushumna(thyroidCart.y), text: 'At throat height, level with the thyroid cartilage (Adam\'s apple, about C4–C5), on the sushumna line in the cervical spine.' },
  anahata: { pos: onSushumna(heart.y), text: 'At heart height (the centre of the four heart chambers, mid-thoracic spine), on the sushumna line.' },
  manipura: { pos: onSushumna(umbilicus.y), text: 'At navel height (the umbilicus sits at about the L3–L4 disc), on the sushumna line. Some modern sources put it higher, at the solar plexus around T12–L1.' },
  svadhisthana: { pos: onSushumna(sacrum.y), text: 'At the level of the sacrum (its centre, about S2), on the sushumna line in the sacral canal.' },
  muladhara: { pos: coccyxTip.clone(), text: 'At the base of the spine (the tip of the coccyx), where the sushumna begins. Its point on the body surface is the perineum.' },
};
const chakras = SEPTENARY.map((c) => ({
  id: c.id, name: c.name, sub: `${c.common} chakra`, icon: `icons/occult/chakra-${c.id}.png`, color: c.tint,
  pos: P(CHAKRA_PLACE[c.id].pos), size: 0.085,
  fields: [
    F('Chakra', c.name.toLowerCase(), { src: 'WB, UM' }),
    F('Number', c.numeral, { src: 'UM' }),
    F('Planet symbol', `${c.planetGlyph} ${c.planetSym}`, { src: '7C' }),
    F('Planetary body', c.body, { src: 'UM' }),
    F('Angel', c.angel, { src: 'WB, UM' }),
    F('Alchemical metal', c.metal, { src: 'WB, UM' }),
    F('Deadly sin', c.sin, { src: 'WB, UM' }),
    F('Heavenly virtue', c.virtue, { src: 'WB, UM' }),
    F('Colour', c.color, { src: 'WB, UM', ...(c.id === 'sahasrara' ? { note: 'One copy of the table on your whiteboard says "violent"; the other copy and the Universal Map say violet.' } : {}) }),
    F('Solfeggio frequency', c.hz, { src: 'WB, UM' }),
    F('Petals', c.petals, { src: '7C' }),
    F('Principle', c.principle, { src: 'UM p6, WB' }),
  ],
  placement: CHAKRA_PLACE[c.id].text,
}));

// ---------- 2. Elements and prana vayus ----------
// Elemental pentad (UM p1) + elements table (WB) + finger table (WB) + four elements tattva table (WB)
// + planes table (WB) + vayu mudra panels (UM p5).
const ELEMENTS = [
  { id: 'fire', name: 'Fire', vayu: 'Samana', hebrew: 'yod (י)', hebrewNote: 'Your whiteboard finger table says YOD (י); the Hebrew column of the Universal Map pentad shows ר (resh) for fire.', func: 'digestion', prop: 'transformation / purification', state: 'plasma', sense: 'sight', inner: 'soul / 3rd eye', hindu: 'tejas', mudra: 'surya', fingerUM: 'thumb', fingerWB: 'middle', world: 'atzilut', number: '72', elemental: 'salamanders', four: ['mark', 'summer', 'fortitude / courage', 'candle', 'full', 'midday'], color: '#cc0000', symbol: '🜂' },
  { id: 'water', name: 'Water', vayu: 'Vyana', hebrew: 'heh (ה)', func: 'circulation', prop: 'emotional balance', state: 'liquid', sense: 'taste', inner: 'feeling', hindu: 'apas', mudra: 'jala', fingerUM: 'pinky', fingerWB: 'index', world: 'beriah', number: '63', elemental: 'mermaids', four: ['john', 'autumn', 'fear', 'solitude', 'waning', 'afternoon'], color: '#1f48ff', symbol: '🜄' },
  { id: 'air', name: 'Air', vayu: 'Prana', hebrew: 'yau (ו)', hebrewNote: 'Spelled YAU in your whiteboard finger table; the letter shown on the Universal Map pentad is ו (vav).', func: 'heart', prop: 'change on in/visible', state: 'gas', sense: 'smell', inner: 'thought', hindu: 'yayu', hinduNote: 'Written "yayu" on the Universal Map and whiteboard; the vayu mudra panel on Universal Map page 5 spells it VAYU.', mudra: 'vayu', fingerUM: 'index', fingerWB: 'pinky', world: 'yetzirah', number: '45', elemental: 'sylphs', four: ['matthew', 'spring', 'piety', 'fasting', 'crescent', 'morning'], color: '#ffd21f', symbol: '🜁' },
  { id: 'earth', name: 'Earth', vayu: 'Apana', hebrew: 'heh (ה)', func: 'excretion', prop: 'grounding / stability', state: 'solid', sense: 'touch', inner: 'physical body', hindu: 'privthi', hinduNote: 'Written "privthi" on the boards; the vayu mudra panel on Universal Map page 5 spells it PRITHVI.', mudra: 'prithvi', fingerUM: 'ring', fingerWB: 'ring', world: 'assiah', number: '52', elemental: 'gnomes', four: ['luke', 'winter', 'counsel', 'silence', 'black', 'evening'], color: '#4ca626', symbol: '🜃' },
  { id: 'aether', name: 'Aether', vayu: 'Udana', hebrew: 'shin (ש)', func: 'upper body', prop: 'expansion / consciousness', state: 'aether / space', sense: 'hearing', inner: 'spirit', hindu: 'akasha', mudra: 'akasha', fingerUM: 'middle', fingerWB: 'thumb', world: 'adam kadmon', number: '', elemental: 'devas', four: null, color: '#ffffff', symbol: '○' },
];
const VAYU_PLACE = {
  fire: { pos: digestive, text: 'At the centre of the digestive organs (stomach, duodenum, jejunum, pancreas and liver), for samana\'s function on your board: digestion.', show: { label: 'Show digestive organs', names: ['visceral/Stomach', 'visceral/Duodenum', 'visceral/Jejunum', 'visceral/Ileum', 'visceral/Liver', 'visceral/Gallbladder', 'visceral/Pancreas'] } },
  water: { pos: V(0.24, heart.y, 0.12), text: 'Vyana pervades the whole body (its function on your board is circulation), so its symbol floats beside the body instead of on one organ. "Show circulatory system" lights up the whole cardiovascular system.', show: { label: 'Show circulatory system', system: 'circulatory' } },
  air: { pos: heart, text: 'At the centre of the heart, for prana\'s function on your board: heart.', show: { label: 'Show heart', group: ['cardiovascular', 'Heart'] } },
  earth: { pos: pelvic, text: 'In the lower pelvis (the centre of the bladder and sigmoid colon), for apana\'s function on your board: excretion.', show: { label: 'Show excretory organs', names: ['visceral/Kidney.r', 'visceral/Kidney.l', 'visceral/Ureter.r', 'visceral/Ureter.l', 'visceral/Urinary bladder', 'visceral/Ascending colon', 'visceral/Transverse colon', 'visceral/Descending colon', 'visceral/Sigmoid colon', 'visceral/Rectum', 'visceral/Anal canal'] } },
  aether: { pos: V(0, thyroidCart.y, thyroidCart.z + 0.03), text: 'At the throat, the gateway to the upper body, for udana\'s function on your board: upper body. "Show upper body" lights up the skin of the head, neck, chest and arms.', show: { label: 'Show upper body', regionGroups: ['Regions of head', 'Regions of neck', 'Regions of thorax', 'Regions of upper limb'] } },
};
const elements = ELEMENTS.map((e) => ({
  id: e.id, name: `${e.name} · ${e.vayu}`, sub: `${e.vayu} vayu`, icon: `icons/occult/element-${e.id}.png`, color: e.color,
  pos: P(VAYU_PLACE[e.id].pos), size: 0.075,
  fields: [
    F('Element', e.name.toLowerCase(), { src: 'UM, WB' }),
    F('Hebrew letter', e.hebrew, { src: 'WB finger table, UM', ...(e.hebrewNote ? { q: true, note: e.hebrewNote } : {}) }),
    F('Type of prana', e.vayu.toLowerCase(), { src: 'UM, WB' }),
    F('Bodily function', e.func, { src: 'UM, WB' }),
    F('Property', e.prop, { src: 'UM, WB' }),
    F('State of being', e.state, { src: 'UM, WB' }),
    F('Sense', e.sense, { src: 'UM, WB' }),
    F('Inner sense', e.inner, { src: 'UM, WB' }),
    F('Hindu', e.hindu, { src: 'UM, WB', ...(e.hinduNote ? { q: true, note: e.hinduNote } : {}) }),
    F('Mudra (vayu panel)', e.mudra, { src: 'UM p5' }),
    F('Finger (Universal Map)', e.fingerUM, { src: 'UM' }),
    F('Finger (whiteboard table)', e.fingerWB, { src: 'WB', ...(e.fingerWB !== e.fingerUM ? { q: true, note: 'Your whiteboard finger table and the Universal Map hand disagree here. The hand layer follows the Universal Map.' } : {}) }),
    F('Dimension', e.world, { src: 'WB' }),
    ...(e.number ? [F('Number', e.number, { src: 'WB' })] : []),
    F('Elementals', e.elemental, { src: 'WB planes table' }),
    ...(e.four ? [
      F('Gospel', e.four[0], { src: 'WB' }), F('Season', e.four[1], { src: 'WB' }), F('Gift of the Holy Spirit', e.four[2], { src: 'WB' }),
      F('Meditation', e.four[3], { src: 'WB' }), F('Moon phase', e.four[4], { src: 'WB' }), F('Day time', e.four[5], { src: 'WB' }),
    ] : []),
  ],
  placement: VAYU_PLACE[e.id].text,
  show: VAYU_PLACE[e.id].show,
}));

// ---------- 3. Pineal / pituitary / thalamus trinity (WB) ----------
const trinityCenter = mean([pineal, pituitary, thalamus]);
const out = (p) => p.clone().add(p.clone().sub(trinityCenter).normalize().multiplyScalar(0.014));
const TRINITY = [
  { id: 'pineal', name: 'Pineal gland', sub: 'father', at: pineal, glyph: '🜍', glyphName: 'sulphur', color: '#f2c14e',
    fields: [F('Trinity', 'pineal (father)'), F('Polarity', '(not marked on the board)', { q: true }), F('Trinity triangle', 'father - thought · sulphur - rajas · prana (breath)'),
      F('Three primes: sulfur', 'masculine · father · soul · sun · active · rajas · fahat', { src: 'WB alchemy table' })],
    note: 'The prana entry differs between two of your tables: the trinity triangle pairs prana (breath) with father / sulphur, the three-primes table pairs prana with mercury.',
    show: ['visceral/Pineal gland'] },
  { id: 'pituitary', name: 'Pituitary gland', sub: 'holy spirit', at: pituitary, glyph: '☿', glyphName: 'mercury', color: '#c9d3e6',
    fields: [F('Trinity', 'pituitary (holy spirit)'), F('Polarity', 'ying (-)'), F('Trinity triangle', 'mother - holy spirit · mercury - tamas · mudra (gesture)'),
      F('Three primes: mercury', 'feminine · mother (holy spirit) · spirit · moon · passive · tamas · prana', { src: 'WB alchemy table' })],
    note: 'The prana entry differs between two of your tables: the trinity triangle pairs prana (breath) with father / sulphur, the three-primes table pairs prana with mercury.',
    show: ['visceral/Adenohypophysis', 'visceral/Neurohypophysis'] },
  { id: 'thalamus', name: 'Thalamus', sub: 'son', at: thalamus, glyph: '🜔', glyphName: 'salt', color: '#ffffff',
    fields: [F('Trinity', 'thalamus (son)'), F('Polarity', 'yang (+)'), F('Trinity triangle', 'son - verb · salt - sattva · mantra (sound)'),
      F('Three primes: salt', 'neuter · son · body (matter) · earth · neutral (trans-active) · sattva · kundalini', { src: 'WB alchemy table' })],
    show: ['nervous/Thalamus.r', 'nervous/Thalamus.l'] },
];
const trinity = TRINITY.map((t) => ({
  id: t.id, name: t.name, sub: t.sub, glyph: t.glyph, glyphName: t.glyphName, color: t.color,
  pos: P(out(t.at)), anchor: P(t.at), size: 0.013, view: [-1, 0.12, 0.25],
  fields: t.fields.map((f) => ({ src: 'WB trinity triangle', ...f })),
  note: t.note,
  placement: `On the ${t.name.toLowerCase()} itself (the line points to it). The symbol is the alchemical ${t.glyphName} sign, from the ${t.glyphName} row your whiteboard pairs with this gland.`,
  show: { label: `Show ${t.name.toLowerCase()}`, names: t.show },
}));

// ---------- 4. Hand map (UM p1 hand, codes from UM p6/p7) ----------
const SIGNS = { Z1: ['♈', 'aries'], Z2: ['♉', 'taurus'], Z3: ['♊', 'gemini'], Z4: ['♋', 'cancer'], Z5: ['♌', 'leo'], Z6: ['♍', 'virgo'], Z7: ['♎', 'libra'], Z8: ['♏', 'scorpio'], Z9: ['♐', 'sagitarius'], Z10: ['♑', 'capricorn'], Z11: ['♒', 'aquarius'], Z12: ['♓', 'pisces'] };
const PLANETS = { P1: ['☽', 'moon', '#ff5a4e'], P2: ['☿', 'mercury', '#ff9a52'], P3: ['♀', 'venus', '#ffd23a'], P4: ['☉', 'sun', '#3fbf6f'], P5: ['♂', 'mars', '#4aa3e0'], P6: ['♃', 'jupiter', '#8a5cf0'], P7: ['♄', 'saturn', '#a98bf0'], P8: ['♆', 'neptune', '#a08a7a'] };
const FINGERS = [
  { n: 'first', id: 'thumb', name: 'Thumb', el: 'fire', code: 'E5', segs: { distal: 'P5', proximal: 'P6' } },
  { n: 'second', id: 'index', name: 'Index finger', el: 'air', code: 'E4', segs: { distal: 'Z1', middle: 'Z2', proximal: 'Z3' }, mount: 'P6' },
  { n: 'third', id: 'middle', name: 'Middle finger', el: 'aether', code: 'E3', segs: { distal: 'Z10', middle: 'Z11', proximal: 'Z12' }, mount: 'P7' },
  { n: 'fourth', id: 'ring', name: 'Ring finger', el: 'earth', code: 'E2', segs: { distal: 'Z4', middle: 'Z5', proximal: 'Z6' }, mount: 'P4' },
  { n: 'fifth', id: 'pinky', name: 'Little finger (pinky)', el: 'water', code: 'E1', segs: { distal: 'Z7', middle: 'Z8', proximal: 'Z9' }, mount: 'P2' },
];
const ZODIAC_RED = '#e0453a';
const handItems = [];
const handLines = [];
const handFrames = {};
for (const side of ['r', 'l']) {
  const sideName = side === 'r' ? 'right' : 'left';
  const palm = await centroid('regions', `Palm.${side}`), dorsum = await centroid('regions', `Dorsum of hand.${side}`);
  const n = palm.clone().sub(dorsum).normalize(); // palm-facing direction
  const mc = {};
  for (const [i, f] of FINGERS.entries()) {
    const ord = ['First', 'Second', 'Third', 'Fourth', 'Fifth'][i];
    const vs = await verts('skeletal', `${ord} metacarpal bone.${side}`);
    const prox = await centroid('skeletal', `Proximal phalanx of ${f.n} finger of hand.${side}`);
    const sorted = [...vs].sort((a, b) => a.distanceTo(prox) - b.distanceTo(prox));
    const k = Math.max(1, Math.floor(vs.length * 0.15));
    mc[f.id] = { head: mean(sorted.slice(0, k)), base: mean(sorted.slice(-k)), c: mean(vs) };
  }
  const radial = mc.index.c.clone().sub(mc.pinky.c).normalize(); // toward the thumb
  const onPalm = (p, lift = 0.011) => p.clone().addScaledVector(n, lift);
  // Selecting anything on a hand frames the whole hand, centred on the knuckle of the middle finger.
  const frame = { c: P(mc.middle.head), r: 0.12, view: P(n) };
  handFrames[side] = frame;
  const glyphItem = (id, name, code, pos, extra = []) => {
    const isSign = code.startsWith('Z');
    const [glyph, label, pc] = isSign ? SIGNS[code] : PLANETS[code];
    return { id: `${id}-${side}`, name, sub: `${sideName} hand`, glyph, color: isSign ? ZODIAC_RED : pc, pos: P(pos), size: 0.0105, frame,
      fields: [F(isSign ? 'Zodiac sign' : 'Planet', `${glyph} ${label}`), F('Board code', code), ...extra].map((f) => ({ src: 'UM hand', ...f })) };
  };
  for (const f of FINGERS) {
    const el = ELEMENTS.find((e) => e.id === f.el);
    const segs = Object.entries(f.segs);
    let distalC, proxC;
    for (const [seg, code] of segs) {
      const c = await centroid('skeletal', `${seg[0].toUpperCase() + seg.slice(1)} phalanx of ${f.n} finger of hand.${side}`);
      if (seg === 'distal') distalC = c;
      if (seg === 'proximal') proxC = c;
      handItems.push(glyphItem(`${f.id}-${seg}`, `${f.name}, ${seg} phalanx`, code, onPalm(c, 0.009),
        [F('Finger element', `${el.name.toLowerCase()} (${f.code})`)]));
    }
    // The finger's element symbol floats just past the fingertip, as on the Universal Map.
    const along = distalC.clone().sub(proxC).normalize();
    handItems.push({ id: `${f.id}-element-${side}`, name: `${f.name}: ${el.name.toLowerCase()}`, sub: `${sideName} hand`, icon: `icons/occult/element-${el.id}.png`, color: el.color,
      pos: P(distalC.clone().addScaledVector(along, 0.026)), size: 0.016, frame,
      fields: [F('Element', `${el.name.toLowerCase()} (${f.code})`, { src: 'UM hand' }),
        F('Whiteboard finger table says', `${ELEMENTS.find((e) => e.fingerWB === f.id).name.toLowerCase()}`, { src: 'WB', ...(ELEMENTS.find((e) => e.fingerWB === f.id).id !== el.id ? { q: true, note: 'Your whiteboard finger table and the Universal Map hand disagree. This layer follows the Universal Map.' } : {}) }),
        F('Segments (tip to base)', segs.map(([, c]) => (SIGNS[c] || PLANETS[c]).slice(0, 2).join(' ')).join(' · '), { src: 'UM hand' }),
        ...(f.mount ? [F('Mount at the base', PLANETS[f.mount].slice(0, 2).join(' '), { src: 'UM hand' })] : []),
        F('Mudra (vayu panel)', el.mudra, { src: 'UM p5' })] });
  }
  // Mounts on the palm, placed on the metacarpals as on the Universal Map hand.
  const lerp = (a, b, t) => a.clone().lerp(b, t);
  handItems.push(glyphItem('mount-index', 'Base of the index finger', 'P6', onPalm(lerp(mc.index.head, mc.index.base, 0.18))));
  handItems.push(glyphItem('mount-middle', 'Base of the middle finger', 'P7', onPalm(lerp(mc.middle.head, mc.middle.base, 0.18))));
  handItems.push(glyphItem('mount-ring', 'Base of the ring finger', 'P4', onPalm(lerp(mc.ring.head, mc.ring.base, 0.18))));
  handItems.push(glyphItem('mount-pinky', 'Base of the little finger', 'P2', onPalm(lerp(mc.pinky.head, mc.pinky.base, 0.35).addScaledVector(radial, -0.006))));
  handItems.push(glyphItem('mars-inner', 'Palm between thumb and index finger', 'P5', onPalm(lerp(mc.index.head, mc.index.base, 0.55).addScaledVector(radial, 0.012))));
  handItems.push(glyphItem('venus', 'Ball of the thumb (thenar)', 'P3', onPalm(lerp(mc.thumb.base, mc.middle.base, 0.35), 0.016)));
  handItems.push(glyphItem('mars-outer', 'Upper hypothenar (outer palm edge)', 'P5', onPalm(lerp(mc.pinky.head, mc.pinky.base, 0.62).addScaledVector(radial, -0.008))));
  handItems.push(glyphItem('moon', 'Lower hypothenar (outer palm edge)', 'P1', onPalm(lerp(mc.pinky.head, mc.pinky.base, 1.05).addScaledVector(radial, -0.006), 0.014)));
  handItems.push(glyphItem('neptune', 'Wrist crease', 'P8', onPalm(await centroid('regions', `Anterior region of wrist.${side}`), 0.004)));
}
// Mudra table (UM p6 / WB): neurotransmitter, mudra, spinal level.
const MUDRAS = [
  ['glutamate', 'vaya', 'C8-T2'], ['serotonin', 'gyan / prana', 'C1-C7'], ['norepinepherene', 'linga', 'T1-T6'], ['gaba', 'buddha', 'T7-T12'],
  ['endorphins', 'anjali / prayer', 'LUMBAR'], ['histamine', 'surya', 'C6-C7'], ['epinepherene', 'mushti', 'C5-T1'], ['oxytocin', 'bhramara', 'C8; L4-L5'],
  ['melatonin', 'shakti', 'SACRAL'], ['acetylcholine', 'lotus-padma', 'L4-S'], ['all at once', 'hakini', 'C,T,L,S'],
];
const VERT = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1', 'L2', 'L3', 'L4', 'L5', 'S'];
const vertKey = (v) => (v === 'C1' ? 'skeletal/Atlas (C1)' : v === 'C2' ? 'skeletal/Axis (C2)' : v === 'S' ? 'skeletal/Sacrum' : `skeletal/Vertebra ${v}`);
// Spinal nerves leave the spine next to the vertebra of the same name; C8 has no vertebra and leaves between C7 and T1.
const vrange = (a, b) => VERT.slice(VERT.indexOf(a), VERT.indexOf(b) + 1);
function levels(spec) {
  const out = new Set();
  for (const part of spec.split(';').map((s) => s.trim())) {
    if (part === 'LUMBAR') vrange('L1', 'L5').forEach((v) => out.add(v));
    else if (part === 'SACRAL') out.add('S');
    else if (part === 'C,T,L,S') VERT.forEach((v) => out.add(v));
    else if (part === 'L4-S') vrange('L4', 'S').forEach((v) => out.add(v));
    else {
      const [a, b = a] = part.split('-').map((s) => s.replace(/^C8$/, 'C8'));
      const from = a === 'C8' ? 'C7' : a, to = b === 'C8' ? 'T1' : b;
      vrange(from, to).forEach((v) => out.add(v));
    }
  }
  return [...out];
}
const mudras = MUDRAS.map(([nt, name, spine]) => ({
  id: `mudra-${name.replace(/[^a-z]+/g, '-')}`, name: `${name.replace(/(^|[\s/-])\w/g, (m) => m.toUpperCase())} mudra`, sub: 'mudra', listOnly: true, color: '#e6c27a',
  fields: [F('Mudra', name, { src: 'UM p6, WB' }), F('Neurotransmitter', nt, { src: 'UM p6, WB' }), F('Spinal', spine.replace('CI', 'C1'), { src: 'UM p6, WB' })],
  placement: `"Show on spine" lights up the vertebrae where the ${spine} spinal nerves leave the spine${/C8/.test(spine) ? ' (there is no C8 vertebra; the C8 nerve leaves between C7 and T1, so both are lit)' : ''}. Spinal cord segments sit higher than the vertebrae of the same name, so this shows the nerve exit levels, not the cord segments.`,
  show: { label: 'Show on spine', names: levels(spine).map(vertKey) },
}));
const fingerItems = FINGERS.map((f) => {
  const el = ELEMENTS.find((e) => e.id === f.el);
  return { id: `finger-${f.id}`, name: f.name, sub: `${el.name.toLowerCase()} finger`, icon: `icons/occult/element-${el.id}.png`, color: el.color, listOnly: true, focusIds: [`${f.id}-element-r`], frame: handFrames.r,
    fields: [F('Element', `${el.name.toLowerCase()} (${f.code})`, { src: 'UM hand' }),
      F('Segments (tip to base)', Object.values(f.segs).map((c) => (SIGNS[c] || PLANETS[c]).slice(0, 2).join(' ')).join(' · '), { src: 'UM hand' }),
      ...(f.mount ? [F('Mount at the base', PLANETS[f.mount].slice(0, 2).join(' '), { src: 'UM hand' })] : []),
      F('Whiteboard finger table says', ELEMENTS.find((e) => e.fingerWB === f.id).name.toLowerCase(), { src: 'WB', ...(ELEMENTS.find((e) => e.fingerWB === f.id).id !== el.id ? { q: true, note: 'Your whiteboard finger table and the Universal Map hand disagree. This layer follows the Universal Map.' } : {}) })],
    placement: 'Shown on both hands. The Universal Map draws one palm; palmistry places the same mounts on both hands, so the same map is used for each.' };
});
const palmItems = [
  ['venus', 'Ball of the thumb', 'P3'], ['mars-inner', 'Inner Mars', 'P5'], ['mars-outer', 'Outer Mars', 'P5'], ['moon', 'Lower hypothenar', 'P1'], ['neptune', 'Wrist crease', 'P8'],
];

// ---------- 5. Tree of Life (WB) ----------
const R = -1; // the body's right side is -x
const z0 = 0.0;
const SEPH = [
  { id: 'keter', name: 'Keter', num: 1, he: 'כתר', board: 'כתר', pillar: 'middle', pos: V(0, skullTop.y + 0.075, skullTop.z), place: 'Above the crown of the head.', fields: [] },
  { id: 'chokmah', name: 'Chokmah', num: 2, he: 'חכמה', board: 'הכמה', pillar: 'mercy', pos: V(R * (headHalfWidth + 0.03), eyebrows.y + 0.02, z0), place: 'The right side of the head.',
    fields: [F('Hebrew name', 'mazleth?'), F('Planet', 'the zodiac'), F('Archangel', 'raziel'), F('Angelic order', 'ephorim'), F('Meaning', 'wisdom')] },
  { id: 'binah', name: 'Binah', num: 3, he: 'בינה', board: 'בינה', boardName: 'SINAH', pillar: 'severity', pos: V(-R * (headHalfWidth + 0.03), eyebrows.y + 0.02, z0), place: 'The left side of the head.',
    fields: [F('Hebrew name', 'shabbatais'), F('Planet', 'saturn'), F('Archangel', 'zaphikiel'), F('Angelic order', 'ardim'), F('Meaning', 'understanding')] },
  { id: 'daat', name: 'Daat', num: null, he: 'דעת', board: 'תעד', pillar: 'middle', pos: V(0, thyroidCart.y, z0), place: 'The throat.',
    fields: [F('Hebrew name', 'levanah'), F('Planet', 'sirus'), F('Archangel', 'xxx'), F('Angelic order', 'seraphim'), F('Meaning', 'knowledge')] },
  { id: 'chesed', name: 'Chesed', num: 4, he: 'חסד', board: 'תסד', pillar: 'mercy', pos: shoulderR.clone().setZ(z0), place: 'The right shoulder (the head of the humerus).',
    fields: [F('Hebrew name', 'tzedek'), F('Planet', 'jupiter'), F('Archangel', 'zadikiel'), F('Angelic order', '?hermolim?'), F('Meaning', 'kindess')] },
  { id: 'gevurah', name: 'Gevurah', num: 5, he: 'גבורה', board: 'גבורה', pillar: 'severity', pos: shoulderL.clone().setZ(z0), place: 'The left shoulder (the head of the humerus).',
    fields: [F('Hebrew name', '???'), F('Planet', 'mars'), F('Archangel', '??? & uriel'), F('Angelic order', 'serophim'), F('Meaning', 'judgement')] },
  { id: 'tiferet', name: 'Tiferet', num: 6, he: 'תפארת', board: 'תפארת', pillar: 'middle', pos: V(0, heart.y, z0), place: 'The heart.',
    fields: [F('Meaning', 'beauty')], empty: true },
  { id: 'netzach', name: 'Netzach', num: 7, he: 'נצח', board: 'נצת', pillar: 'mercy', pos: hipR.clone().setZ(z0), place: 'The right hip (the greater trochanter of the femur).',
    fields: [F('Hebrew name', 'nogah'), F('Planet', 'venus'), F('Archangel', 'haniel'), F('Angelic order', 'elohim'), F('Meaning', 'victory')] },
  { id: 'hod', name: 'Hod', num: 8, he: 'הוד', board: 'הוד', pillar: 'severity', pos: hipL.clone().setZ(z0), place: 'The left hip (the greater trochanter of the femur).',
    fields: [F('Hebrew name', '???'), F('Planet', 'mercury'), F('Archangel', 'raphael'), F('Angelic order', 'beni elohim'), F('Meaning', 'splendor')] },
  { id: 'yesod', name: 'Yesod', num: 9, he: 'יסוד', board: '‘סוד', pillar: 'middle', pos: V(0, pubic.y, z0), place: 'The genitals (level with the pubic symphysis).',
    fields: [F('Hebrew name', 'levanah'), F('Planet', 'moon'), F('Archangel', 'gabriel'), F('Angelic order', 'cherubim'), F('Meaning', 'foundation')] },
  { id: 'malkuth', name: 'Malkuth', num: 10, he: 'מלכות', board: 'מלכות', pillar: 'middle', pos: V(0, 0.02, 0.02), place: 'The feet.',
    fields: [F('Hebrew name', 'eholem ?? yesodoh'), F('Planet', 'matter / elements / earth'), F('Archangel', 'sanda????'), F('Angelic order', '(not on the board)', { q: true }), F('Meaning', 'kingdom')] },
];
const PILLAR = { mercy: { name: 'Jachin, pillar of mercy', color: '#f4f1e8' }, severity: { name: 'Boaz, pillar of severity', color: '#7d8796' }, middle: { name: 'Middle pillar', color: '#e0b04a' } };
const tree = SEPH.map((s) => {
  const fields = [...s.fields];
  if (s.num) fields.unshift(F('Number', s.num));
  fields.push(F('Pillar', PILLAR[s.pillar].name));
  fields.push(F('Hebrew', s.he === s.board ? s.he : `${s.he}`, s.he === s.board ? {} : { q: true, note: `Your board writes ${s.board}; the standard spelling is ${s.he}.` }));
  if (s.boardName) fields.push(F('Name on the board', s.boardName, { q: true, note: `Your board labels this sephira "${s.boardName}"; its Hebrew (${s.he}) reads Binah.` }));
  if (!s.fields.length) fields.push(F('Correspondences', '(nothing on the board yet)', { q: true }));
  if (s.empty) fields.push(F('Hebrew name / planet / archangel', '(not on the board yet)', { q: true }));
  return { id: s.id, name: s.name, sub: s.num ? `sephira ${s.num}` : 'hidden sephira', num: s.num, he: s.he, color: PILLAR[s.pillar].color, pillar: s.pillar,
    pos: P(s.pos), size: 0.05, fields: fields.map((f) => ({ src: 'WB', ...f })),
    placement: `${s.place} This uses the common body mapping of the Tree (as in the Golden Dawn middle pillar exercise), with the pillar of mercy on the body's right and severity on the left, matching your board (Jachin "cherub of the right", Boaz "cherub of the left").` };
});
const PATHS = [[1, 2], [1, 3], [1, 6], [2, 3], [2, 6], [2, 4], [3, 6], [3, 5], [4, 5], [4, 6], [4, 7], [5, 6], [5, 8], [6, 7], [6, 8], [6, 9], [7, 8], [7, 9], [7, 10], [8, 9], [8, 10], [9, 10]];
const byNum = Object.fromEntries(tree.filter((s) => s.num).map((s) => [s.num, s.pos]));
const pillars = [
  { id: 'jachin', name: 'Jachin', sub: 'white pillar · mercy', color: PILLAR.mercy.color, listOnly: true, focusIds: ['chesed'],
    fields: [F('Meaning', 'he will establish'), F('Pillar', 'the white pillar of the south'), F('Figures', 'adam - ptah - vishnu - osiris'), F('Principle', 'masculine principles of creation'),
      F('Polarity', 'positive polarity - pingala - yang - lady of creation'), F('Also', 'the pillar of light and force · fire - divine spark · cherub of the right · column of mercy'),
      F('Archangel', 'metatron'), F('Symbol', 'the dagger - the moon'), F('Qualities', 'yang - masculine - active ( + ) - luminous - spiritual - objectify - offensive')].map((f) => ({ src: 'WB', ...f })) },
  { id: 'boaz', name: 'Boaz', sub: 'black pillar · severity', color: PILLAR.severity.color, listOnly: true, focusIds: ['gevurah'],
    fields: [F('Meaning', 'inner strength'), F('Pillar', 'the black pillar of the north'), F('Figures', 'eve - holy spirit - shiva - isis'), F('Principle', 'feminine principles of creation'),
      F('Polarity', 'negative polarity - ida - yin - lady of evolution'), F('Also', 'the pillar of clouds and form · merkabah - ruach elohim (spirit of God) · cherub of the left · column of severity (rigour)'),
      F('Archangel', 'sandalphon'), F('Symbol', 'the cup - the sun'), F('Qualities', 'ying - feminine - passive ( - ) - dark - material - subjectivity - defensive')].map((f) => ({ src: 'WB', ...f })) },
  { id: 'middle-pillar', name: 'Middle pillar', sub: 'column of balance', color: PILLAR.middle.color, listOnly: true, focusIds: ['tiferet'],
    fields: [F('Column', 'column of balance'), F('Qualities', 'tau - neuter - neutral - aur'), F('Nature', 'neither active nor passive')].map((f) => ({ src: 'WB', ...f })) },
];

// ---------- 6. Nadis and kundalini ----------
const CH = Object.fromEntries(chakras.map((c) => [c.id, V(...c.pos)]));
const order = ['muladhara', 'svadhisthana', 'manipura', 'anahata', 'vishuddha', 'ajna'];
const AMP = 0.028; // how far ida and pingala swing to either side of the spinal canal
function sideNadi(firstSide, nostrilPt) {
  const pts = [];
  for (let i = 0; i < order.length - 1; i++) {
    const a = CH[order[i]], b = CH[order[i + 1]], s = i % 2 === 0 ? firstSide : -firstSide;
    for (let k = 0; k < 12; k++) {
      const t = k / 12, y = a.y + (b.y - a.y) * t;
      pts.push(V(s * AMP * Math.sin(Math.PI * t), y, i === order.length - 2 ? a.z + (b.z - a.z) * t : zAt(y)));
    }
  }
  const aj = CH.ajna;
  pts.push(aj.clone());
  const sx = Math.sign(nostrilPt.x);
  pts.push(V(sx * 0.008, (aj.y + nasalCavity.y) / 2 + 0.01, (aj.z + nasalCavity.z) / 2));
  pts.push(V(sx * 0.009, nasalCavity.y, nasalCavity.z));
  pts.push(nostrilPt.clone());
  return pts;
}
const coilBase = coccyxTip.clone().add(V(0, 0.012, 0.004));
const coil = [];
for (let i = 0; i <= 3.5 * 32; i++) {
  const a = (i / 32) * Math.PI * 2;
  coil.push(V(Math.cos(a) * 0.011, coilBase.y + (i / (3.5 * 32)) * 0.022, coilBase.z + Math.sin(a) * 0.011));
}
const nadis = [
  { id: 'sushumna', name: 'Sushumna', sub: 'central nadi', color: '#f3e3b0', radius: 0.0032, points: sushumna.map(P),
    fields: [F('Path', 'Through the middle of the body, from the base of the spine to the crown')],
    placement: 'Traced through the real central canal: from the tip of the coccyx up the sacral canal and lumbar cistern (around the cauda equina), into the central canal of the spinal cord, through the central canal of the medulla, the fourth ventricle, the aqueduct of the midbrain and the third ventricle. The last stretch, from the third ventricle to the crown, has no anatomical canal; it is drawn straight up to the top of the skull.' },
  { id: 'ida', name: 'Ida', sub: 'chandra nadi · left · moon', color: '#a9cdfc', radius: 0.0022, points: sideNadi(-R, nostrilL).map(P),
    fields: [F('Also called', 'chandra nadi'), F('Pillar', 'Boaz: negative polarity - ida - yin - lady of evolution'), F('Moon', 'THA (MOON)', { note: 'Your board lists THA (MOON) and HA (SUN); pairing tha with ida and ha with pingala is the traditional reading of hatha.' }), F('Ends at', 'the left nostril', { src: 'traditional' })].map((f) => ({ src: 'WB', ...f })),
    placement: 'Starts at the left of muladhara, crosses the sushumna at each chakra up to ajna (left, right, left, right, left between them) and ends at the left nostril, passing through the nasal cavity. Distance from the centre line between crossings: 2.8 cm.' },
  { id: 'pingala', name: 'Pingala', sub: 'surya nadi · right · sun', color: '#ff7a59', radius: 0.0022, points: sideNadi(R, nostrilR).map(P),
    fields: [F('Also called', 'surya nadi'), F('Pillar', 'Jachin: positive polarity - pingala - yang - lady of creation'), F('Sun', 'HA (SUN)', { note: 'Your board lists THA (MOON) and HA (SUN); pairing tha with ida and ha with pingala is the traditional reading of hatha.' }), F('Ends at', 'the right nostril', { src: 'traditional' })].map((f) => ({ src: 'WB', ...f })),
    placement: 'Mirror of ida: starts at the right of muladhara, crosses the sushumna at each chakra up to ajna and ends at the right nostril.' },
  { id: 'kundalini', name: 'Kundalini', sub: 'coiled at muladhara', color: '#ffcc33', radius: 0.0018, points: coil.map(P),
    fields: [F('Three primes: salt', 'kundalini', { src: 'WB alchemy table' })],
    placement: 'Drawn as 3½ coils at the base of the spine (muladhara, at the tip of the coccyx), the traditional resting form. When it rises it travels up the sushumna.' },
];

// ---------- 7. Electric / magnetic polarity (WB table, verbatim) ----------
const POLARITY_ROWS = [
  ['head', 'THE HEAD', 'F (face) is electric · B is magnetic · R side is magnetic · L side is electric · interior is electric'],
  ['eyes', 'THE EYES', 'F & B are neutral · R & L sides are electric · interior is magnetic'],
  ['ears', 'THE EARS', 'F & B are neutral · R side is magnetic · L side is electric · interior is neutral'],
  ['mouth', 'THE MOUTH AND TONGUE', 'F & B are neutral · R & L side are neutral · interior is magnetic'],
  ['neck', 'THE NECK', 'F & B are magnetic · R side is magnetic · L side is electric · interior is electric'],
  ['back', 'THE BACK (SHOULDERS)', 'is electric'],
  ['chest', 'THE CHEST', 'F is electro-magnetic · R side is neutral · L side is electric · interior is neutral'],
  ['abdomen', 'THE ABDOMEN', 'F is electric · B & part R is magnetic · L side is electric · interior is magnetic'],
  ['hands', 'THE HANDS', 'B & palms are neutral · R side is magnetic · L side is electric · interior is magnetic'],
  ['fingers', 'THE FINGERS (R & L)', 'B & bottoms are neutral · R & L side are electric · interior is neutral'],
  ['male', 'THE MALE ORGANS', 'F is electric · bottom is neutral · R & L side are neutral · interior is magnetic'],
  ['female', 'THE FEMALE ORGANS', 'F is magnetic · bottom is neutral · R & L side are neutral · interior is electric'],
  ['anus', 'THE LAST VERTABRAE ADJACENT TO THE ANUS', 'F & bottom are neutral · R & L side are neutral · interior is magnetic'],
];
const E = 'electric', M = 'magnetic', N = 'neutral', EM = 'electro-magnetic';
// Skin region -> [row, which surface, polarity]. Sides: R/L picked by the region's own side.
const lr = (r, l) => ({ r, l });
const SKIN = {
  'Frontal region': ['head', 'F (face)', E], 'Eyebrow': ['head', 'F (face)', E], 'Nasal region': ['head', 'F (face)', E], 'Buccal region': ['head', 'F (face)', E],
  'Infra-orbital region': ['head', 'F (face)', E], 'Mental region': ['head', 'F (face)', E], 'Mentolabial sulcus': ['head', 'F (face)', E], 'Zygomatic region': ['head', 'F (face)', E],
  'Nasolabial sulcus': ['head', 'F (face)', E], 'Parotideomasseteric region': ['head', 'F (face)', E],
  'Occipital region': ['head', 'B', M],
  'Temporal region': ['head', 'side', lr(M, E)], 'Mastoid region': ['head', 'side', lr(M, E)], 'Parietal region': ['head', 'side', lr(M, E)],
  'Orbital region': ['eyes', 'F', N],
  'Oral region': ['mouth', 'F', N], 'Angle of mouth': ['mouth', 'F', N], 'Labial commissure': ['mouth', 'F', N], 'Philtrum': ['mouth', 'F', N], 'Tubercle of upper lip': ['mouth', 'F', N],
  'Submandibular triangle': ['neck', 'F', M], 'Submental triangle': ['neck', 'F', M], 'Carotid triangle': ['neck', 'F', M], 'Muscular triangle': ['neck', 'F', M],
  'Posterior region of neck': ['neck', 'B', M],
  'Lateral region of neck': ['neck', 'side', lr(M, E)], 'Greater supraclavicular fossa': ['neck', 'side', lr(M, E)], 'Sternocleidomastoid region': ['neck', 'side', lr(M, E)], 'Lesser supraclavicular fossa': ['neck', 'side', lr(M, E)],
  'Scapular region': ['back', 'back', E], 'Interscapular region': ['back', 'back', E], 'Infrascapular region': ['back', 'back', E], 'Vertebral region': ['back', 'back', E], 'Triangle of auscultation': ['back', 'back', E],
  'Pectoral region': ['chest', 'F', EM], 'Inframammary region': ['chest', 'F', EM], 'Mammary region': ['chest', 'F', EM], 'Infraclavicular fossa': ['chest', 'F', EM], 'Presternal region': ['chest', 'F', EM], 'Deltopectoral triangle': ['chest', 'F', EM],
  'Lateral region of thorax': ['chest', 'side', lr(N, E)],
  'Epigastric region': ['abdomen', 'F', E], 'Umbilical region': ['abdomen', 'F', E], 'Umbilicus': ['abdomen', 'F', E], 'Hypochondriac region': ['abdomen', 'F', E], 'Hypogastric region': ['abdomen', 'F', E], 'Inguinal region': ['abdomen', 'F', E],
  'Lumbar region': ['abdomen', 'B', M], 'Lateral region of abdomen': ['abdomen', 'side', lr(M, E)],
  'Palm': ['hands', 'palms', N], 'Dorsum of hand': ['hands', 'B', N],
  'Palmar surfaces of digits of hand': ['fingers', 'bottoms', N], 'Dorsal surfaces of digits of hand': ['fingers', 'B', N], 'Nail plate': ['fingers', 'B', N], 'Perionyx': ['fingers', 'B', N],
  'Urogenital region': ['male', 'bottom', N], 'Anal region': ['anus', 'bottom', N],
};
for (const ear of ['Cavity of concha', 'Concha of auricle', 'Cymba conchae', 'Anterior notch of auricle', 'Antihelix', 'Antitragus', 'Apex of auricle', 'Auricular region', 'Auricular tubercle', 'Crura of antihelix', 'Eminentia conchae', 'Eminentia fossae triangularis', 'Eminentia scaphae', 'Fossa antihelica', 'Helix', 'Intertragic incisure', 'Lobule of auricle', 'Scapha', 'Tragus', 'Triangular fossa', 'Posterior auricular groove'])
  SKIN[ear] = ['ears', 'side', lr(M, E)];
// Interior structures, by catalog group or name.
const INTERIOR = [
  { row: 'head', pol: E, match: { file: 'nervous', group: 'Brain' } },
  { row: 'eyes', pol: M, match: { file: 'nervous', group: 'Eyeball' } },
  { row: 'mouth', pol: M, match: { names: ['visceral/Tongue'] } },
  { row: 'neck', pol: E, match: { names: ['visceral/Thyroid gland', 'visceral/Laryngopharynx', 'visceral/Epiglottis', 'skeletal/Thyroid cartilage', 'skeletal/Cricoid cartilage'] } },
  { row: 'chest', pol: N, match: { names: ['visceral/Superior lobe of right lung', 'visceral/Middle lobe of right lung', 'visceral/Inferior lobe of right lung', 'visceral/Superior lobe of left lung', 'visceral/Inferior lobe of left lung'], group: 'Heart', file: 'cardiovascular' } },
  { row: 'abdomen', pol: M, match: { names: ['visceral/Stomach', 'visceral/Duodenum', 'visceral/Jejunum', 'visceral/Ileum', 'visceral/Liver', 'visceral/Gallbladder', 'visceral/Pancreas', 'visceral/Ascending colon', 'visceral/Transverse colon', 'visceral/Descending colon', 'visceral/Kidney.r', 'visceral/Kidney.l', 'lymphoid/Spleen'] } },
  { row: 'hands', pol: M, match: { file: 'skeletal', regex: '^(First|Second|Third|Fourth|Fifth) metacarpal bone|^(Scaphoid|Lunate|Triquetrum|Pisiform|Trapezium|Trapezoid|Capitate|Hamate)' } },
  { row: 'fingers', pol: N, match: { file: 'skeletal', regex: 'phalanx of .* finger of hand' } },
  { row: 'male', pol: M, match: { names: ['visceral/Testis.r', 'visceral/Testis.l', 'visceral/Prostate'] } },
  { row: 'anus', pol: M, match: { names: ['skeletal/Coccyx'] } },
];
const polarityRows = POLARITY_ROWS.map(([id, title, text]) => ({ id: `pol-${id}`, name: title.replace(/^THE /, '').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()), sub: 'polarity table', listOnly: true, color: '#c05cff',
  fields: [F(title, text, { src: 'WB polarity table' })] }));
polarityRows.push({ id: 'pol-brain', name: 'The brain (Abel and Cain)', sub: 'polarity table', listOnly: true, color: '#c05cff',
  fields: [
    F('Right half of the brain', 'ABEL · corresponds to the LEFT side of the BODY', { src: 'WB' }),
    F('Left half of the brain', 'CAIN · corresponds to the RIGHT side of the BODY', { src: 'WB' }),
    F('The brain', 'able governs the R side · cain governs the L side · R ear · L ear · R eye · L eye · mouth · R nostril · L nostril', { src: 'WB', q: true, note: 'These two notes on your board point opposite ways: the first says Abel (right brain) goes with the left of the body, the second says Abel governs the right side.' }),
  ] });
const polarityLegend = [
  { id: 'electric', name: 'Electric', color: '#ff4d4d' }, { id: 'magnetic', name: 'Magnetic', color: '#4d8bff' },
  { id: 'neutral', name: 'Neutral', color: '#c8ced6' }, { id: 'electro-magnetic', name: 'Electro-magnetic', color: '#c05cff' },
  { id: 'none', name: 'Not in the table', color: '#3a4048' },
];

// ---------- Write ----------
const layers = [
  { id: 'chakras', name: 'Chakras', icon: 'icons/occult/chakra-anahata.png', color: '#43873f', items: chakras,
    about: 'The seven chakras from your mystical septenary, placed on the sushumna line at their traditional heights. Symbols are your Canva chakra icons.' },
  { id: 'elements', name: 'Elements & prana vayus', icon: 'icons/occult/element-fire.png', color: '#cc0000', items: elements,
    about: 'The elemental pentad: each element with its prana vayu, placed where that vayu works. Symbols are your Universal Map element icons.' },
  { id: 'trinity', name: 'Pineal · pituitary · thalamus', icon: 'icons/occult/trinity.svg', color: '#f2c14e', items: trinity,
    lines: [{ color: '#f2c14e', points: [P(pineal), P(pituitary), P(thalamus), P(pineal)] }, ...trinity.map((t) => ({ color: t.color, points: [t.anchor, t.pos], opacity: 0.6 }))],
    about: 'Your trinity triangle: pineal (father), pituitary (holy spirit) and thalamus (son), with their alchemical principles.' },
  { id: 'hands', name: 'Hand map & mudras', icon: 'icons/occult/hand.png', color: '#fbbd98', items: [...fingerItems, ...handItems, ...mudras],
    palm: palmItems,
    about: 'The Universal Map hand on both palms: the element of each finger, the zodiac sign of each phalanx and the planetary mounts. Below it, the mudra table with neurotransmitters and spinal levels.' },
  { id: 'tree', name: 'Tree of Life', icon: 'icons/occult/tree.svg', color: '#e0b04a', items: [...tree, ...pillars],
    lines: [
      ...PATHS.map(([a, b]) => ({ color: '#e0b04a', opacity: 0.6, points: [P(V(...byNum[a])), P(V(...byNum[b]))] })),
    ],
    about: 'The ten sephiroth and Daat on the body, with the 22 paths and the three pillars. Values are from your whiteboard; unsure cells are marked *.' },
  { id: 'nadis', name: 'Nadis & kundalini', icon: 'icons/occult/nadis.svg', color: '#f3e3b0', items: nadis, tubes: true,
    about: 'Sushumna through the real central canal, ida and pingala crossing at each chakra to the nostrils, and kundalini coiled at the base.' },
  { id: 'polarity', name: 'Electric / magnetic polarity', icon: 'icons/occult/polarity.svg', color: '#c05cff', items: polarityRows, legend: polarityLegend,
    skin: Object.fromEntries(Object.entries(SKIN).map(([k, v]) => [k, v])), interior: INTERIOR, rows: Object.fromEntries(POLARITY_ROWS.map(([id, title, text]) => [id, { title, text }])),
    about: 'Colours the skin and inner organs by your electric / magnetic table. Turn on Skin (and Organs, Nervous) to see it.' },
];
const SOURCES = {
  'WB': 'OCCULT ANATOMY OF MAN - WHITEBOARD (Canva)',
  'UM': 'UNIVERSAL MAP, page 1 (Canva)',
  'UM p5': 'UNIVERSAL MAP, page 5 (Canva)',
  'UM p6': 'UNIVERSAL MAP, page 6 (Canva)',
  '7C': '7 CHAKRAS, pages 1 and 3 (Canva)',
};
fs.writeFileSync('data/occult.json', JSON.stringify({ sources: SOURCES, layers }));
console.log('wrote data/occult.json', (fs.statSync('data/occult.json').size / 1024).toFixed(1), 'KB');
console.log('sushumna', sushumna.map((v) => v.toArray().map((x) => x.toFixed(3)).join(',')).join(' | '));
for (const c of chakras) console.log(c.id.padEnd(14), c.pos.join(', '));
for (const s of tree) console.log(s.id.padEnd(14), s.pos.join(', '));
console.log('nostrils', r3(nostrilL), r3(nostrilR), 'shoulders', r3(shoulderR), r3(shoulderL), 'hips', r3(hipR), r3(hipL));
