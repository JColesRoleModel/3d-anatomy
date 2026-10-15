import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'anatomy.enabled';

// ---------- Scene ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101418);

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
const HOME = { target: new THREE.Vector3(0, 0.82, 0), position: new THREE.Vector3(0, 0.85, 3.5) };
camera.position.copy(HOME.position);

scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2f36, 1.6));
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
controls.addEventListener('change', () => (needsRender = true));
renderer.setAnimationLoop(() => {
  controls.update();
  if (needsRender || flyTo) {
    stepFly();
    renderer.render(scene, camera);
    needsRender = false;
  }
});

// ---------- Data ----------
const catalog = await fetch('data/catalog.json').then((r) => r.json());
const systemsById = Object.fromEntries(catalog.systems.map((s) => [s.id, s]));
const structures = new Map(); // key "file/name" -> { ...struct, meshes: [] }
for (const s of catalog.structures) structures.set(`${s.file}/${s.name}`, { ...s, meshes: [] });

let enabled = new Set(['skeletal']);
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY));
  if (Array.isArray(saved)) enabled = new Set(saved.filter((id) => systemsById[id]));
} catch {}

const hidden = new Set(); // structure keys the user hid
let isolated = null; // Set of structure keys, or null
let selected = null;

// ---------- Materials ----------
const materialCache = new Map();
function materialFor(color, see_through = false) {
  const id = color + (see_through ? '/glass' : '');
  if (!materialCache.has(id)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.0 });
    // Skin is drawn see-through so the systems underneath stay visible.
    if (see_through) Object.assign(m, { transparent: true, opacity: 0.28, depthWrite: false });
    materialCache.set(id, m);
  }
  return materialCache.get(id);
}
const baseMaterial = (s) => materialFor(colorOf(s), s.tags.includes('skin'));
const highlight = new THREE.MeshStandardMaterial({ color: 0x7cc4ff, emissive: 0x1d4f7a, roughness: 0.5 });

function colorOf(s) {
  return s.color || systemsById[s.tags[0]]?.color || '#cccccc';
}

// ---------- Loading ----------
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const files = new Map(); // file -> Promise
const loadingFiles = new Set();

function filesNeeded() {
  const need = new Set();
  for (const s of structures.values()) if (s.tags.some((t) => enabled.has(t))) need.add(s.file);
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
        m.material = baseMaterial(s);
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
  const names = [...loadingFiles].join(', ');
  $('loading-text').textContent = `Loading ${names}…`;
  for (const chip of document.querySelectorAll('.chip')) {
    const busy = [...structures.values()].some((s) => s.tags.includes(chip.dataset.id) && loadingFiles.has(s.file));
    chip.classList.toggle('busy', busy && enabled.has(chip.dataset.id));
  }
}

function isVisible(key, s) {
  if (isolated) return isolated.has(key);
  return !hidden.has(key) && s.tags.some((t) => enabled.has(t));
}

function applyVisibility() {
  for (const [key, s] of structures) {
    const v = isVisible(key, s);
    for (const m of s.meshes) m.visible = v;
  }
  if (selected && !isVisible(selected, structures.get(selected))) select(null);
  const n = isolated ? isolated.size : hidden.size;
  $('restore').hidden = !isolated && hidden.size === 0;
  $('restore-text').textContent = isolated ? 'Isolated view' : `${n} hidden`;
  needsRender = true;
}

function refresh() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify([...enabled])); } catch {}
  for (const f of filesNeeded()) loadFile(f);
  applyVisibility();
  updateLoading();
}

// ---------- System chips ----------
const nav = $('systems');
for (const sys of catalog.systems) {
  const b = document.createElement('button');
  b.className = 'chip';
  b.dataset.id = sys.id;
  b.style.setProperty('--c', sys.color);
  b.innerHTML = `<span class="dot"></span>${sys.name}`;
  b.setAttribute('aria-pressed', enabled.has(sys.id));
  b.addEventListener('click', () => {
    enabled.has(sys.id) ? enabled.delete(sys.id) : enabled.add(sys.id);
    b.setAttribute('aria-pressed', enabled.has(sys.id));
    refresh();
  });
  nav.append(b);
}

// ---------- Picking ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let down = null;

canvas.addEventListener('pointerdown', (e) => {
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
  const hit = raycaster.intersectObject(body, true).find((h) => h.object.visible && h.object.userData.key);
  select(hit ? hit.object.userData.key : null);
}

function prettyName(name) {
  return name.replace(/\.r$/, ' (right)').replace(/\.l$/, ' (left)');
}

function select(key) {
  if (selected) for (const m of structures.get(selected).meshes) m.material = baseMaterial(structures.get(selected));
  selected = key;
  $('info').hidden = !key;
  if (key) {
    const s = structures.get(key);
    for (const m of s.meshes) m.material = highlight;
    $('info-name').textContent = prettyName(s.name);
    $('info-system').textContent = s.tags.map((t) => systemsById[t].name).join(' · ');
    $('info-path').textContent = s.groups.join(' › ');
  }
  needsRender = true;
}

$('info-close').addEventListener('click', () => select(null));
$('act-hide').addEventListener('click', () => {
  if (!selected) return;
  hidden.add(selected);
  if (isolated) isolated.delete(selected);
  select(null);
  applyVisibility();
});
$('act-isolate').addEventListener('click', () => {
  if (!selected) return;
  isolated = new Set([selected]);
  applyVisibility();
  focusOn(selected);
});
$('act-focus').addEventListener('click', () => selected && focusOn(selected));
$('act-showall').addEventListener('click', () => {
  hidden.clear();
  isolated = null;
  applyVisibility();
});

// ---------- Camera moves ----------
function focusOn(key) {
  const box = new THREE.Box3();
  for (const m of structures.get(key).meshes) box.expandByObject(m);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.03);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.3;
  startFly(center, center.clone().add(dir.multiplyScalar(dist)));
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

// ---------- Go ----------
refresh();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker not registered', err));
}
