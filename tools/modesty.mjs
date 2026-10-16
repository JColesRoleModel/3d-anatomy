// Smooths the genitals out of the skin layer (models/regions.glb), like a mannequin.
// The penis and scrotum skin ("Urogenital region" .r and .l) is replaced by a smooth patch that spans the line
// where it met the thighs, belly and perineum, so there is no hole. "Pubic hairs" is removed.
// The organs layer still has the anatomical genitals.
//
// Usage: node tools/modesty.mjs   (run once on the regions model from tools/build.mjs; edits models/regions.glb
//        and tools/meta/regions.json in place, then run: node tools/catalog.mjs data/catalog.json)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import * as THREE from 'three';
import fs from 'fs';

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const FILE = 'models/regions.glb';
const doc = await io.read(FILE);
const root = doc.getRoot();
await doc.transform(dequantize());

for (const n of root.listNodes()) if (n.getName() === 'Pubic hairs') { n.getMesh()?.dispose(); n.dispose(); }

const parts = root.listNodes().filter((n) => /^Urogenital region\.[rl]$/.test(n.getName()));
if (parts.length !== 2) throw new Error('expected Urogenital region.r and .l');
const worldVerts = (n) => {
  const M = new THREE.Matrix4().fromArray(n.getWorldMatrix()), e = [], out = [];
  for (const prim of n.getMesh().listPrimitives()) {
    const a = prim.getAttribute('POSITION');
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); out.push(new THREE.Vector3(...e).applyMatrix4(M)); }
  }
  return out;
};
const genital = parts.flatMap(worldVerts);

// Neighbouring skin near the groin, as triangles.
const others = [];
for (const n of root.listNodes()) {
  if (!n.getMesh() || parts.includes(n)) continue;
  const M = new THREE.Matrix4().fromArray(n.getWorldMatrix()), e = [];
  for (const prim of n.getMesh().listPrimitives()) {
    const a = prim.getAttribute('POSITION'), idx = prim.getIndices(), vs = [];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); vs.push(new THREE.Vector3(...e).applyMatrix4(M)); }
    for (let i = 0; i < idx.getCount(); i += 3) {
      const t = new THREE.Triangle(vs[idx.getScalar(i)], vs[idx.getScalar(i + 1)], vs[idx.getScalar(i + 2)]);
      const c = t.getMidpoint(new THREE.Vector3());
      if (c.y > 0.66 && c.y < 0.92 && Math.abs(c.x) < 0.16 && c.z > -0.12) others.push(t);
    }
  }
}

// The attachment line: genital skin vertices that touch a neighbouring region.
const cp = new THREE.Vector3();
const rimPts = genital.filter((p) => others.some((t) => t.closestPointToPoint(p, cp).distanceTo(p) < 0.0025));
const c0 = rimPts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(rimPts.length);
// The line is a loop around the crotch. Order it by angle in its best-fit plane, in even steps.
const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
for (const p of rimPts) { const d = p.clone().sub(c0).toArray(); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]; }
const power = (M, avoid) => { // dominant eigenvector, orthogonal to `avoid`
  let v = new THREE.Vector3(1, 0.5, 0.3);
  for (let k = 0; k < 200; k++) {
    if (avoid) v.addScaledVector(avoid, -v.dot(avoid));
    v = new THREE.Vector3(...[0, 1, 2].map((i) => M[i][0] * v.x + M[i][1] * v.y + M[i][2] * v.z)).normalize();
  }
  if (avoid) v.addScaledVector(avoid, -v.dot(avoid)).normalize();
  return v;
};
const ax1 = power(cov), ax2 = power(cov, ax1);
const SEG = 72;
const bins = Array.from({ length: SEG }, () => []);
for (const p of rimPts) {
  const d = p.clone().sub(c0), ang = Math.atan2(d.dot(ax2), d.dot(ax1));
  bins[Math.floor(((ang + Math.PI) / (2 * Math.PI)) * SEG) % SEG].push(p);
}
// Where the scrotum lay against the thighs, touching points sit inside the loop; keep only the outermost per step.
const planeR = (p) => { const d = p.clone().sub(c0); return Math.hypot(d.dot(ax1), d.dot(ax2)); };
let rim = bins.map((b) => (b.length ? b.reduce((a, p) => (planeR(p) > planeR(a) ? p : a)).clone() : null));
for (let i = 0; i < SEG; i++) if (!rim[i]) {
  let a = i, b = i; while (!rim[(a + SEG) % SEG]) a--; while (!rim[b % SEG]) b++;
  rim[i] = rim[(a + SEG) % SEG].clone().lerp(rim[b % SEG], (i - a) / (b - a));
}
for (let k = 0; k < 1; k++) rim = rim.map((p, i) => p.clone().multiplyScalar(0.5).addScaledVector(rim[(i + 1) % SEG], 0.25).addScaledVector(rim[(i + SEG - 1) % SEG], 0.25));
console.log('attachment points', rimPts.length, 'empty bins filled', bins.filter((b) => !b.length).length);

