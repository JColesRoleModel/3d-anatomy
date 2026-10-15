import { NodeIO } from '@gltf-transform/core';
const doc = await new NodeIO().read(process.argv[2]);
const s={};
for (const n of doc.getRoot().listNodes()) { const nm=n.getName(); const m=nm.match(/\.([a-z]+)$/); const k=m?m[1]:'(none)'; s[k]=s[k]||{n:0,mesh:0,tris:0,ex:[]}; s[k].n++; const me=n.getMesh(); if(me){s[k].mesh++; for(const p of me.listPrimitives()){const i=p.getIndices(); s[k].tris+=(i?i.getCount():p.getAttribute('POSITION').getCount())/3;}} if(s[k].ex.length<4)s[k].ex.push(nm);}
for (const [k,v] of Object.entries(s).sort((a,b)=>b[1].tris-a[1].tris)) console.log(k,v.n,v.mesh,Math.round(v.tris),v.ex.join(' | '));
