// Smooths the genitals out of the skin layer (models/regions.glb), like a mannequin.
// The penis and scrotum skin ("Urogenital region" .r and .l) is a tube of skin with two open loops: one at the base of
// the penis, one where the scrotum meets the thighs and perineum. Parts of those loops are joined to the skin around
// them; the rest is the tube's own lip, between the penis and the scrotum, where nothing else is. Taking the tube away
// leaves one hole, from the pubic mound down between the legs. This fills it with one smooth piece of skin that meets
// the hole's edge exactly and carries on the slope of the skin around it, so there is no gap and no crease.
// "Pubic hairs" is removed. The organs layer still has the anatomical genitals.
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

// Read every primitive of a node in world space. (Each region of skin is a thin shell, an outer and an inner sheet
// about 2.5 mm apart that meet along its edges, split into a few primitives.)
const key = (v) => v.toArray().map((x) => Math.round(x * 1e4)).join(',');
function sheets(node) {
  const M = new THREE.Matrix4().fromArray(node.getWorldMatrix()), e = [];
  // A mirrored node (the left half of the body) shows the other side of its triangles from the way they wind.
  const side = M.determinant() < 0 ? -1 : 1;
  return node.getMesh().listPrimitives().map((prim) => {
    const a = prim.getAttribute('POSITION'), idx = prim.getIndices(), P = [], T = [];
    for (let i = 0; i < a.getCount(); i++) P.push(new THREE.Vector3(...a.getElement(i, e)).applyMatrix4(M));
    for (let i = 0; i < idx.getCount(); i += 3) T.push([idx.getScalar(i), idx.getScalar(i + 1), idx.getScalar(i + 2)]);
    return { P, T, side };
  });
}

// Each half of the urogenital region is two sheets. The first sheets of both halves, welded together, have exactly
// the two attachment loops as their open edges.
const ids = new Map(), W = [], tris = [];
for (const n of parts) {
  const { P, T } = sheets(n)[0], map = [];
  for (const v of P) { const k = key(v); if (!ids.has(k)) { ids.set(k, W.length); W.push(v); } map.push(ids.get(k)); }
  for (const t of T) tris.push(t.map((i) => map[i]));
}
const uses = new Map();
for (const t of tris) for (let k = 0; k < 3; k++) {
  const a = t[k], b = t[(k + 1) % 3], ek = a < b ? `${a}_${b}` : `${b}_${a}`;
  uses.set(ek, (uses.get(ek) || 0) + 1);
}
const adj = new Map();
for (const [ek, c] of uses) if (c === 1) {
  const [a, b] = ek.split('_').map(Number);
  (adj.get(a) || adj.set(a, []).get(a)).push(b);
  (adj.get(b) || adj.set(b, []).get(b)).push(a);
}
if ([...adj.values()].some((l) => l.length !== 2)) throw new Error('the attachment edges do not form simple loops');
const loops = [], seen = new Set();
for (const s of adj.keys()) {
  if (seen.has(s)) continue;
  const loop = [s]; seen.add(s);
  for (let prev = -1, cur = s; ;) {
    const nx = adj.get(cur).find((x) => x !== prev && !seen.has(x));
    if (nx === undefined) break;
    loop.push(nx); seen.add(nx); prev = cur; cur = nx;
  }
  loops.push(loop.map((i) => W[i]));
}
if (loops.length !== 2) throw new Error(`expected 2 attachment loops, found ${loops.length}`);

// The other regions: their edges tell which parts of the loops are joined to skin, and their triangles near the
// groin give the slope of the skin around the hole.
const centre = W.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(W.length);
const edgeKey = (a, b) => [key(a), key(b)].sort().join('|');
const otherEdges = new Set(), near = [];
for (const node of root.listNodes()) {
  if (!node.getMesh() || parts.includes(node)) continue;
  for (const { P, T, side } of sheets(node)) {
    for (const t of T) {
      for (let q = 0; q < 3; q++) otherEdges.add(edgeKey(P[t[q]], P[t[(q + 1) % 3]]));
      const tri = new THREE.Triangle(P[t[0]], P[t[1]], P[t[2]]);
      if (tri.getMidpoint(new THREE.Vector3()).distanceTo(centre) < 0.12) near.push({ tri, n: tri.getNormal(new THREE.Vector3()).multiplyScalar(side) });
    }
  }
}

