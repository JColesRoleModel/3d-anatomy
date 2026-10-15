import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, flatten, quantize, meshopt, join } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';
const [,, input, output, system, ratioArg] = process.argv;
const ratio = parseFloat(ratioArg || '0.3');
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(input);
const root = doc.getRoot();
const DROP = /\.(j|i|t|s|o\d*[lr]?|e\d*[lr]?)$/;
const meta = [];
// record group path before flattening
function path(n){ const p=[]; let c=n; const parents=new Map(); return p; }
const parentOf = new Map();
for (const n of root.listNodes()) for (const c of n.listChildren()) parentOf.set(c, n);
for (const n of root.listNodes()) {
  const nm = n.getName();
  if (DROP.test(nm) || /Cross Section/i.test(nm)) { n.setMesh(null); continue; }
  if (!n.getMesh()) continue;
  const groups = []; let p = parentOf.get(n);
  while (p) { const g = p.getName(); if (g.endsWith('.g')) groups.unshift(g.slice(0,-2)); p = parentOf.get(p); }
  meta.push({ name: nm, system, groups });
}
// drop any node subtree that now has no meshes
for (const n of root.listNodes()) if (!n.getMesh() && n.listChildren().length===0) n.dispose();
await doc.transform(
  prune(), dedup(), flatten(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.0005, lockBorder: false }),
  prune(),
  quantize({ quantizePosition: 14, quantizeNormal: 8 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' }),
);
let tris=0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) tris += p.getIndices().getCount()/3;
await io.write(output, doc);
fs.writeFileSync(output.replace(/\.glb$/, '.json'), JSON.stringify(meta));
console.log(system, 'meshes', meta.length, 'tris', Math.round(tris), 'bytes', fs.statSync(output).size);
