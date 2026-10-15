// Classify muscles as superficial / intermediate / deep by counting how many
// other muscles lie between each part of the muscle and the skin.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import fs from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
// Usage: node tools/muscle-depth.mjs <skin.glb> <muscular.glb> <catalog.json> <out.json>
const [,, skinFile, muscleFile, catalogFile, outFile] = process.argv;
const catalog = JSON.parse(fs.readFileSync(catalogFile));
const isMuscle = new Set(catalog.structures.filter((s) => s.file === 'muscular' && s.tags.includes('muscular')
  && !/Bursae|Tendon sheaths|^Fasciae/.test(s.groups.join('>'))).map((s) => s.name));

async function meshes(file, filter) {
  const doc = await io.read(file); const out = [];
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh(); if (!mesh || !filter(n.getName())) continue;
    const M = new THREE.Matrix4().fromArray(n.getWorldMatrix());
    for (const p of mesh.listPrimitives()) {
      const a = p.getAttribute('POSITION'), idx = p.getIndices(), e = [];
      const pos = new Float32Array(a.getCount() * 3), v = new THREE.Vector3();
      for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); v.set(e[0], e[1], e[2]).applyMatrix4(M); pos.set([v.x, v.y, v.z], i * 3); }
      out.push({ name: n.getName(), pos, index: idx ? Uint32Array.from(idx.getArray()) : null });
    }
  }
  return out;
}
function merge(list) {
  let nv = 0, ni = 0; for (const m of list) { nv += m.pos.length / 3; ni += m.index.length; }
  const pos = new Float32Array(nv * 3), index = new Uint32Array(ni), owner = new Int32Array(ni / 3);
  let vo = 0, io2 = 0; list.forEach((m, id) => {
    pos.set(m.pos, vo * 3); for (let i = 0; i < m.index.length; i++) index[io2 + i] = m.index[i] + vo;
    owner.fill(id, io2 / 3, (io2 + m.index.length) / 3); vo += m.pos.length / 3; io2 += m.index.length; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(index, 1));
  return { g, owner };
}
const skin = merge(await meshes(skinFile, (n) => !/hair/i.test(n)));
const skinBVH = new MeshBVH(skin.g);
const muscleList = await meshes(muscleFile, (n) => isMuscle.has(n));
const mus = merge(muscleList);
const musBVH = new MeshBVH(mus.g);
const ids = muscleList.map((m) => m.name);
const ray = new THREE.Ray(), hit = {}, target = { point: new THREE.Vector3() };
const res = {};
const byName = new Map(); muscleList.forEach((m, id) => (byName.get(m.name) || byName.set(m.name, []).get(m.name)).push({ m, id }));
// Parts of one muscle (e.g. the three parts of the deltoid) shouldn't count as covering each other.
const parentOf = new Map(catalog.structures.filter((s) => s.file === 'muscular').map((s) => [s.name, s.groups.at(-1) || '']));
const family = (name) => { const g = parentOf.get(name) || ''; return /muscles?$/i.test(g) ? g + (name.match(/\.[lr]$/) || [''])[0] : name; };
for (const [name, parts] of byName) {
  const fam = family(name); let total = 0, n = 0, exposed = 0;
  for (const { m } of parts) {
    const count = m.pos.length / 3, step = Math.max(1, Math.floor(count / 150));
    for (let i = 0; i < count; i += step) {
      const v = new THREE.Vector3(m.pos[i*3], m.pos[i*3+1], m.pos[i*3+2]);
      skinBVH.closestPointToPoint(v, target);
      const dist = target.point.distanceTo(v);
      if (dist < 0.002) { n++; exposed++; continue; }
      ray.origin.copy(v); ray.direction.copy(target.point).sub(v).normalize();
      ray.origin.addScaledVector(ray.direction, 0.0015);
      const hits = musBVH.raycast(ray, THREE.DoubleSide, 0, dist);
      const crossed = new Set(); for (const h of hits) { const o = mus.owner[h.faceIndex]; if (ids[o] !== name && family(ids[o]) !== fam) crossed.add(ids[o]); }
      total += Math.min(crossed.size, 3); if (!crossed.size) exposed++; n++;
    }
  }
  const mean = total / Math.max(n, 1), exp = exposed / Math.max(n, 1);
  res[name] = { mean: +mean.toFixed(2), exposed: +exp.toFixed(2) };
}
fs.writeFileSync(outFile, JSON.stringify(res));
const show = ['Clavicular part of deltoid','Clavicular head of pectoralis major','Gluteus maximus','Supraspinatus','Pectoralis minor','Gluteus medius','Gluteus minimus','Psoas major','Rotatores','Multifidus thoracis','Long head of biceps','Brachialis','Vastus intermedius','Rectus femoris','Soleus','Lateral head of gastrocnemius','Transversus abdominis','External oblique','Internal oblique','Rectus abdominis','Latissimus dorsi','Rhomboid major','Serratus anterior','Sternocleidomastoid','Masseter','Temporalis','Lateral pterygoid','Diaphragm','Descending part of trapezius','Levator scapulae','Splenius capitis','Semispinalis capitis','Flexor digitorum profundus','Flexor digitorum superficialis','Pronator quadratus','Tibialis posterior','Adductor magnus','Adductor longus'];
for (const s of show) for (const k of Object.keys(res).filter((k) => k.toLowerCase().startsWith(s.toLowerCase()) && !k.endsWith('.l')).slice(0, 1)) console.log(k.padEnd(48), res[k].mean, res[k].exposed);