// The two loops nearly touch at two places, either side of the lip between penis and scrotum. Cut both loops there,
// keep the part of each that is joined to skin, and join them into the hole's edge. The parts left out must be lip only.
function pinch(skip) {
  let best = null;
  loops[0].forEach((p, i) => loops[1].forEach((q, j) => {
    if (skip && p.distanceTo(loops[0][skip.i]) < 0.01) return;
    const d = p.distanceTo(q);
    if (!best || d < best.d) best = { i, j, d };
  }));
  return best;
}
const p1 = pinch(), p2 = pinch(p1);
console.log(`the loops come within ${(p1.d * 1000).toFixed(1)} mm and ${(p2.d * 1000).toFixed(1)} mm of each other`);
if (p2.d > 0.006) throw new Error('the loops do not meet in two places');
const joined = (arc) => arc.slice(1).filter((p, k) => otherEdges.has(edgeKey(arc[k], p))).length;
function keep(loop, a, b) {
  const n = loop.length, arc = (from, to) => { const r = [loop[from]]; for (let k = from; k !== to;) { k = (k + 1) % n; r.push(loop[k]); } return r; };
  const one = arc(a, b), two = arc(b, a), [kept, left] = joined(one) >= joined(two) ? [one, two] : [two, one];
  console.log(`loop of ${n} points: keeping ${kept.length} (${joined(kept)} edges joined to skin), leaving out ${left.length} (${joined(left)} joined)`);
  if (joined(left)) throw new Error('the part of a loop being left out is joined to skin');
  return kept;
}
const keptA = keep(loops[0], p1.i, p2.i), keptB = keep(loops[1], p1.j, p2.j);
// keptA runs from one pinch to the other; keptB must start where keptA ends.
const ends = (arc) => [arc[0], arc[arc.length - 1]];
if (ends(keptB)[0].distanceTo(ends(keptA)[1]) > ends(keptB)[1].distanceTo(ends(keptA)[1])) keptB.reverse();
let hole = [...keptA, ...keptB];

// At the back the hole runs up a narrow slit, where the scrotum met the perineum between the two walls of the cleft.
// Close the slit with a web of its own (seen from both sides), so the patch does not have to reach into it.
const web = [];
for (let i = 0; i < hole.length && !web.length; i++) {
  const n = hole.length, h = (j) => hole[((j % n) + n) % n];
  let k = 0;
  while (k < 6 && h(i - k - 1).distanceTo(h(i + k + 1)) < 0.008) k++;
  let depth = 0;
  for (let j = 0; j < k; j++) depth += h(i - j).distanceTo(h(i - j - 1));
  if (k < 2 || depth < 0.015) continue;
  web.push([h(i - 1), h(i), h(i + 1)]);
  for (let j = 1; j < k; j++) web.push([h(i - j - 1), h(i - j), h(i + j)], [h(i - j - 1), h(i + j), h(i + j + 1)]);
  hole = Array.from({ length: n - 2 * k + 1 }, (_, m) => h(i + k + m));
  console.log(`closed a slit ${(depth * 100).toFixed(1)} cm deep with ${web.length} triangles`);
}

// Which way is out, near the groin: away from the middle of the pelvis or from the nearer thigh bone, whichever is
// closer. Rough, but enough to tell the outer face of the skin from its inner face and the walls between regions.
const PELVIS = new THREE.Vector3(0, 0.9, -0.03);
const FEMURS = [-1, 1].map((sx) => new THREE.Line3(new THREE.Vector3(0.09 * sx, 0.86, 0), new THREE.Vector3(0.08 * sx, 0.45, 0)));
function outward(p) {
  let core = PELVIS;
  for (const f of FEMURS) { const c = f.closestPointToPoint(p, true, new THREE.Vector3()); if (c.distanceTo(p) < core.distanceTo(p)) core = c; }
  return p.clone().sub(core).normalize();
}

