import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { initOccult } from './occult.js';
import { initCosmos } from './cosmos.js';

const $ = (id) => document.getElementById(id);

// ---------- Scene ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene(); // the sky comes from cosmos.js

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
const HOME = { target: new THREE.Vector3(0, 0.95, 0), position: new THREE.Vector3(0, 1.0, 4.3) };
camera.position.copy(HOME.position);

const hemi = new THREE.HemisphereLight(0xffffff, 0x2a2f36, 1.6);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
keyLight.position.set(0.6, 1, 1.2);
camera.add(keyLight);
scene.add(camera);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.08;
controls.maxDistance = 8;
controls.update();

const cosmos = initCosmos({ scene, camera, renderer, controls, hemi });
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { cosmos, scene, camera, controls }); // for testing

const body = new THREE.Group();
scene.add(body);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let needsRender = true;
let flyTo = null;
let occult = null; // occult anatomy layers (occult.js), set up once the panel exists
controls.addEventListener('change', () => (needsRender = true));
// ---------- Keyboard camera ----------
// Held keys move the camera smoothly; see the shortcuts dialog for the full list.
const held = new Set();
const timer = new THREE.Timer();
timer.connect(document);
const spherical = new THREE.Spherical();
const offset = new THREE.Vector3();
const panVec = new THREE.Vector3();
const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract']);
const axis = (pos, neg) => (held.has(pos) ? 1 : 0) - (held.has(neg) ? 1 : 0);

function stepKeys(dt) {
  if (!held.size) return false;
  const fast = held.has('ShiftLeft') || held.has('ShiftRight');
  const slow = held.has('AltLeft') || held.has('AltRight');
  const k = dt * (fast ? 2.5 : slow ? 0.3 : 1);
  const yaw = axis('ArrowLeft', 'ArrowRight');
  const pitch = axis('ArrowUp', 'ArrowDown');
  const panX = axis('KeyD', 'KeyA');
  const panY = axis('KeyW', 'KeyS');
  const zoom = axis('KeyE', 'KeyQ') + axis('Equal', 'Minus') + axis('NumpadAdd', 'NumpadSubtract');
  if (!yaw && !pitch && !panX && !panY && !zoom) return false;
  flyTo = null;

  offset.copy(camera.position).sub(controls.target);
  spherical.setFromVector3(offset);
  spherical.theta -= yaw * 1.6 * k;
  spherical.phi = THREE.MathUtils.clamp(spherical.phi - pitch * 1.2 * k, 0.05, Math.PI - 0.05);
  spherical.radius = THREE.MathUtils.clamp(spherical.radius * Math.exp(-zoom * 1.4 * k), controls.minDistance, controls.maxDistance);
  offset.setFromSpherical(spherical);

  // Pan in the screen plane, scaled to how far away the camera is.
  const step = spherical.radius * 0.7 * k;
  panVec.set(0, 0, 0)
    .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0), panX * step)
    .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), panY * step);
  controls.target.add(panVec);
  camera.position.copy(controls.target).add(offset);
  return true;
}

// The sky and the art keep moving, so frames are drawn continuously unless motion is turned off. Those ambient
// frames are capped near 60 a second, and if the device can't keep up the drawing resolution is lowered.
let sinceFrame = 0, slowFor = 0;
renderer.setAnimationLoop((now) => {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.05);
  if (stepKeys(dt)) needsRender = true;
  controls.update();
  sinceFrame += dt;
  const ambient = cosmos.update(dt);
  if (needsRender || flyTo || (ambient && sinceFrame >= 0.015)) {
    stepFly();
    occult?.animate?.(cosmos.time, cosmos.breath);
    renderer.render(scene, camera);
    needsRender = false;
    slowFor = sinceFrame > 0.04 ? slowFor + sinceFrame : 0;
    if (slowFor > 3 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); slowFor = 0; }
    sinceFrame = 0;
  }
});

// ---------- Data ----------
const catalog = await fetch('data/catalog.json').then((r) => r.json());
const systemsById = Object.fromEntries(catalog.systems.map((s) => [s.id, s]));
const structures = new Map(); // key "file/name" -> { ...struct, meshes: [] }
for (const s of catalog.structures) structures.set(`${s.file}/${s.name}`, { ...s, meshes: [] });

