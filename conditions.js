// Conditions: study a condition on the body. The first is scapular winging: the right shoulder blade and arm move
// (normal, or winged in each of its forms), the weak muscle lights up, its nerve is traced from the spinal cord or
// brainstem, the places the nerve is most often injured are marked, and each effect on vessels, nerves and lymph
// carries an evidence badge. The text lives in data/conditions.json.
//
// The models are static meshes, so the motion is done here: the collarbone, shoulder blade and arm are rigid, and
// every other part near them (muscles, nerves, vessels, skin) is blended between them and the rib cage by how close
// each point is to each bone, the way a character rig is skinned.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DEG = Math.PI / 180;
const MAX_RAISE = 170; // degrees the arm can be raised from the side in a normal shoulder
const BONES = ['arm', 'scap', 'clav', 'thorax'];

export async function initConditions(ctx) {
  // ctx: { structures, loadFile, show(keys, label, fly), trace() -> trace module or null, isolated() -> Set|null,
  //        applyVisibility(), render(), startFly(target, position), camera, scene, prettyName, beforeOpen(), motion() }
  const data = await fetch('data/conditions.json').then((r) => r.json());
  const cond = data.conditions[0];
  const typeOf = (id) => cond.types.find((t) => t.id === id);

  // ---------- The panel entry ----------
  const list = $('panel-list');
  const head = document.createElement('div');
  head.className = 'occ-title';
  head.innerHTML = '<h3>Conditions</h3><span>study one on the body</span>';
  const row = document.createElement('section');
  row.className = 'sys occ cond-entry'; // 'occ': not a body system row
  row.innerHTML = `<div class="sys-row"><button class="sys-toggle" data-cond="${cond.id}"><svg class="cond-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5c3.2.8 6.6.6 10-.5l-1.4 6.3c-.6 2.8-1.6 5.6-3.3 8.4L9.6 15 6.8 9.6z" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M17.5 8.5c1.6.9 2.6 2.6 2.4 4.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="1.5 2"/></svg><span class="sys-name">${esc(cond.name)}</span></button></div>`;
  row.querySelector('button').addEventListener('click', () => (study ? close() : open()));
  list.append(head, row);

  // ---------- The rig ----------
  let rig = null; // landmarks and the bone point sets, built once the skeleton has loaded
  const deformed = new Map(); // mesh -> { orig, rest, restN, w, pos, nrm, version }
  const worldPoints = (key) => {
    const out = [];
    for (const m of ctx.structures.get(key)?.meshes || []) {
      m.updateWorldMatrix(true, false);
      const p = m.geometry.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) out.push(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).clone());
    }
    return out;
  };
  const armBones = [...ctx.structures.values()].filter((s) => s.file === 'skeletal' && s.name.endsWith('.r') && s.groups.includes('Bones of free part of upper limb')).map((s) => `skeletal/${s.name}`);
  const rigid = new Map([['skeletal/Scapula.r', 'scap'], ['skeletal/Clavicle.r', 'clav'], ...armBones.map((k) => [k, 'arm'])]);

  // Nearest-point lookups in a grid of 2 cm cells.
  function pointGrid(points) {
    const C = 0.02, cells = new Map();
    for (const p of points) {
      const k = `${Math.floor(p.x / C)},${Math.floor(p.y / C)},${Math.floor(p.z / C)}`;
      (cells.get(k) || cells.set(k, []).get(k)).push(p);
    }
    return {
      nearest(q, maxR = 12) {
        const cx = Math.floor(q.x / C), cy = Math.floor(q.y / C), cz = Math.floor(q.z / C);
        let best = Infinity, bp = null;
        for (let r = 0; r <= maxR; r++) {
          for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue; // the shell of this ring only
            for (const p of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) { const d = p.distanceToSquared(q); if (d < best) { best = d; bp = p; } }
          }
          if (bp && Math.sqrt(best) < r * C) break; // nothing in a farther ring can be closer
        }
        return { d: bp ? Math.sqrt(best) : maxR * C, p: bp };
      },
    };
  }

  // How far every point near the shoulder is from a set of bone points: a 1 cm grid filled in by a chamfer
  // distance transform, then read with trilinear interpolation (fast enough for every vertex of the arm).
  function distanceField(points, box, h = 0.01) {
    const o = box.min, size = box.getSize(new THREE.Vector3());
    const nx = Math.ceil(size.x / h) + 1, ny = Math.ceil(size.y / h) + 1, nz = Math.ceil(size.z / h) + 1;
    const D = new Float32Array(nx * ny * nz).fill(1e9);
    const id = (i, j, k) => (k * ny + j) * nx + i;
    for (const p of points) {
      const i = Math.round((p.x - o.x) / h), j = Math.round((p.y - o.y) / h), k = Math.round((p.z - o.z) / h);
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
      const d = Math.hypot(o.x + i * h - p.x, o.y + j * h - p.y, o.z + k * h - p.z);
      if (d < D[id(i, j, k)]) D[id(i, j, k)] = d;
    }
    const nb = [];
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (dk < 0 || (dk === 0 && (dj < 0 || (dj === 0 && di < 0)))) nb.push([di, dj, dk, h * Math.hypot(di, dj, dk)]);
    }
    const pass = (sign) => {
      const ks = sign > 0 ? [0, nz, 1] : [nz - 1, -1, -1], js = sign > 0 ? [0, ny, 1] : [ny - 1, -1, -1], is = sign > 0 ? [0, nx, 1] : [nx - 1, -1, -1];
      for (let k = ks[0]; k !== ks[1]; k += ks[2]) for (let j = js[0]; j !== js[1]; j += js[2]) for (let i = is[0]; i !== is[1]; i += is[2]) {
        let d = D[id(i, j, k)];
        for (const [di, dj, dk, w] of nb) {
          const a = i + sign * di, b = j + sign * dj, c = k + sign * dk; // neighbours already visited in this pass
          if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
          const e = D[id(a, b, c)] + w;
          if (e < d) d = e;
        }
        D[id(i, j, k)] = d;
      }
    };
    pass(1); pass(-1);
    return (v) => { // distance from v to the nearest bone point
      const cx = Math.min(Math.max(v.x, o.x), o.x + (nx - 1) * h), cy = Math.min(Math.max(v.y, o.y), o.y + (ny - 1) * h), cz = Math.min(Math.max(v.z, o.z), o.z + (nz - 1) * h);
      const outside = Math.hypot(v.x - cx, v.y - cy, v.z - cz);
      const fx = (cx - o.x) / h, fy = (cy - o.y) / h, fz = (cz - o.z) / h;
      const i = Math.min(Math.floor(fx), nx - 2), j = Math.min(Math.floor(fy), ny - 2), k = Math.min(Math.floor(fz), nz - 2);
      const tx = fx - i, ty = fy - j, tz = fz - k;
      const L = (a, b, t) => a + (b - a) * t;
      const c00 = L(D[id(i, j, k)], D[id(i + 1, j, k)], tx), c10 = L(D[id(i, j + 1, k)], D[id(i + 1, j + 1, k)], tx);
      const c01 = L(D[id(i, j, k + 1)], D[id(i + 1, j, k + 1)], tx), c11 = L(D[id(i, j + 1, k + 1)], D[id(i + 1, j + 1, k + 1)], tx);
      return Math.min(L(L(c00, c10, ty), L(c01, c11, ty), tz), 1) + outside;
    };
  }

  // Which bones each kind of part may follow (the rest follow whichever bones they are nearest).
  function bonesFor(s) {
    const n = s.name;
    if (s.file === 'regions' && /forearm|wrist|Radial foveola|Palm|hand|Nail plate\.|Perionyx\.|elbow|Cubital/.test(n)) return ['arm'];
    if (/Supraspinatus|Infraspinatus|Subscapularis|Teres (minor|major)|bursa of (infraspinatus|teres)/.test(n)) return ['scap', 'arm'];
    if (/deltoid|Deltoid|Subdeltoid|Subacromial|Coracobrachial|biceps|triceps|Coracobrachialis|Brachialis/.test(n)) return ['clav', 'scap', 'arm'];
    if (/Serratus anterior|Rhomboid|Levator scapulae|trapezius|Pectoralis minor|Subclavius|Omohyoid/.test(n)) return ['thorax', 'scap', 'clav'];
    if (/Latissimus|pectoralis major/.test(n)) return ['thorax', 'clav', 'arm'];
    return BONES;
  }

  function buildRig() {
    const scap = worldPoints('skeletal/Scapula.r'), clav = worldPoints('skeletal/Clavicle.r'), hum = worldPoints('skeletal/Humerus.r');
    if (!scap.length || !clav.length || !hum.length) return null;
    const by = (pts, f) => pts.reduce((a, b) => (f(b) > f(a) ? b : a));
    const sc = by(clav, (p) => p.x).clone(); // the breastbone end of the collarbone (the body's right is -x)
    const clavLat = by(clav, (p) => -p.x);
    const ac = by(scap, (p) => -p.distanceToSquared(clavLat)).clone().lerp(clavLat, 0.5);
    const topY = Math.max(...hum.map((p) => p.y));
    const headPts = hum.filter((p) => p.y > topY - 0.035);
    const gh = headPts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(headPts.length);
    const inf = by(scap, (p) => -p.y).clone(); // the lower tip
    const medial = by(scap, (p) => p.x).clone(); // a point on the inner border
    const centre = scap.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(scap.length);
    // The plane of the shoulder blade: the direction it is thinnest in.
    const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of scap) { const d = [p.x - centre.x, p.y - centre.y, p.z - centre.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]; }
    const normal = smallestEigen(cov);
    if (normal.z < 0) normal.negate(); // facing the ribs (forward)
    const spine = medial.clone().sub(ac).projectOnPlane(normal).normalize().negate(); // inner border -> acromion
    const vertical = new THREE.Vector3().crossVectors(normal, spine).normalize();
    // Pick each rotation's sign by what it should do to a landmark.
    const turn = (axis, deg, p) => p.clone().sub(ac).applyAxisAngle(axis, deg * DEG).add(ac);
    const axes = {
      up: turn(normal, 5, inf).x < inf.x ? normal.clone() : normal.clone().negate(), // lower tip swings out (-x)
      tilt: turn(spine, 5, inf).z > inf.z ? spine.clone() : spine.clone().negate(), // tips back: lower tip goes forward
      wing: turn(vertical, 5, medial).z < medial.z ? vertical.clone() : vertical.clone().negate(), // inner border lifts off (-z)
    };
    // Bone point sets for the blending. The rib cage is everything in the skeleton near the shoulder that doesn't move.
    const thorax = [];
    for (const [key, s] of ctx.structures) {
      if (s.file !== 'skeletal' || rigid.has(key) || !s.meshes.length) continue;
      const box = new THREE.Box3();
      for (const m of s.meshes) box.expandByObject(m);
      const c = box.getCenter(new THREE.Vector3());
      if (c.x < 0.12 && c.y > 0.9 && c.y < 1.62) thorax.push(...worldPoints(key));
    }
    const arm = armBones.flatMap(worldPoints);
    const reach = new THREE.Box3().setFromPoints([...scap, ...clav, ...arm]).expandByScalar(0.07);
    const field = reach.clone().expandByScalar(0.05);
    const dist = { arm: distanceField(arm, field), scap: distanceField(scap, field), clav: distanceField(clav, field), thorax: distanceField(thorax, field) };
    // A bony growth under the shoulder blade, for pseudo-winging (it moves with the shoulder blade).
    const bump = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.7 }));
    bump.userData.at = centre.clone().lerp(inf, 0.45).addScaledVector(normal, 0.012);
    bump.visible = false;
    ctx.scene.add(bump);
    return { sc, ac, gh, inf, medial, centre, normal, axes, dist, reach, bump };
  }

  // The blend weights of one part's points against the four bones. A part that follows one bone throughout (an arm
  // muscle, a bone) just moves as a whole; the rest are reshaped point by point, only where they move at all.
  function addMesh(m, s, key) {
    if (deformed.has(m)) return;
    const geo = m.geometry, n = geo.attributes.position.count;
    m.updateWorldMatrix(true, false);
    const rest = new Float32Array(n * 3), w = new Float32Array(n * 4);
    const v = new THREE.Vector3();
    const fixed = rigid.get(key), allowed = bonesFor(s);
    const power = s.file === 'regions' ? 5 : 4; // skin hugs its nearest bone more tightly
    const trunkSkin = s.file === 'regions' && allowed.length > 1 && !/region of arm|bicipital|Deltoid region/.test(s.name);
    let moves = 0, single = true, lead = -1;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(geo.attributes.position, i).applyMatrix4(m.matrixWorld);
      rest[i * 3] = v.x; rest[i * 3 + 1] = v.y; rest[i * 3 + 2] = v.z;
      if (fixed) { w[i * 4 + BONES.indexOf(fixed)] = 1; continue; }
      let sum = 0;
      const ws = [0, 0, 0, 0];
      // Trunk skin below the armpit never follows the hanging arm. The fade is smooth and the same for every trunk
      // piece, so seams between them stay closed; the arm's own skin meets the trunk only at the armpit, above it.
      // Lower down (the waist) it stays put altogether, meeting the skin pieces that never join the rig.
      const fade = trunkSkin ? THREE.MathUtils.smoothstep(v.y, rig.gh.y - 0.3, rig.gh.y - 0.18) : 1;
      const still = trunkSkin ? THREE.MathUtils.smoothstep(v.y, rig.gh.y - 0.42, rig.gh.y - 0.3) : 1;
      BONES.forEach((b, j) => { if (!allowed.includes(b)) return; const d = rig.dist[b](v); ws[j] = (b === 'arm' ? fade : b === 'thorax' ? 1 : still) / (d + 0.004) ** power; sum += ws[j]; });
      let top = 0;
      for (let j = 0; j < 4; j++) { w[i * 4 + j] = ws[j] / sum; if (w[i * 4 + j] > w[i * 4 + top]) top = j; }
      if (w[i * 4 + top] < 0.97 || (lead >= 0 && top !== lead)) single = false;
      lead = top;
      moves = Math.max(moves, 1 - w[i * 4 + 3]);
    }
    if (fixed) { single = true; lead = BONES.indexOf(fixed); moves = 1; }
    if (moves < 0.02 || (single && lead === 3)) { deformed.set(m, null); return; } // stays with the ribs
    if (single) { // moves as a whole with one bone
      deformed.set(m, { rigid: BONES[lead], restLocal: m.matrix.clone(), restWorld: m.matrixWorld.clone(), parentInv: m.parent.matrixWorld.clone().invert(), auto: m.matrixAutoUpdate, version: -1 });
      m.matrixAutoUpdate = false;
      return;
    }
    const idx = [];
    for (let i = 0; i < n; i++) if (w[i * 4 + 3] < 0.995) idx.push(i);
    const own = geo.clone(); // the left side shares this geometry, so reshape a copy
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(geo.attributes.position, i); pos.setXYZ(i, v.x, v.y, v.z); }
    pos.setUsage(THREE.DynamicDrawUsage);
    own.setAttribute('position', pos);
    let nrm = null, restN = null;
    if (geo.attributes.normal) {
      nrm = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
      restN = new Float32Array(n * 3);
      const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(geo.attributes.normal, i); nrm.setXYZ(i, v.x, v.y, v.z);
        v.applyMatrix3(nm).normalize(); restN[i * 3] = v.x; restN[i * 3 + 1] = v.y; restN[i * 3 + 2] = v.z;
      }
      nrm.setUsage(THREE.DynamicDrawUsage);
      own.setAttribute('normal', nrm);
    }
    m.geometry = own;
    m.frustumCulled = false;
    deformed.set(m, { orig: geo, rest, restN, w, pos, nrm, idx: Uint32Array.from(idx), version: -1 });
  }
  // Every loaded part near the shoulder and arm joins the rig (called again as more of the body loads).
  function collect() {
    if (!rig) return;
    for (const [key, s] of ctx.structures) {
      if (!s.meshes.length || s.file === 'visceral') continue;
      if (s.file === 'skeletal' && !rigid.has(key)) continue;
      const box = new THREE.Box3();
      for (const m of s.meshes) box.expandByObject(m);
      if (!box.intersectsBox(rig.reach) || box.getCenter(new THREE.Vector3()).x > 0.04) continue;
      for (const m of s.meshes) addMesh(m, s, key);
    }
  }
  function release() {
    for (const [m, e] of deformed) {
      if (!e) continue;
      if (e.rigid) {
        m.matrix.copy(e.restLocal);
        m.matrixAutoUpdate = e.auto;
        m.updateMatrixWorld(true);
        continue;
      }
      m.geometry.dispose();
      m.geometry = e.orig;
      m.frustumCulled = true;
    }
    deformed.clear();
  }

  // ---------- The pose ----------
  // Shoulder movement as the arm rises. The normal rhythm follows Ludewig 2009; the winged forms change it in the
  // directions the sources describe, by illustrative amounts. Angles in degrees, distances in metres.
  function poseParams(type, s, raise, plane) {
    const side = plane === 'side' ? 1 : 0;
    let cap = MAX_RAISE;
    if (type === 'medial') cap -= 55 * s;
    if (type === 'lateral') cap -= side ? 80 * s : 35 * s;
    if (type === 'rhomboid') cap -= 10 * s;
    if (type === 'secondary') cap -= 60 * s;
    const th = Math.min(raise, cap), k = th / MAX_RAISE;
    const p = { cap, raise: th, clavElev: 6 * k, clavRetr: 16 * k, up: 35 * k, tilt: 20 * k, wing: 0, move: new THREE.Vector3(), bump: 0 };
    if (type === 'medial') { // serratus can't hold the inner border down or turn the blade up
      p.wing += s * (8 + 22 * k); p.up *= 1 - 0.6 * s; p.tilt = p.tilt * (1 - 0.8 * s) - 6 * s - 6 * s * k;
      p.move.set(0.01 * s, 0.012 * s, 0); // higher and nearer the spine
    } else if (type === 'lateral') { // the shoulder droops; the blade slides out and flares, most in abduction
      const a = side ? 1 : 0.3;
      p.clavElev -= 8 * s; p.up *= 1 - 0.45 * s; p.tilt += 6 * s; p.wing += 4 * s + 10 * s * k * a;
      p.move.set(-0.015 * s - 0.02 * s * k * a, -0.008 * s, 0);
    } else if (type === 'rhomboid') {
      p.up += 4 * s; p.wing += 4 * s + 4 * s * k; p.move.set(-0.01 * s, 0, 0);
    } else if (type === 'secondary') { // the blade makes up for a stiff joint
      p.clavElev += 10 * s * k; p.up += 15 * s * k; p.tilt -= 8 * s * k; p.wing += 6 * s * k; p.move.set(0, 0.015 * s * k, 0);
    } else if (type === 'pseudo') { // held off the ribs at rest, the same as the arm rises
      p.tilt -= 8 * s; p.wing += 6 * s; p.bump = s;
    }
    return p;
  }
  const about = (pivot, m) => new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z).multiply(m).multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  const rot = (axis, deg) => new THREE.Matrix4().makeRotationAxis(axis, deg * DEG);
  function matrices(p, plane) {
    const C = about(rig.sc, rot(new THREE.Vector3(0, 1, 0), -p.clavRetr).multiply(rot(new THREE.Vector3(0, 0, 1), -p.clavElev)));
    const blade = about(rig.ac, rot(rig.axes.wing, p.wing).multiply(rot(rig.axes.tilt, p.tilt)).multiply(rot(rig.axes.up, p.up)));
    const S = C.clone().multiply(new THREE.Matrix4().makeTranslation(p.move.x, p.move.y, p.move.z)).multiply(blade);
    const gh2 = rig.gh.clone().applyMatrix4(S);
    const lift = plane === 'side' ? rot(new THREE.Vector3(0, 0, 1), -p.raise) : rot(new THREE.Vector3(1, 0, 0), -p.raise);
    const A = new THREE.Matrix4().makeTranslation(gh2.x, gh2.y, gh2.z).multiply(lift).multiply(new THREE.Matrix4().makeTranslation(-rig.gh.x, -rig.gh.y, -rig.gh.z));
    return { arm: A, scap: S, clav: C, thorax: new THREE.Matrix4() };
  }

  let version = 0, mats = null;
  function deform(e, m) {
    if (e.rigid) { // world = bone motion × rest world
      m.matrix.copy(e.parentInv).multiply(mats[e.rigid]).multiply(e.restWorld);
      m.updateMatrixWorld(true);
      e.version = version;
      return;
    }
    const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
    const L = BONES.map((b) => new THREE.Matrix4().multiplyMatrices(inv, mats[b]).elements);
    const R = BONES.map((b) => mats[b].elements);
    const W = new THREE.Matrix3().setFromMatrix4(m.matrixWorld).transpose().elements; // world normal -> local
    const { rest, restN, w, pos, nrm, idx } = e, P = pos.array, N = nrm?.array;
    for (const i of idx) {
      const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
      let px = 0, py = 0, pz = 0, nx = 0, ny = 0, nz = 0;
      const ax = N && restN[i * 3], ay = N && restN[i * 3 + 1], az = N && restN[i * 3 + 2];
      for (let j = 0; j < 4; j++) {
        const wj = w[i * 4 + j];
        if (!wj) continue;
        const a = L[j];
        px += wj * (a[0] * x + a[4] * y + a[8] * z + a[12]);
        py += wj * (a[1] * x + a[5] * y + a[9] * z + a[13]);
        pz += wj * (a[2] * x + a[6] * y + a[10] * z + a[14]);
        if (N) { const r = R[j]; nx += wj * (r[0] * ax + r[4] * ay + r[8] * az); ny += wj * (r[1] * ax + r[5] * ay + r[9] * az); nz += wj * (r[2] * ax + r[6] * ay + r[10] * az); }
      }
      P[i * 3] = px; P[i * 3 + 1] = py; P[i * 3 + 2] = pz;
      if (N) {
        const lx = W[0] * nx + W[3] * ny + W[6] * nz, ly = W[1] * nx + W[4] * ny + W[7] * nz, lz = W[2] * nx + W[5] * ny + W[8] * nz;
        const l = Math.hypot(lx, ly, lz) || 1;
        N[i * 3] = lx / l; N[i * 3 + 1] = ly / l; N[i * 3 + 2] = lz / l;
      }
    }
    pos.needsUpdate = true;
    if (nrm) nrm.needsUpdate = true;
    e.version = version;
  }
  // Brings every visible moving part up to the current pose.
  function syncMeshes() {
    let n = 0;
    for (const [m, e] of deformed) if (e && e.version !== version && m.visible) { deform(e, m); n++; }
    if (n) { placeMarkers(); ctx.render(); }
    return n;
  }
  function setPose() {
    if (!rig || !study) return;
    const p = poseParams(study.type, study.sev, study.raise, study.plane);
    mats = matrices(p, study.plane);
    version++;
    rig.bump.visible = study.type === 'pseudo' && p.bump > 0 && study.view === 'inside';
    if (rig.bump.visible) {
      const r = 0.006 + 0.012 * p.bump;
      rig.bump.scale.setScalar(r);
      rig.bump.position.copy(rig.bump.userData.at).addScaledVector(rig.normal, r * 0.6).applyMatrix4(mats.scap);
    }
    syncMeshes();
    if (!study.playing) for (const [m, e] of deformed) if (e && !e.rigid && e.version === version) { m.geometry.computeBoundingSphere(); m.geometry.boundingBox = null; } // for tapping
    $('cond-raise-out').textContent = `${Math.round(p.raise)}°`;
    const capNote = $('cond-cap');
    capNote.textContent = p.cap < MAX_RAISE - 0.5 ? `With this weakness the arm only gets to about ${Math.round(p.cap)}°.` : '';
    capNote.hidden = !capNote.textContent;
  }

  // ---------- Injury spots ----------
  const markerGroup = new THREE.Group();
  ctx.scene.add(markerGroup);
  let markers = []; // { mesh, index, sprite }
  function makeMarkers() {
    for (const c of [...markerGroup.children]) { markerGroup.remove(c); c.material.map.dispose(); c.material.dispose(); }
    markers = [];
    const t = typeOf(study.type);
    if (!t.injuries || study.view !== 'inside') return;
    const nerve = ctx.structures.get(t.nerveKey);
    t.injuries.forEach((inj, i) => {
      const near = worldPoints(inj.near);
      if (!near.length || !nerve?.meshes.length) return;
      const g = pointGrid(near);
      let best = { d: Infinity };
      for (const m of nerve.meshes) {
        const e = deformed.get(m), p = (e?.orig || m.geometry).attributes.position, v = new THREE.Vector3();
        for (let k = 0; k < p.count; k++) {
          if (e) v.set(e.rest[k * 3], e.rest[k * 3 + 1], e.rest[k * 3 + 2]); else v.fromBufferAttribute(p, k).applyMatrix4(m.matrixWorld);
          const r = g.nearest(v, 6);
          if (r.d < best.d) best = { d: r.d, mesh: m, index: k };
        }
      }
      if (!best.mesh) return;
      const sprite = textSprite(`${i + 1}  ${inj.label}`);
      markerGroup.add(sprite);
      markers.push({ mesh: best.mesh, index: best.index, sprite });
    });
    sizeMarkers();
    placeMarkers();
  }
  function placeMarkers() {
    const v = new THREE.Vector3();
    markers.forEach((mk, i) => {
      v.fromBufferAttribute(mk.mesh.geometry.attributes.position, mk.index).applyMatrix4(mk.mesh.matrixWorld);
      mk.sprite.position.copy(v);
      mk.sprite.center.set(i % 2 ? 1.04 : -0.04, 0.5); // alternate sides so neighbours don't overlap
    });
  }
  function textSprite(text) {
    const c = document.createElement('canvas'), g = c.getContext('2d'), px = 30;
    const font = `600 ${px}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 30;
    c.width = w; c.height = px + 20;
    g.font = font;
    g.fillStyle = 'rgba(17, 14, 40, 0.86)'; g.strokeStyle = '#ff6b8a'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(1.5, 1.5, w - 3, c.height - 3, 12); g.fill(); g.stroke();
    g.fillStyle = '#ffd1dc'; g.textBaseline = 'middle'; g.fillText(text, 15, c.height / 2 + 1);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
    s.renderOrder = 12;
    s.userData.aspect = w / c.height;
    return s;
  }
  function sizeMarkers() {
    const h = 2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov / 2)) * (16 / window.innerHeight);
    for (const s of markerGroup.children) s.scale.set(h * s.userData.aspect, h, 1);
  }
  window.addEventListener('resize', sizeMarkers);

  // ---------- What is lit up ----------
  function focus() {
    const t = typeOf(study.type);
    ctx.seeThrough.clear();
    if (study.view === 'inside') for (const k of t.muscles || []) ctx.seeThrough.set(k, 0.6); // the shoulder blade shows through
    const effect = study.effect != null ? cond.effects[study.effect] : null;
    if (study.view === 'skin') {
      const skin = [...ctx.structures].filter(([, s]) => s.file === 'regions').map(([k]) => k);
      ctx.show(skin, `${cond.name}: ${t.name.toLowerCase()}, skin`, false);
    } else {
      const keys = [...rigid.keys(), ...(t.muscles || []), ...(effect?.show || [])];
      const label = `${cond.name}: ${t.name.toLowerCase()}`;
      const tr = ctx.trace();
      if (t.nerveKey && tr) tr.traceWith(t.nerveKey, keys, label);
      else ctx.show(keys, label, false);
    }
  }
  // Loads what the study needs, then builds the rig and poses it.
  async function prepare() {
    const t = typeOf(study.type);
    const files = study.view === 'skin' ? ['skeletal', 'regions'] : ['skeletal', 'muscular', 'nervous', ...(t.injuries || []).map((i) => i.near.split('/')[0])];
    const effect = study.effect != null ? cond.effects[study.effect] : null;
    for (const k of effect?.show || []) files.push(k.split('/')[0]);
    focus();
    await Promise.all([...new Set(files)].map((f) => ctx.loadFile(f)));
    if (!study) return;
    rig ??= buildRig();
    if (!rig) return;
    collect();
    focus();
    setPose();
    makeMarkers();
  }

  // ---------- The card ----------
  let study = null; // { type, sev, raise, plane, view, effect, playing }
  const card = $('cond');
  const src = (ids) => (ids || []).filter((id) => data.sources[id]).map((id) => `<a href="${data.sources[id][1]}" target="_blank" rel="noopener">${esc(data.sources[id][0])}</a>`).join(' · ');
  function render() {
    const t = typeOf(study.type);
    const group = cond.groups.find((g) => g.id === t.group);
    $('cond-name').textContent = cond.name;
    const types = cond.types.map((x) => `<button class="cond-type${x.id === study.type ? ' on' : ''}" data-type="${x.id}">${esc(x.name)}</button>`).join('');
    const facts = [
      t.muscle && ['Weak muscle', t.muscle], t.nerve && ['Nerve', t.nerve], ['How it looks', t.looks], t.brought && ['Brought out by', t.brought],
    ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    const injuries = t.injuries && study.view === 'inside' ? `<p class="cond-sub">Where the nerve is most often injured</p><ol class="cond-inj">${t.injuries.map((i) => `<li>${esc(i.label)}</li>`).join('')}</ol>` : '';
    const effects = cond.effects.map((e, i) => `<li class="cond-effect">
        <span class="badge badge-${e.badge}">${data.badges[e.badge]}</span> <b>${esc(e.title)}</b>
        <p>${esc(e.text)}</p>
        <div class="cond-effect-foot">${e.show ? `<button data-effect="${i}" class="${study.effect === i ? 'on' : ''}">${study.effect === i ? 'Showing' : 'Show it'}</button>` : ''}${e.sources.length ? `<span class="cond-src">${src(e.sources)}</span>` : ''}</div>
      </li>`).join('');
    $('cond-body').innerHTML = `
      <p class="cond-about">${esc(cond.about)}</p>
      <div class="cond-types" role="group" aria-label="Kind of winging">${types}</div>
      ${group ? `<p class="cond-group"><b>${esc(group.id)}:</b> ${esc(group.about)}</p>` : ''}
      <div class="cond-controls">
        ${study.type === 'normal' ? '' : `<label class="cond-slider"><span>${study.type === 'pseudo' ? 'Size of the growth' : 'How weak'}</span><input id="cond-sev" type="range" min="0" max="100" step="5" value="${Math.round(study.sev * 100)}"><output>${Math.round(study.sev * 100)}%</output></label>`}
        <label class="cond-slider"><span>Arm raised</span><input id="cond-raise" type="range" min="0" max="${MAX_RAISE}" step="1" value="${Math.round(study.raise)}"><output id="cond-raise-out"></output></label>
        <div class="cond-row">
          <button id="cond-play" class="cond-play">${study.playing ? '❚❚ Pause' : '▶ Raise the arm'}</button>
          <span class="cond-seg" role="group" aria-label="Raise the arm"><button data-plane="forward" class="${study.plane === 'forward' ? 'on' : ''}">Forward</button><button data-plane="side" class="${study.plane === 'side' ? 'on' : ''}">To the side</button></span>
        </div>
        <p id="cond-cap" class="cond-cap" hidden></p>
        <div class="cond-row"><span class="cond-label">View</span><span class="cond-seg" role="group" aria-label="View"><button data-view="inside" class="${study.view === 'inside' ? 'on' : ''}">Inside</button><button data-view="skin" class="${study.view === 'skin' ? 'on' : ''}">Skin</button></span></div>
      </div>
      <dl class="cond-facts">${facts}</dl>
      ${t.causes ? `<p class="cond-sub">Causes</p><ul class="cond-list">${t.causes.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
      ${t.outlook ? `<p class="cond-note">${esc(t.outlook)}</p>` : ''}
      ${t.caveat ? `<p class="cond-note cond-caveat">${esc(t.caveat)}</p>` : ''}
      ${injuries}
      <p class="cond-src">${src(t.sources)}</p>
      <details class="cond-effects" ${window.matchMedia('(min-width: 800px)').matches ? 'open' : ''}><summary>Effects on vessels, nerves and lymph</summary><ul>${effects}</ul></details>
      <p class="cond-foot">${esc(cond.frequency)} <span class="cond-src">${src(cond.frequencySources)}</span></p>
      <p class="cond-foot">${esc(cond.illustrative)}</p>`;
    wire();
    if (rig) setPose();
  }
  function wire() {
    const body = $('cond-body');
    for (const b of body.querySelectorAll('[data-type]')) b.addEventListener('click', () => {
      const t = typeOf(b.dataset.type);
      Object.assign(study, { type: t.id, plane: t.plane, effect: null });
      if (study.sev === 0) study.sev = 1;
      render(); prepare();
    });
    body.querySelector('#cond-sev')?.addEventListener('input', (e) => {
      study.sev = e.target.value / 100;
      e.target.nextElementSibling.textContent = `${e.target.value}%`;
      setPose();
    });
    $('cond-raise').addEventListener('input', (e) => { study.playing = false; study.raise = +e.target.value; syncPlay(); setPose(); });
    $('cond-play').addEventListener('click', () => {
      study.playing = !study.playing;
      if (study.playing) { const cap = poseParams(study.type, study.sev, MAX_RAISE, study.plane).cap; study.dir = study.raise >= cap - 1 ? -1 : 1; study.hold = 0; }
      syncPlay();
    });
    for (const b of body.querySelectorAll('[data-plane]')) b.addEventListener('click', () => { study.plane = b.dataset.plane; render(); });
    for (const b of body.querySelectorAll('[data-view]')) b.addEventListener('click', () => { study.view = b.dataset.view; render(); prepare(); });
    for (const b of body.querySelectorAll('[data-effect]')) b.addEventListener('click', () => {
      const i = +b.dataset.effect;
      study.effect = study.effect === i ? null : i;
      if (study.effect != null) study.view = 'inside';
      render(); prepare();
    });
  }
  function syncPlay() { const b = $('cond-play'); if (b) b.textContent = study.playing ? '❚❚ Pause' : '▶ Raise the arm'; }
  $('cond-close').addEventListener('click', () => close());

  function open(st) {
    ctx.beforeOpen();
    study = { type: 'medial', sev: 1, raise: 0, plane: 'forward', view: 'inside', effect: null, playing: false, ...st };
    card.hidden = false;
    row.querySelector('button').setAttribute('aria-pressed', 'true');
    render();
    prepare().then(() => {
      if (!rig || st?.camera === false) return;
      const phone = innerWidth < 800; // the card fills the lower half there, so aim lower and stand back to keep the shoulder above it
      const target = rig.centre.clone().add(new THREE.Vector3(0.02, phone ? -0.2 : 0, 0));
      ctx.startFly(target, target.clone().add(new THREE.Vector3(-0.5, 0.22, -1).normalize().multiplyScalar(phone ? 1.5 : 0.95)));
    });
  }
  function close() {
    if (!study) return;
    study = null;
    card.hidden = true;
    row.querySelector('button').setAttribute('aria-pressed', 'false');
    release();
    if (rig) rig.bump.visible = false;
    for (const c of [...markerGroup.children]) { markerGroup.remove(c); c.material.map.dispose(); c.material.dispose(); }
    markers = [];
    ctx.seeThrough.clear();
    ctx.clear();
  }

  return {
    get active() { return !!study; },
    open, close,
    // Each frame: plays the arm raise, and catches up parts that just appeared. Returns true while moving.
    update(dt) {
      if (!study || !rig) return false;
      if (study.playing) {
        const cap = poseParams(study.type, study.sev, MAX_RAISE, study.plane).cap;
        if (study.hold > 0) study.hold -= dt;
        else {
          study.raise += study.dir * dt * 55; // degrees per second
          if (study.raise >= cap) { study.raise = cap; study.dir = -1; study.hold = 0.9; }
          if (study.raise <= 0) { study.raise = 0; study.dir = 1; study.hold = 0.9; }
        }
        const input = $('cond-raise');
        if (input) input.value = Math.round(study.raise);
        setPose();
        return true;
      }
      syncMeshes();
      return false;
    },
    loaded() { if (study && rig) { collect(); setPose(); } },
    snapshot: () => (study ? { type: study.type, sev: study.sev, raise: study.raise, plane: study.plane, view: study.view, effect: study.effect } : null),
    restore(st) { if (st && typeOf(st.type)) open({ ...st, camera: false }); else close(); },
  };
}

// The eigenvector of a symmetric 3×3 matrix with the smallest eigenvalue (Jacobi rotations).
function smallestEigen(a) {
  a = a.map((r) => r.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let p = 0, q = 1;
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) if (Math.abs(a[i][j]) > Math.abs(a[p][q])) { p = i; q = j; }
    if (Math.abs(a[p][q]) < 1e-12) break;
    const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]), c = Math.cos(th), s = Math.sin(th);
    for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
  }
  const i = [0, 1, 2].reduce((m, k) => (a[k][k] < a[m][m] ? k : m), 0);
  return new THREE.Vector3(v[0][i], v[1][i], v[2][i]).normalize();
}