// The slope of the skin around each point of the hole's edge: the plane of the outer skin touching it (triangles of
// the other regions within 1.5 mm that face outward), and in that plane, the way square to the edge and away from it.
const slope = hole.map((p, i) => {
  const t = hole[(i + 1) % hole.length].clone().sub(hole[(i + hole.length - 1) % hole.length]).normalize();
  const out = outward(p), n = new THREE.Vector3(), towards = new THREE.Vector3(), c = new THREE.Vector3();
  for (const { tri, n: fn } of near) {
    if (fn.dot(out) < 0.5 || tri.closestPointToPoint(p, c).distanceTo(p) > 0.0015) continue;
    const area = tri.getArea();
    n.addScaledVector(fn, area);
    towards.addScaledVector(tri.getMidpoint(c).sub(p), area);
  }
  if (n.lengthSq() === 0) return null;
  const s = n.normalize().cross(t).normalize();
  return s.dot(towards) < 0 ? s.negate() : s;
});
// Points with no outer skin touching them (none expected) take the slope of their neighbours along the edge.
console.log(`slope found at ${slope.filter(Boolean).length} of ${hole.length} points of the edge`);
slope.forEach((s, i) => {
  if (s) return;
  const n = hole.length;
  let b = i, f = i;
  while (!slope[b]) b = (b + n - 1) % n;
  while (!slope[f]) f = (f + 1) % n;
  slope[i] = slope[b].clone().lerp(slope[f], ((i - b + n) % n) / ((i - b + n) % n + (f - i + n) % n)).normalize();
});

// Inside the pelvis, to tell outward from inward.
const INSIDE = new THREE.Vector3(0, 0.88, -0.03);

// Solves A x = b for a dense n×n matrix (Float64Array, row-major) and several right-hand sides, by Gaussian elimination.
function solve(A, B, n) {
  const m = B.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (Math.abs(A[p * n + c]) < 1e-12) throw new Error('singular system');
    if (p !== c) { for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; } for (const b of B) { const t = b[c]; b[c] = b[p]; b[p] = t; } }
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / A[c * n + c];
      if (!f) continue;
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      for (const b of B) b[r] -= f * b[c];
    }
  }
  for (const b of B) for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * b[k];
    b[r] = s / A[r * n + r];
  }
  return B;
}

// The patch. The hole's edge lies close to one plane (the hole faces forward and down), so: lay the edge flat on that
// plane, fill the flat shape with evenly spaced points joined into triangles (Delaunay), then lift them back up by
// fairing (bi-Laplacian: as smooth as it can be) with the edge fixed and the slope of the skin around it kept, which is
// set by one more ring of points just outside the edge, on the surrounding skin.
const STEP = 0.0025;

// The direction a set of points spreads least in (smallest eigenvector of their covariance, by power iteration).
function leastSpread(P, c) {
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of P) { const d = p.clone().sub(c).toArray(); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const tr = C[0][0] + C[1][1] + C[2][2];
  let x = new THREE.Vector3(0.3, -0.6, 0.7).normalize();
  for (let it = 0; it < 500; it++) {
    const a = x.toArray();
    x = new THREE.Vector3(...[0, 1, 2].map((i) => tr * a[i] - (C[i][0] * a[0] + C[i][1] * a[1] + C[i][2] * a[2]))).normalize();
  }
  return x;
}