// How many structures each sub-filter option has, so empty options can be left out.
const optionCounts = {};
for (const s of catalog.structures) for (const [k, v] of Object.entries(s.f || {})) optionCounts[`${k}:${v}`] = (optionCounts[`${k}:${v}`] || 0) + 1;

// ---------- View state (remembered between visits) ----------
const STATE_KEY = 'anatomy.state.v2';
const DEFAULT_OPACITY = { skin: 0.3, fascia: 0.7 };
const state = { enabled: new Set(['skeletal']), off: new Set(), opacity: {}, ghost: 0.15, colors: { sys: {}, opt: {}, part: {} } };
try {
  const saved = JSON.parse(localStorage.getItem(STATE_KEY));
  if (saved) {
    state.enabled = new Set((saved.enabled || []).filter((id) => systemsById[id]));
    state.off = new Set(saved.off || []);
    state.opacity = saved.opacity || {};
    if (typeof saved.ghost === 'number') state.ghost = saved.ghost;
    if (saved.colors) state.colors = { sys: {}, opt: {}, part: {}, ...saved.colors };
  }
} catch {}
const opacityOf = (sys) => state.opacity[sys] ?? DEFAULT_OPACITY[sys] ?? 1;
function save() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify({ enabled: [...state.enabled], off: [...state.off], opacity: state.opacity, ghost: state.ghost, colors: state.colors }));
  } catch {}
}

const hidden = new Set(); // structure keys the user hid
let isolated = null; // Set of structure keys shown solid while everything else fades, or null
let isolatedLabel = '';
let selected = null;

// A structure shows through a system if that system is on and none of its sub-filters exclude it.
function passes(s, sys) {
  if (!state.enabled.has(sys)) return false;
  for (const facet of systemsById[sys].facets || []) {
    const v = s.f?.[`${sys}.${facet.id}`];
    if (v && state.off.has(`${sys}.${facet.id}:${v}`)) return false;
  }
  return true;
}
const shownBy = (s) => s.tags.find((t) => passes(s, t));

// ---------- Materials ----------
const materialCache = new Map();
function materialFor(color, opacity = 1) {
  const op = Math.round(opacity * 20) / 20;
  const id = `${color}|${op}`;
  if (!materialCache.has(id)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.0 });
    if (op < 1) Object.assign(m, { transparent: true, opacity: op, depthWrite: false });
    materialCache.set(id, m);
  }
  return materialCache.get(id);
}
const HIGHLIGHT = '#ff2d95';
const highlight = new THREE.MeshStandardMaterial({ color: HIGHLIGHT, emissive: 0x7a0a45, roughness: 0.45 });

// Colour precedence: the part's own colour, then a sub-filter colour (e.g. all cranial nerves),
// then the system colour, then the default colour from the model.
function colorOf(s, key, sys = shownBy(s) || s.tags[0]) {
  const oc = occult?.colorFor(s, key);
  if (oc) return oc;
  const c = state.colors;
  if (c.part[key]) return c.part[key];
  for (const facet of systemsById[sys]?.facets || []) {
    const v = s.f?.[`${sys}.${facet.id}`];
    if (v && c.opt[`${sys}.${facet.id}:${v}`]) return c.opt[`${sys}.${facet.id}:${v}`];
  }
  return c.sys[sys] || s.color || systemsById[sys]?.color || '#cccccc';
}
const defaultColorOf = (s) => s.color || systemsById[s.tags[0]]?.color || '#cccccc';

// Recolouring a whole system (or resetting it) clears the finer overrides inside it.
function clearColorsIn(sys) {
  for (const k of Object.keys(state.colors.opt)) if (k.startsWith(`${sys}.`)) delete state.colors.opt[k];
  for (const k of Object.keys(state.colors.part)) if (structures.get(k)?.tags.includes(sys)) delete state.colors.part[k];
}

// ---------- Loading ----------
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const files = new Map(); // file -> Promise
const loadingFiles = new Set();

function filesNeeded() {
  const need = new Set();
  for (const s of structures.values()) if (s.tags.some((t) => state.enabled.has(t))) need.add(s.file);
  return need;
}