// A disc of rings from the centre out to the attachment line, relaxed into a smooth (minimal) surface.
const RINGS = 14;
const V = [c0.clone()];
const at = (r, s) => (r === 0 ? 0 : 1 + (r - 1) * SEG + (s % SEG));
for (let r = 1; r <= RINGS; r++) for (let s = 0; s < SEG; s++) V.push(c0.clone().lerp(rim[s], r / RINGS));
const T = [];
for (let s = 0; s < SEG; s++) T.push([0, at(1, s), at(1, s + 1)]);
for (let r = 1; r < RINGS; r++) for (let s = 0; s < SEG; s++) {
  T.push([at(r, s), at(r + 1, s), at(r + 1, s + 1)], [at(r, s), at(r + 1, s + 1), at(r, s + 1)]);
}
const nbr = V.map(() => new Set());
for (const [a, b, c] of T) { nbr[a].add(b).add(c); nbr[b].add(a).add(c); nbr[c].add(a).add(b); }
const firstRim = at(RINGS, 0), tmp = new THREE.Vector3();
for (let it = 0; it < 8000; it++) {
  for (let i = 0; i < firstRim; i++) { tmp.set(0, 0, 0); for (const j of nbr[i]) tmp.add(V[j]); V[i].lerp(tmp.divideScalar(nbr[i].size), 0.8); }
}

// Face outward: away from the middle of the pelvis.
const N = V.map(() => new THREE.Vector3());
const ab = new THREE.Vector3(), ac = new THREE.Vector3();
for (const [a, b, c] of T) { ab.subVectors(V[b], V[a]); ac.subVectors(V[c], V[a]); const f = ab.cross(ac); N[a].add(f); N[b].add(f); N[c].add(f); }
N.forEach((n) => n.normalize());
const inward = new THREE.Vector3(0, 0.88, 0.02).sub(V[0]);
if (N[0].dot(inward) > 0) { T.forEach((t) => t.reverse()); N.forEach((n) => n.negate()); }

// Split into the right (-x) and left (+x) halves and replace each node's mesh data.
for (const node of parts) {
  const right = node.getName().endsWith('.r');
  const tris = T.filter(([a, b, c]) => ((V[a].x + V[b].x + V[c].x) < 0) === right);
  const used = [...new Set(tris.flat())], remap = new Map(used.map((v, i) => [v, i]));
  const inv = new THREE.Matrix4().fromArray(node.getWorldMatrix()).invert(), nm = new THREE.Matrix3().getNormalMatrix(inv);
  const pos = new Float32Array(used.length * 3), nor = new Float32Array(used.length * 3);
  used.forEach((v, i) => { pos.set(V[v].clone().applyMatrix4(inv).toArray(), i * 3); nor.set(N[v].clone().applyMatrix3(nm).normalize().toArray(), i * 3); });
  const prim = node.getMesh().listPrimitives()[0];
  for (const extra of node.getMesh().listPrimitives().slice(1)) { node.getMesh().removePrimitive(extra); extra.dispose(); }
  for (const sem of prim.listSemantics()) if (sem !== 'POSITION' && sem !== 'NORMAL') prim.setAttribute(sem, null);
  const buf = root.listBuffers()[0];
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf));
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buf));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(tris.flat().map((v) => remap.get(v)))).setBuffer(buf));
  console.log(node.getName(), 'verts', used.length, 'tris', tris.length);
}

await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(FILE, doc);

const META = 'tools/meta/regions.json';
const meta = JSON.parse(fs.readFileSync(META)).filter((m) => m.name !== 'Pubic hairs');
fs.writeFileSync(META, JSON.stringify(meta));
console.log('wrote', FILE, fs.statSync(FILE).size, 'bytes');