// Delaunay triangulation of 2D points (Bowyer–Watson), counter-clockwise triangles.
function delaunay(P) {
  const n = P.length, xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const d = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 20;
  const Q = [...P, [cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]];
  const make = (a, b, c) => {
    const [ax, ay] = Q[a], [bx, by] = Q[b], [qx, qy] = Q[c];
    if ((bx - ax) * (qy - ay) - (by - ay) * (qx - ax) < 0) [b, c] = [c, b];
    const [Ax, Ay] = Q[a], [Bx, By] = Q[b], [Cx, Cy] = Q[c];
    const D = 2 * (Ax * (By - Cy) + Bx * (Cy - Ay) + Cx * (Ay - By));
    const ux = ((Ax * Ax + Ay * Ay) * (By - Cy) + (Bx * Bx + By * By) * (Cy - Ay) + (Cx * Cx + Cy * Cy) * (Ay - By)) / D;
    const uy = ((Ax * Ax + Ay * Ay) * (Cx - Bx) + (Bx * Bx + By * By) * (Ax - Cx) + (Cx * Cx + Cy * Cy) * (Bx - Ax)) / D;
    return { v: [a, b, c], ux, uy, r2: (Ax - ux) ** 2 + (Ay - uy) ** 2 };
  };
  let tris = [make(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const [px, py] = Q[i], keep = [], edges = new Map();
    for (const t of tris) {
      if ((px - t.ux) ** 2 + (py - t.uy) ** 2 < t.r2 * (1 - 1e-12)) {
        for (let k = 0; k < 3; k++) { const a = t.v[k], b = t.v[(k + 1) % 3], ek = a < b ? `${a}_${b}` : `${b}_${a}`; edges.set(ek, edges.has(ek) ? null : [a, b]); }
      } else keep.push(t);
    }
    for (const e of edges.values()) if (e) keep.push(make(e[0], e[1], i));
    tris = keep;
  }
  return tris.map((t) => t.v).filter((v) => v.every((i) => i < n));
}

function patch(loop, slope) {
  // The rim: every point of the edge, with long stretches split into steps of at most STEP / 1.5.
  const rim = [], away = [];
  loop.forEach((p, j) => {
    const k = (j + 1) % loop.length, n = Math.max(1, Math.ceil(p.distanceTo(loop[k]) / (STEP / 1.5)));
    for (let m = 0; m < n; m++) { rim.push(p.clone().lerp(loop[k], m / n)); away.push(slope[j].clone().lerp(slope[k], m / n).normalize()); }
  });
  const R = rim.length;
  // Lay the rim flat.
  const c0 = rim.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(R);
  const pn = leastSpread(rim, c0), u = new THREE.Vector3(1, 0, 0).addScaledVector(pn, -pn.x).normalize(), w = pn.clone().cross(u);
  const flat = rim.map((p) => [p.clone().sub(c0).dot(u), p.clone().sub(c0).dot(w)]);
  const seg = (i) => [flat[i], flat[(i + 1) % R]];
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (let i = 0; i < R; i++) for (let j = i + 2; j < R; j++) {
    if (i === 0 && j === R - 1) continue;
    const [a, b] = seg(i), [c, d] = seg(j);
    if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) throw new Error('the hole does not lie flat without crossing itself');
  }
  const inside = ([x, y]) => { let k = false; for (let i = 0; i < R; i++) { const [a, b] = seg(i); if ((a[1] > y) !== (b[1] > y) && x < a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1])) k = !k; } return k; };
  const edgeDist = ([x, y]) => {
    let m = Infinity;
    for (let i = 0; i < R; i++) {
      const [a, b] = seg(i), dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
      m = Math.min(m, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy));
    }
    return m;
  };
  // Points inside: a triangular grid STEP apart, kept at least 0.6 STEP from the edge.
  const xs = flat.map((p) => p[0]), ys = flat.map((p) => p[1]), pts = [...flat];
  for (let row = 0, y = Math.min(...ys); y < Math.max(...ys); row++, y += STEP * 0.866) {
    for (let x = Math.min(...xs) + (row % 2) * STEP / 2; x < Math.max(...xs); x += STEP) if (inside([x, y]) && edgeDist([x, y]) > STEP * 0.6) pts.push([x, y]);
  }
  const T = delaunay(pts).filter((t) => inside([0, 1].map((k) => (pts[t[0]][k] + pts[t[1]][k] + pts[t[2]][k]) / 3)));
  const edges = new Set();
  for (const t of T) for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3]; edges.add(a < b ? `${a}_${b}` : `${b}_${a}`); }
  for (let i = 0; i < R; i++) { const a = i, b = (i + 1) % R; if (!edges.has(a < b ? `${a}_${b}` : `${b}_${a}`)) throw new Error('the triangles do not follow the edge'); }
  // Lift. The rim is fixed where it is; the inside points are found by the fairing. One ring outside the rim, a step
  // out along the skin's slope, square to the edge, sets the slope.
  const nI = pts.length - R, V = rim.map((p) => p.clone());
  for (let i = 0; i < nI; i++) V.push(c0.clone());
  for (let i = 0; i < R; i++) {
    const tan = rim[(i + 1) % R].clone().sub(rim[(i + R - 1) % R]).normalize();
    V.push(rim[i].clone().addScaledVector(away[i].clone().addScaledVector(tan, -away[i].dot(tan)).normalize(), STEP));
  }
  const out = (i) => R + nI + i;
  const nbr = V.map(() => new Set());
  const link = ([a, b, c]) => { nbr[a].add(b).add(c); nbr[b].add(a).add(c); nbr[c].add(a).add(b); };
  T.forEach(link);
  for (let i = 0; i < R; i++) { const j = (i + 1) % R; link([i, j, out(j)]); link([i, out(j), out(i)]); }
  // Solve L(L(x)) = 0 at every inside point, with L(i) = (mean of i's neighbours) - i.
  const Lrow = (i) => { const row = new Map([[i, -1]]); for (const j of nbr[i]) row.set(j, (row.get(j) || 0) + 1 / nbr[i].size); return row; };
  const A = new Float64Array(nI * nI), B = [new Float64Array(nI), new Float64Array(nI), new Float64Array(nI)];
  for (let r = 0; r < nI; r++) {
    const L2 = new Map();
    for (const [j, wj] of Lrow(R + r)) for (const [k, wk] of Lrow(j)) L2.set(k, (L2.get(k) || 0) + wj * wk);
    for (const [k, wk] of L2) {
      if (k >= R && k < R + nI) A[r * nI + (k - R)] += wk;
      else { B[0][r] -= wk * V[k].x; B[1][r] -= wk * V[k].y; B[2][r] -= wk * V[k].z; }
    }
  }
  solve(A, B, nI);
  for (let r = 0; r < nI; r++) V[R + r].set(B[0][r], B[1][r], B[2][r]);
  const outer = V.splice(R + nI); // drop the outer ring
  // Face outward, away from the inside of the pelvis.
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), N = V.map(() => new THREE.Vector3());
  const faceN = (t) => { ab.subVectors(V[t[1]], V[t[0]]); ac.subVectors(V[t[2]], V[t[0]]); return ab.clone().cross(ac); };
  for (const t of T) { const f = faceN(t); for (const i of t) N[i].add(f); }
  const facing = N.reduce((a, n, i) => a + n.dot(V[i].clone().sub(INSIDE)), 0);
  if (facing < 0) { T.forEach((t) => t.reverse()); N.forEach((n) => n.negate()); }
  N.forEach((n) => n.normalize());
  // Checks: no fold (neighbouring triangles less than a right angle apart), and the patch leaves the edge less than a
  // right angle off the slope of the skin around it. (It stays far closer than that except at a few tight corners:
  // the two places the loops met, and the foot of the slit.)
  const em = new Map(), fn = T.map((t) => faceN(t).normalize());
  T.forEach((t, i) => { for (let k = 0; k < 3; k++) { const a = t[k], b = t[(k + 1) % 3], ek = a < b ? `${a}_${b}` : `${b}_${a}`; (em.get(ek) || em.set(ek, []).get(ek)).push(i); } });
  let sharpest = 1, join = 1;
  for (const [ek, l] of em) if (l.length === 2) {
    const d = fn[l[0]].dot(fn[l[1]]);
    sharpest = Math.min(sharpest, d);
    if (process.env.DEBUG && d < 0.7) { const [a] = ek.split('_').map(Number); console.log('fold', Math.round(THREE.MathUtils.radToDeg(Math.acos(d))), a < R ? 'rim' : 'inside', V[a].toArray().map((x) => x.toFixed(4)).join(' ')); }
  }
  // At each rim point, the patch's way in (from the rim towards the mean of its inside neighbours, square to the
  // edge) against the skin's way out.
  for (let i = 0; i < R; i++) {
    const ins = [...nbr[i]].filter((j) => j >= R && j < R + nI);
    if (!ins.length) continue;
    const tan = rim[(i + 1) % R].clone().sub(rim[(i + R - 1) % R]).normalize();
    const into = ins.reduce((a, j) => a.add(V[j]), new THREE.Vector3()).divideScalar(ins.length).sub(rim[i]);
    into.addScaledVector(tan, -into.dot(tan)).normalize();
    const c = -into.dot(outer[i].clone().sub(rim[i]).normalize());
    join = Math.min(join, c);
    if (process.env.DEBUG && c < 0.7) console.log('bend', Math.round(THREE.MathUtils.radToDeg(Math.acos(Math.min(1, c)))), rim[i].toArray().map((x) => x.toFixed(4)).join(' '));
  }
  const deg = (c) => Math.round(THREE.MathUtils.radToDeg(Math.acos(Math.min(1, c))));
  console.log(`patch: ${R} points around the edge, ${nI} inside, ${T.length} triangles; sharpest fold inside ${deg(sharpest)}°, worst bend at the edge ${deg(join)}°`);
  if (sharpest <= 0 || join <= 0) throw new Error('the patch is creased');
  return { V, N, T };
}
const { V, N, T } = patch(hole, slope);
// The slit's web, both ways round.
for (const tri of web) {
  const n = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])).normalize();
  for (const sign of [1, -1]) {
    const o = V.length;
    (sign > 0 ? tri : [tri[0], tri[2], tri[1]]).forEach((p) => { V.push(p.clone()); N.push(n.clone().multiplyScalar(sign)); });
    T.push([o, o + 1, o + 2]);
  }
}