function loadFile(file) {
  if (files.has(file)) return files.get(file);
  loadingFiles.add(file);
  updateLoading();
  const p = loader.loadAsync(`models/${file}.glb`).then((gltf) => {
    gltf.scene.traverse((obj) => {
      const s = obj.userData.name && structures.get(`${file}/${obj.userData.name}`);
      if (!s) return;
      obj.traverse((m) => {
        if (!m.isMesh) return;
        m.userData.key = `${file}/${s.name}`;
        s.meshes.push(m);
      });
    });
    body.add(gltf.scene);
  }).catch((err) => {
    console.error(err);
    files.delete(file);
    alert(`Couldn't load the ${file} model. Check your connection and try again.`);
  }).finally(() => {
    loadingFiles.delete(file);
    updateLoading();
    applyVisibility();
  });
  files.set(file, p);
  return p;
}

function updateLoading() {
  $('loading').hidden = loadingFiles.size === 0;
  $('loading-text').textContent = `Loading ${[...loadingFiles].join(', ')}…`;
  for (const el of document.querySelectorAll('[data-sys]')) {
    const id = el.dataset.sys;
    const busy = state.enabled.has(id) && [...structures.values()].some((s) => s.tags.includes(id) && loadingFiles.has(s.file));
    el.classList.toggle('busy', busy);
  }
}

// ---------- Visibility ----------
function applyVisibility() {
  for (const [key, s] of structures) {
    if (!s.meshes.length) continue;
    const sys = shownBy(s);
    let visible = false, material = null;
    if (key === selected) {
      visible = true; material = highlight;
    } else if (hidden.has(key)) {
      visible = false;
    } else if (isolated) {
      if (isolated.has(key)) { visible = true; material = materialFor(colorOf(s, key, sys)); }
      else if (sys && state.ghost > 0) { visible = true; material = materialFor(colorOf(s, key, sys), state.ghost); }
    } else if (sys) {
      const op = occult ? occult.opacityFor(sys, opacityOf(sys)) : opacityOf(sys);
      visible = true; material = materialFor(colorOf(s, key, sys), op);
    }
    for (const m of s.meshes) {
      m.visible = visible;
      if (material) m.material = material;
    }
  }
  const restore = $('restore');
  restore.hidden = !isolated && hidden.size === 0;
  $('restore-text').textContent = isolated ? `Focused: ${isolatedLabel}` : `${hidden.size} hidden`;
  $('ghost-wrap').hidden = !isolated;
  needsRender = true;
}

function refresh() {
  save();
  for (const f of filesNeeded()) loadFile(f);
  applyVisibility();
  updateLoading();
  syncUI();
}

// ---------- Systems UI: quick chips (phone) and the layers panel ----------
const nav = $('systems');
const panelList = $('panel-list');
const layersChip = document.createElement('button');
layersChip.className = 'chip chip-layers';
layersChip.innerHTML = '☰ Layers';
layersChip.addEventListener('click', () => togglePanel());
nav.append(layersChip);

function togglePanel(open = $('panel').classList.contains('closed')) {
  $('panel').classList.toggle('closed', !open);
}
$('panel-close').addEventListener('click', () => togglePanel(false));

