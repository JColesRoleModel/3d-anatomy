import { NodeIO } from '@gltf-transform/core';
const doc = await new NodeIO().read(process.argv[2]);
const root = doc.getRoot();
let tris=0; for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { const i=p.getIndices(); tris += (i? i.getCount(): p.getAttribute('POSITION').getCount())/3; }
console.log('nodes',root.listNodes().length,'meshes',root.listMeshes().length,'materials',root.listMaterials().length,'tris',tris);
const scene=root.listScenes()[0];
function walk(n,d){ if(d<4){ console.log(' '.repeat(d*2)+n.getName()+(n.getMesh()?' [mesh]':'')+' ('+n.listChildren().length+')'); n.listChildren().slice(0,12).forEach(c=>walk(c,d+1)); } }
scene.listChildren().forEach(n=>walk(n,0));
console.log(root.listMaterials().slice(0,30).map(m=>m.getName()+':'+m.getBaseColorFactor().map(x=>x.toFixed(2))).join('\n'));