// Give the right (-x) triangles to .r and the rest to .l.
for (const node of parts) {
  const right = node.getName().endsWith('.r');
  const mine = T.filter(([a, b, c]) => ((V[a].x + V[b].x + V[c].x) < 0) === right);
  const used = [...new Set(mine.flat())], remap = new Map(used.map((v, i) => [v, i]));
  const M = new THREE.Matrix4().fromArray(node.getWorldMatrix()), inv = M.clone().invert(), nm = new THREE.Matrix3().getNormalMatrix(inv);
  // A mirrored node (the left half) turns its triangles over, so wind them the other way to keep them facing out.
  const flip = M.determinant() < 0;
  const pos = new Float32Array(used.length * 3), nor = new Float32Array(used.length * 3);
  used.forEach((v, i) => { pos.set(V[v].clone().applyMatrix4(inv).toArray(), i * 3); nor.set(N[v].clone().applyMatrix3(nm).normalize().toArray(), i * 3); });
  const prim = node.getMesh().listPrimitives()[0];
  for (const extra of node.getMesh().listPrimitives().slice(1)) { node.getMesh().removePrimitive(extra); extra.dispose(); }
  for (const sem of prim.listSemantics()) if (sem !== 'POSITION' && sem !== 'NORMAL') prim.setAttribute(sem, null);
  const buf = root.listBuffers()[0];
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf));
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nor).setBuffer(buf));
  const index = mine.flatMap((t) => (flip ? [t[0], t[2], t[1]] : t).map((v) => remap.get(v)));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(index)).setBuffer(buf));
  console.log(node.getName(), 'verts', used.length, 'tris', mine.length, flip ? '(mirrored node)' : '');
}

await doc.transform(prune(), quantize({ quantizePosition: 14, quantizeNormal: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(FILE, doc);

const META = 'tools/meta/regions.json';
const meta = JSON.parse(fs.readFileSync(META)).filter((m) => m.name !== 'Pubic hairs');
fs.writeFileSync(META, JSON.stringify(meta));
console.log('wrote', FILE, fs.statSync(FILE).size, 'bytes');