catalog.systems.forEach((sys, i) => {
  const key = i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : '';

  const chip = document.createElement('button');
  chip.className = 'chip';
  chip.dataset.sys = sys.id;
  chip.style.setProperty('--c', sys.color);
  chip.innerHTML = `<span class="dot"></span>${sys.name}${key}`;
  chip.addEventListener('click', () => toggleSystem(sys.id));
  nav.append(chip);

  const row = document.createElement('section');
  row.className = 'sys';
  row.style.setProperty('--c', sys.color);
  const facets = (sys.facets || []).map((fc) => {
    const options = fc.options.filter((o) => optionCounts[`${sys.id}.${fc.id}:${o.id}`]);
    return `<div class="facet" data-facet="${sys.id}.${fc.id}">
      <div class="facet-head"><span>${fc.name}</span><button data-all>All</button><button data-none>None</button></div>
      <div class="pills">${options.map((o) => `<span class="pill-wrap"><button class="pill" data-opt="${sys.id}.${fc.id}:${o.id}">${o.name}</button><label class="swatch" title="Colour ${o.name}"><input type="color" data-color-opt="${sys.id}.${fc.id}:${o.id}" aria-label="Colour ${o.name}"></label></span>`).join('')}</div>
    </div>`;
  }).join('');
  row.innerHTML = `
    <div class="sys-row">
      <button class="sys-toggle" data-sys="${sys.id}"><span class="dot"></span><span class="sys-name">${sys.name}</span>${key}</button>
      <button class="sys-expand" aria-label="Show ${sys.name} filters" aria-expanded="false">▾</button>
    </div>
    <div class="sys-body" hidden>
      <label class="opacity">Opacity <input type="range" min="5" max="100" step="5"><output></output></label>
      <div class="colors">Colour <label class="swatch big" title="Colour every part of ${sys.name}"><input type="color" data-color-sys="${sys.id}" aria-label="Colour all of ${sys.name}"></label><button data-reset-colors>Reset colours</button></div>
      ${facets}
    </div>`;
  row.querySelector('.sys-toggle').addEventListener('click', () => toggleSystem(sys.id));
  const expand = row.querySelector('.sys-expand');
  expand.addEventListener('click', () => {
    const open = expand.getAttribute('aria-expanded') !== 'true';
    expand.setAttribute('aria-expanded', open);
    row.querySelector('.sys-body').hidden = !open;
  });
  const slider = row.querySelector('input[type=range]');
  slider.addEventListener('input', () => {
    state.opacity[sys.id] = slider.value / 100;
    if (!state.enabled.has(sys.id)) state.enabled.add(sys.id);
    refresh();
  });
  row.querySelector('[data-color-sys]').addEventListener('input', (e) => {
    clearColorsIn(sys.id);
    state.colors.sys[sys.id] = e.target.value;
    state.enabled.add(sys.id);
    refresh();
  });
  row.querySelector('[data-reset-colors]').addEventListener('click', () => {
    clearColorsIn(sys.id);
    delete state.colors.sys[sys.id];
    refresh();
  });
  for (const input of row.querySelectorAll('[data-color-opt]')) {
    input.addEventListener('input', () => {
      state.colors.opt[input.dataset.colorOpt] = input.value;
      state.enabled.add(sys.id);
      refresh();
    });
  }
  for (const pill of row.querySelectorAll('.pill')) {
    pill.addEventListener('click', () => {
      const id = pill.dataset.opt;
      state.off.has(id) ? state.off.delete(id) : state.off.add(id);
      state.enabled.add(sys.id);
      refresh();
    });
  }
  for (const facet of row.querySelectorAll('.facet')) {
    const pills = [...facet.querySelectorAll('.pill')].map((p) => p.dataset.opt);
    facet.querySelector('[data-all]').addEventListener('click', () => { pills.forEach((id) => state.off.delete(id)); state.enabled.add(sys.id); refresh(); });
    facet.querySelector('[data-none]').addEventListener('click', () => { pills.forEach((id) => state.off.add(id)); refresh(); });
  }
  panelList.append(row);
});

function syncUI() {
  for (const el of document.querySelectorAll('[data-sys]')) el.setAttribute('aria-pressed', state.enabled.has(el.dataset.sys));
  for (const pill of document.querySelectorAll('.pill')) pill.setAttribute('aria-pressed', !state.off.has(pill.dataset.opt));
  for (const row of panelList.querySelectorAll('.sys:not(.occ)')) {
    const id = row.querySelector('.sys-toggle').dataset.sys;
    const v = Math.round(opacityOf(id) * 100);
    row.querySelector('input[type=range]').value = v;
    row.querySelector('output').textContent = `${v}%`;
  }
  $('ghost').value = Math.round(state.ghost * 100);
  for (const input of document.querySelectorAll('[data-color-sys]')) {
    const id = input.dataset.colorSys;
    input.value = state.colors.sys[id] || systemsById[id].color;
    input.parentElement.style.background = input.value;
  }
  for (const input of document.querySelectorAll('[data-color-opt]')) {
    const c = state.colors.opt[input.dataset.colorOpt];
    input.value = c || '#ff2d95';
    input.parentElement.classList.toggle('set', !!c);
    input.parentElement.style.background = c || '';
  }
  syncPartColor();
}

