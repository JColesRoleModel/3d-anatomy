// Builds data/catalog.json: every structure, which systems it belongs to,
// and its sub-filter values (spine region, muscle depth, cranial nerve, ...).
// Usage: node tools/catalog.mjs data/catalog.json   (reads tools/meta/*.json)
import fs from 'fs';
import path from 'path';

const META = path.join(path.dirname(new URL(import.meta.url).pathname), 'meta');
const read = (f) => JSON.parse(fs.readFileSync(path.join(META, f)));

const opts = (list) => list.map(([id, name]) => ({ id, name }));
const SYSTEMS = [
  { id: 'skeletal', name: 'Skeletal', color: '#e9e2cf', facets: [
    { id: 'region', name: 'Region', options: opts([['skull', 'Skull & face'], ['teeth', 'Teeth'], ['cervical', 'Cervical spine'], ['thoracic', 'Thoracic spine'], ['lumbar', 'Lumbar spine'], ['sacral', 'Sacrum & coccyx'], ['ribs', 'Ribs & sternum'], ['arms', 'Shoulders & arms'], ['pelvis', 'Pelvis'], ['legs', 'Legs & feet'], ['cartilage', 'Nose & larynx cartilage']]) },
  ] },
  { id: 'muscular', name: 'Muscular', color: '#b5473f', facets: [
    { id: 'depth', name: 'Depth', options: opts([['superficial', 'Superficial'], ['intermediate', 'Intermediate'], ['deep', 'Deep'], ['sheaths', 'Tendon sheaths & bursae']]) },
    { id: 'region', name: 'Region', options: opts([['head', 'Head & face'], ['neck', 'Neck'], ['back', 'Back'], ['thorax', 'Chest'], ['abdomen', 'Abdomen'], ['pelvis', 'Pelvis'], ['arms', 'Arms & hands'], ['legs', 'Legs & feet']]) },
  ] },
  { id: 'fascia', name: 'Fascia', color: '#d8cfc4', facets: [
    { id: 'region', name: 'Region', options: opts([['head', 'Head & neck'], ['trunk', 'Trunk'], ['arms', 'Arms'], ['legs', 'Legs']]) },
  ] },
  { id: 'circulatory', name: 'Circulatory', color: '#c0303a', facets: [
    { id: 'kind', name: 'Vessels', options: opts([['heart', 'Heart'], ['arteries', 'Arteries'], ['veins', 'Veins'], ['pulmonary', 'Pulmonary vessels'], ['brain', 'Brain vessels & sinuses']]) },
  ] },
  { id: 'lymphatic', name: 'Lymphatic', color: '#5fae6a', facets: [
    { id: 'kind', name: 'Organs', options: opts([['thymus', 'Thymus'], ['spleen', 'Spleen'], ['tonsils', 'Tonsils'], ['nodes', 'Lymph nodes']]) },
  ] },
  { id: 'nervous', name: 'Nervous', color: '#e8c547', facets: [
    { id: 'part', name: 'Part', options: opts([['brain', 'Brain'], ['spinalcord', 'Spinal cord'], ['meninges', 'Meninges'], ['cranial', 'Cranial nerves'], ['spinal', 'Spinal nerves & plexuses'], ['autonomic', 'Autonomic'], ['eye', 'Eye & tear ducts'], ['ear', 'Ear']]) },
    { id: 'cn', name: 'Cranial nerve', options: opts([['I', 'I Olfactory'], ['II', 'II Optic'], ['III', 'III Oculomotor'], ['IV', 'IV Trochlear'], ['V', 'V Trigeminal'], ['VI', 'VI Abducens'], ['VII', 'VII Facial'], ['VIII', 'VIII Vestibulocochlear'], ['IX', 'IX Glossopharyngeal'], ['X', 'X Vagus'], ['XI', 'XI Accessory'], ['XII', 'XII Hypoglossal']]) },
  ] },
  { id: 'endocrine', name: 'Endocrine', color: '#9a6fd0', facets: [
    { id: 'gland', name: 'Gland', options: opts([['hypothalamus', 'Hypothalamus'], ['pituitary', 'Pituitary'], ['pineal', 'Pineal'], ['thyroid', 'Thyroid & parathyroid'], ['thymus', 'Thymus'], ['adrenal', 'Adrenal'], ['pancreas', 'Pancreas'], ['gonads', 'Gonads']]) },
  ] },
  { id: 'sinuses', name: 'Sinuses', color: '#5fb8d6', facets: [
    { id: 'kind', name: 'Sinus', options: opts([['frontal', 'Frontal'], ['sphenoid', 'Sphenoid'], ['ethmoid', 'Ethmoid'], ['nasal', 'Nasal cavity']]) },
  ] },
  { id: 'organs', name: 'Organs', color: '#d98a8a', facets: [
    { id: 'system', name: 'System', options: opts([['respiratory', 'Respiratory'], ['digestive', 'Digestive'], ['urinary', 'Urinary'], ['reproductive', 'Reproductive'], ['cavities', 'Body cavities']]) },
  ] },
  { id: 'skin', name: 'Skin & regions', color: '#d9b59a', facets: [
    { id: 'region', name: 'Region', options: opts([['head', 'Head'], ['neck', 'Neck'], ['thorax', 'Chest'], ['abdomen', 'Abdomen'], ['back', 'Back'], ['perineum', 'Perineum'], ['arms', 'Arms & hands'], ['legs', 'Legs & feet'], ['hair', 'Hair']]) },
  ] },
  { id: 'joints', name: 'Joints & ligaments', color: '#c9c3a8', facets: [
    { id: 'region', name: 'Region', options: opts([['skull', 'Skull & jaw'], ['larynx', 'Larynx'], ['spine', 'Spine'], ['thorax', 'Ribs & sternum'], ['arms', 'Shoulders & arms'], ['legs', 'Pelvis & legs']]) },
  ] },
];