function toggleSystem(id) {
  state.enabled.has(id) ? state.enabled.delete(id) : state.enabled.add(id);
  refresh();
}

$('ghost').addEventListener('input', (e) => {
  state.ghost = e.target.value / 100;
  save();
  applyVisibility();
});

// ---------- Picking ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;

canvas.tabIndex = 0;
canvas.style.outline = 'none';
canvas.addEventListener('pointerdown', (e) => {
  canvas.focus({ preventScroll: true });
  down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
});
canvas.addEventListener('pointerup', (e) => {
  if (!down || !e.isPrimary) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (moved < 6 && performance.now() - down.t < 500) pick(e.clientX, e.clientY);
  down = null;
});

function pick(x, y) {
  pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const occ = occult?.pick(raycaster);
  if (occ) { occult.select(occ.layer, occ.item); return; }
  const hits = raycaster.intersectObject(body, true).filter((h) => h.object.visible && h.object.userData.key);
  // Prefer solid parts, so tapping through faded skin or ghosts picks what's inside.
  const hit = hits.find((h) => h.object.material.opacity >= 0.5) || hits[0];
  select(hit ? hit.object.userData.key : null);
}

function prettyName(name) {
  return name.replace(/\.r$/, ' (right)').replace(/\.l$/, ' (left)');
}

function select(key) {
  selected = key;
  if (key) occult?.deselect();
  $('info').hidden = !key && !occult?.isSelected();
  if (key) {
    $('info-part').hidden = false;
    $('info-occult').hidden = true;
    $('occ-icon').hidden = true;
    const s = structures.get(key);
    const extra = occult?.describePart(s, key) || '';
    $('info-extra').textContent = extra;
    $('info-extra').hidden = !extra;
    $('info-name').textContent = prettyName(s.name);
    syncPartColor();
    $('info-system').textContent = s.tags.map((t) => systemsById[t].name).join(' · ');
    const path = $('info-path');
    path.replaceChildren();
    s.groups.forEach((g, i) => {
      if (i) path.append(' › ');
      const b = document.createElement('button');
      b.textContent = g;
      b.title = `Focus on all of ${g}`;
      b.addEventListener('click', () => isolateGroup(s.file, g));
      path.append(b);
    });
  }
  applyVisibility();
}

// Focus on a whole group (e.g. "Cranial nerves"): it stays solid while everything else fades.
function isolateGroup(file, group) {
  const keys = [...structures].filter(([, s]) => s.file === file && s.groups.includes(group)).map(([k]) => k);
  isolated = new Set(keys);
  isolatedLabel = group;
  select(null);
  focusOnKeys(keys);
}

$('info-close').addEventListener('click', () => { select(null); occult?.deselect(); });

function syncPartColor() {
  if (!selected) return;
  const s = structures.get(selected);
  const c = colorOf(s, selected);
  $('part-color').value = c;
  $('part-color').parentElement.style.background = c;
  $('part-color-reset').hidden = !state.colors.part[selected];
}
$('part-color').addEventListener('input', (e) => {
  state.colors.part[selected] = e.target.value;
  save();
  syncPartColor();
});
// Close the card after picking so the new colour is visible instead of the pink highlight.
$('part-color').addEventListener('change', () => select(null));
$('part-color-reset').addEventListener('click', () => {
  delete state.colors.part[selected];
  save();
  syncPartColor();
});
$('act-hide').addEventListener('click', () => {
  if (!selected) return;
  hidden.add(selected);
  if (isolated) isolated.delete(selected);
  select(null);
});
$('act-isolate').addEventListener('click', () => {
  if (!selected) return;
  isolated = new Set([selected]);
  isolatedLabel = prettyName(structures.get(selected).name);
  focusOn(selected);
  applyVisibility();
});
$('act-focus').addEventListener('click', () => selected && focusOn(selected));
$('act-showall').addEventListener('click', () => {
  hidden.clear();
  isolated = null;
  applyVisibility();
});

// ---------- Camera moves ----------
function focusOn(key) {
  focusOnKeys([key]);
}
function focusOnKeys(keys) {
  const box = new THREE.Box3();
  for (const k of keys) for (const m of structures.get(k).meshes) box.expandByObject(m);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.03);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.3;
  startFly(center, center.clone().add(dir.multiplyScalar(dist)));
}
function focusPoint(center, radius, dir = camera.position.clone().sub(controls.target).normalize()) {
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.3;
  startFly(center.clone(), center.clone().add(dir.multiplyScalar(dist)));
}
// Light up a set of structures (turning their systems on) while everything else fades, then fly to them.
function showStructures(keys, label) {
  keys = keys.filter((k) => structures.has(k));
  if (!keys.length) return;
  for (const k of keys) {
    const s = structures.get(k);
    if (!s.tags.some((t) => state.enabled.has(t))) state.enabled.add(s.tags[0]);
  }
  select(null);
  hidden.clear();
  isolated = new Set(keys);
  isolatedLabel = label;
  refresh();
  Promise.all([...new Set(keys.map((k) => structures.get(k).file))].map(loadFile)).then(() => {
    applyVisibility();
    focusOnKeys(keys);
  });
}
function startFly(target, position) {
  flyTo = { t0: performance.now(), fromT: controls.target.clone(), fromP: camera.position.clone(), target, position };
}
function stepFly() {
  if (!flyTo) return;
  const k = Math.min(1, (performance.now() - flyTo.t0) / 600);
  const e = 1 - Math.pow(1 - k, 3);
  controls.target.lerpVectors(flyTo.fromT, flyTo.target, e);
  camera.position.lerpVectors(flyTo.fromP, flyTo.position, e);
  if (k === 1) flyTo = null;
}
$('btn-reset').addEventListener('click', () => startFly(HOME.target.clone(), HOME.position.clone()));
$('btn-about').addEventListener('click', () => $('about').showModal());

// ---------- Keyboard shortcuts ----------
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey) { held.clear(); return; }
  if (document.querySelector('dialog[open]') && e.code !== 'Slash') return;
  held.add(e.code);
  if (MOVE_KEYS.has(e.code) || e.code.startsWith('Alt')) { e.preventDefault(); return; }
  if (e.repeat) return;
  const digit = e.code.match(/^(?:Digit|Numpad)(\d)$/);
  if (digit) {
    const sys = catalog.systems[(+digit[1] + 9) % 10];
    if (sys) toggleSystem(sys.id);
    return;
  }
  switch (e.code) {
    case 'KeyR': case 'Home': startFly(HOME.target.clone(), HOME.position.clone()); break;
    case 'KeyF': if (selected) focusOn(selected); break;
    case 'KeyH': $('act-hide').click(); break;
    case 'KeyI': $('act-isolate').click(); break;
    case 'KeyX': $('act-showall').click(); break;
    case 'Escape': select(null); occult?.deselect(); break;
    case 'KeyL': togglePanel(); break;
    case 'Slash': {
      const d = $('keys');
      d.open ? d.close() : d.showModal();
      break;
    }
    default: return;
  }
  e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  held.delete(e.code);
  // macOS drops keyup events for keys released while Cmd is down.
  if (e.key === 'Meta') held.clear();
});
window.addEventListener('blur', () => held.clear());
$('btn-keys').addEventListener('click', () => $('keys').showModal());

// ---------- Sky & art settings ----------
const syncStill = () => {
  document.body.classList.toggle('still', !cosmos.settings.motion);
  $('set-wish').disabled = !(cosmos.settings.sky && cosmos.settings.motion);
};
for (const key of ['sky', 'art', 'motion']) {
  const box = $(`set-${key}`);
  box.checked = cosmos.settings[key];
  box.addEventListener('change', () => { cosmos.set(key, box.checked); syncStill(); needsRender = true; });
}
$('set-wish').addEventListener('click', () => { cosmos.event(); $('scene').close(); });
$('btn-scene').addEventListener('click', () => $('scene').showModal());
syncStill();

// ---------- Go ----------
occult = await initOccult({
  scene, structures, applyVisibility, focusPoint, showStructures,
  render: () => (needsRender = true),
  enableSystem: (id) => { state.enabled.add(id); refresh(); },
  deselectPart: () => { if (selected) { selected = null; applyVisibility(); } },
  hasPartSelected: () => !!selected,
}).catch((err) => { console.error('Occult layers failed to load', err); return null; });
occult?.syncPanel();
refresh();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered', err));
}