// First matching rule wins. Each rule: [regex tested against "group > group > name", value].
const pick = (rules, text) => (rules.find(([re]) => re.test(text)) || [])[1];

const SKELETAL = [
  [/Teeth/, 'teeth'], [/Cervical vertebrae/, 'cervical'], [/Thoracic vertebrae/, 'thoracic'], [/Lumbar vertebrae/, 'lumbar'],
  [/Vertebral column/, 'sacral'], [/Thoracic skeleton/, 'ribs'], [/Bones of upper limb/, 'arms'], [/Bones of pelvic girdle/, 'pelvis'],
  [/Bones of lower limb/, 'legs'], [/Nasal cartilages|Laryngeal cartilages/, 'cartilage'], [/./, 'skull'],
];
const MUSCLE_REGION = [
  [/^Cranial part/, 'head'], [/^Cervical part/, 'neck'], [/^Dorsal part/, 'back'], [/^Thoracic part/, 'thorax'],
  [/^Abdominal part/, 'abdomen'], [/^Pelvic part/, 'pelvis'], [/upper limb/, 'arms'], [/lower limb/, 'legs'],
];
const FASCIA_REGION = [[/of head|Cervical/, 'head'], [/upper limb/, 'arms'], [/lower limb/, 'legs'], [/./, 'trunk']];
const VESSELS = [
  [/> Heart/, 'heart'], [/Pulmonary/, 'pulmonary'], [/Dural venous sinuses|Cerebral arterial circle|cerebral|Cranial veins/, 'brain'],
  [/Venous system/, 'veins'], [/./, 'arteries'],
];
const LYMPH = [[/Thymus/, 'thymus'], [/Spleen|spleen/, 'spleen'], [/Pharyngeal lymphoid ring|tonsil/i, 'tonsils'], [/./, 'nodes']];
const NERVOUS = [
  [/Meninges/, 'meninges'], [/Spinal cord/, 'spinalcord'], [/^Central/, 'brain'], [/Cranial nerves/, 'cranial'],
  [/Autonomic/, 'autonomic'], [/> Eye/, 'eye'], [/> Ear/, 'ear'], [/Peripheral/, 'spinal'],
];
const CRANIAL = [
  [/\((I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\)/, null], // handled below
  [/olfactory/i, 'I'], [/optic/i, 'II'], [/oculomotor/i, 'III'], [/trochlear/i, 'IV'], [/abducens/i, 'VI'],
  [/facial|chorda tympani|stapedius|petrosal/i, 'VII'], [/cochlear|vestibul/i, 'VIII'], [/glossopharyngeal/i, 'IX'],
  [/vagus|laryngeal/i, 'X'], [/accessory nerve/i, 'XI'], [/hypoglossal/i, 'XII'],
  [/trigeminal|maxillary|ophthalmic|mandibular|alveolar|mental|mylohyoid|lingual|buccal|auriculotemporal|masseteric|pterygoid|temporal|frontal|nasociliary|lacrimal|infraorbital|zygomatic|meningeal/i, 'V'],
];
function cranialNerve(name) {
  const roman = name.match(/\((I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\)/);
  return roman ? roman[1] : pick(CRANIAL.slice(1), name);
}
const ENDOCRINE = [
  [/Hypothalamus/, 'hypothalamus'], [/hypophysis|Hypophysis/, 'pituitary'], [/Pineal/, 'pineal'], [/hyroid/, 'thyroid'],
  [/thymus/i, 'thymus'], [/Suprarenal/, 'adrenal'], [/Pancrea/, 'pancreas'], [/Testis|Ovary/, 'gonads'],
];
const SINUS = [[/frontal bone/, 'frontal'], [/sphenoid bone/, 'sphenoid'], [/ethmoid/, 'ethmoid'], [/nasal cavity/, 'nasal']];
const ORGANS = [[/Respiratory/, 'respiratory'], [/Digestive/, 'digestive'], [/Urinary/, 'urinary'], [/Genital/, 'reproductive'], [/./, 'cavities']];
const SKIN = [
  [/^Hairs/, 'hair'], [/^Regions of head/, 'head'], [/^Regions of neck/, 'neck'], [/^Regions of thorax/, 'thorax'], [/^Regions of abdomen/, 'abdomen'],
  [/^Regions of back/, 'back'], [/^Regions of perineum/, 'perineum'], [/upper limb/, 'arms'], [/lower limb/, 'legs'],
];
const JOINTS = [[/^Joints of skull/, 'skull'], [/^Laryngeal/, 'larynx'], [/vertebral column/, 'spine'], [/^Thoracic/, 'thorax'], [/upper limb/, 'arms'], [/lower limb/, 'legs']];

const SINUS_NAME = /^(Sinus of (frontal|sphenoid) bone|(Anterior|Middle|Posterior) cells of ethmoid bone|Mucosa of nasal cavity)/;
const EXTRA_ENDOCRINE = /^(Pancreas|Testis|Ovary|Left lobe of thymus|Right lobe of thymus|Hypothalamus)/;

// Muscle depth: measured by tools/muscle-depth.mjs (how much of each muscle has other muscles between it and the skin),
// with textbook labels from the source grouping taking priority, plus a few corrections.
const depthData = read('muscle-depth.json');
const DEPTH_FIX = { 'Rectus abdominis muscle': 'superficial', 'Tibialis posterior muscle': 'deep', 'Vastus intermedius muscle': 'deep', 'Adductor magnus': 'deep', 'Transversus abdominis muscle': 'deep' };
function muscleDepth(name, groupPath) {
  if (/Bursae|Tendon sheaths/.test(groupPath)) return 'sheaths';
  const base = name.replace(/\.[lr]$/, '');
  if (DEPTH_FIX[base]) return DEPTH_FIX[base];
  // Note: "Superficial gluteal muscles" in the source is a functional group (it includes gluteus minimus), not a depth.
  if (/Superficial part of|Superficial muscles of head/.test(groupPath)) return 'superficial';
  if (/Deep part of|Deep gluteal|Transversospinal|Suboccipital|Interspinales/.test(groupPath)) return 'deep';
  if (/^Deep (part|head)/.test(name) && depthData[name]?.exposed >= 0.3) return 'intermediate';
  const d = depthData[name];
  if (!d) return 'intermediate';
  if (d.exposed >= 0.3) return 'superficial';
  if (d.exposed < 0.05 && d.mean >= 1.3) return 'deep';
  return 'intermediate';
}

const FILES = ['skeletal', 'muscular', 'cardiovascular', 'lymphoid', 'nervous', 'visceral', 'joints', 'regions'];
const structures = [];
for (const file of FILES) {
  for (const s of read(`${file}.json`)) {
    const gp = s.groups.join(' > ');
    const full = `${gp} > ${s.name}`;
    const tags = [], f = {};
    let color;
    switch (file) {
      case 'skeletal':
        tags.push('skeletal'); f['skeletal.region'] = pick(SKELETAL, gp); break;
      case 'muscular':
        if (/^Fasciae/.test(gp)) { tags.push('fascia'); f['fascia.region'] = pick(FASCIA_REGION, gp); break; }
        tags.push('muscular');
        f['muscular.region'] = pick(MUSCLE_REGION, gp);
        f['muscular.depth'] = muscleDepth(s.name, gp);
        if (f['muscular.depth'] === 'sheaths') color = '#cdbfa6';
        break;
      case 'cardiovascular':
        tags.push('circulatory'); f['circulatory.kind'] = pick(VESSELS, full);
        color = /Venous/.test(gp) ? '#3f62b5' : f['circulatory.kind'] === 'heart' ? '#a8323a' : '#c0303a';
        break;
      case 'lymphoid': tags.push('lymphatic'); f['lymphatic.kind'] = pick(LYMPH, full); break;
      case 'nervous': {
        tags.push('nervous'); const part = pick(NERVOUS, gp); f['nervous.part'] = part;
        if (part === 'cranial') { const cn = cranialNerve(s.name); if (cn) f['nervous.cn'] = cn; }
        if (part === 'brain' || part === 'spinalcord') color = '#e6c9b8';
        if (part === 'meninges') color = '#c9b29f';
        if (part === 'eye' || part === 'ear') color = /Lacrimal|lacrimal/.test(s.name) ? '#7fb3d9' : '#d9d0c0';
        break;
      }
      case 'visceral':
        if (/Endocrine glands/.test(gp)) tags.push('endocrine');
        else { tags.push('organs'); f['organs.system'] = pick(ORGANS, gp); }
        break;
      case 'joints': tags.push('joints'); f['joints.region'] = pick(JOINTS, gp); break;
      case 'regions':
        tags.push('skin'); f['skin.region'] = pick(SKIN, gp) || 'head';
        if (/^Hairs/.test(gp)) color = '#3a2a20';
        break;
    }
    if (SINUS_NAME.test(s.name)) { tags.push('sinuses'); f['sinuses.kind'] = pick(SINUS, s.name); color = '#5fb8d6'; }
    if (EXTRA_ENDOCRINE.test(s.name) && !tags.includes('endocrine')) tags.push('endocrine');
    if (tags.includes('endocrine')) f['endocrine.gland'] = pick(ENDOCRINE, s.name) || pick(ENDOCRINE, gp);
    for (const k of Object.keys(f)) if (f[k] == null) delete f[k];
    structures.push({ name: s.name, file, groups: s.groups, tags, f, ...(color ? { color } : {}) });
  }
}

fs.writeFileSync(process.argv[2], JSON.stringify({ systems: SYSTEMS, files: FILES, structures }));

// Summary so mistakes in the rules are easy to spot.
const counts = {};
for (const s of structures) for (const [k, v] of Object.entries(s.f)) counts[`${k}:${v}`] = (counts[`${k}:${v}`] || 0) + 1;
for (const sys of SYSTEMS) for (const fc of sys.facets) {
  const k = `${sys.id}.${fc.id}`;
  const missing = structures.filter((s) => s.tags.includes(sys.id) && !s.f[k]).length;
  console.log(k.padEnd(20), fc.options.map((o) => `${o.id}=${counts[`${k}:${o.id}`] || 0}`).join(' '), missing ? `(no value: ${missing})` : '');
}
