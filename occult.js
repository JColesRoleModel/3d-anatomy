// Occult anatomy layers: chakras, elements & vayus, the gland trinity, the hand map, the Tree of Life,
// nadis and polarity. The data (and where each item sits on the body) comes from data/occult.json,
// built by tools/occult.mjs from Brian's Canva boards.
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'anatomy.occult.v1';
const SYMBOL_FONT = "'Noto Sans Symbols'";
const SOURCE_NAMES = { WB: 'your whiteboard', UM: 'Universal Map', '7C': '7 Chakras' };

export async function initOccult(api) {
  const data = await fetch('data/occult.json').then((r) => r.json());
  const layers = data.layers;
  const byId = Object.fromEntries(layers.map((l) => [l.id, l]));

  let enabled = new Set();
  try { enabled = new Set((JSON.parse(localStorage.getItem(STORE_KEY)) || []).filter((id) => byId[id])); } catch {}
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify([...enabled])); } catch {} };

  // The symbol font draws zodiac, planet and alchemy glyphs the same on every device.
  try {
    const face = new FontFace('Noto Sans Symbols', 'url(vendor/fonts/noto-sans-symbols-symbols-500-normal.woff2)');
    document.fonts.add(await face.load());
  } catch (err) { console.warn('Symbol font not loaded', err); }

  // ---------- 3D ----------
  const root = new THREE.Group();
  api.scene.add(root);
  const groups = {};
  const pickables = [];
  const objectsByItem = new Map();

  // Brian's symbol on a dark round badge, so it reads clearly over pale bone and skin.
  function iconTexture(url, color) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      const g = c.getContext('2d');
      g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2);
      g.fillStyle = 'rgba(16, 20, 24, 0.8)'; g.fill();
      g.lineWidth = 5; g.strokeStyle = color; g.globalAlpha = 0.8; g.stroke(); g.globalAlpha = 1;
      g.drawImage(img, 36, 36, 184, 184);
      t.needsUpdate = true;
      api.render();
    };
    img.src = url;
    return t;
  }
  // A round badge with a glyph (zodiac sign, planet, number) for items without a picture.
  function glyphTexture(item, layer) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const color = item.color || layer.color;
    g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fillStyle = 'rgba(16, 20, 24, 0.82)'; g.fill();
    g.lineWidth = 6; g.strokeStyle = color;
    if (item.id === 'daat') g.setLineDash([12, 9]);
    g.stroke(); g.setLineDash([]);
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (item.glyph === '☉') {
      // The sun sign is missing from the symbol font, so draw it.
      g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 30, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(64, 64, 7, 0, Math.PI * 2); g.fill();
    } else if (item.glyph) {
      g.font = `500 72px ${SYMBOL_FONT}, sans-serif`;
      g.fillText(item.glyph + '︎', 64, 70);
    } else {
      g.font = '600 60px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      g.fillText(item.num ? String(item.num) : '', 64, 68);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const overlay = (m) => Object.assign(m, { depthTest: false, depthWrite: false, transparent: true });

  for (const layer of layers) {
    const group = new THREE.Group();
    group.visible = enabled.has(layer.id);
    groups[layer.id] = group;
    root.add(group);
    for (const line of layer.lines || []) {
      const geo = new THREE.BufferGeometry().setFromPoints(line.points.map((p) => new THREE.Vector3(...p)));
      const obj = new THREE.Line(geo, overlay(new THREE.LineBasicMaterial({ color: line.color, opacity: line.opacity ?? 0.85 })));
      obj.renderOrder = 18;
      group.add(obj);
    }
    for (const item of layer.items) {
      if (item.points) {
        const curve = new THREE.CatmullRomCurve3(item.points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
        const geo = new THREE.TubeGeometry(curve, item.points.length * 6, item.radius, 8, false);
        const mesh = new THREE.Mesh(geo, overlay(new THREE.MeshBasicMaterial({ color: item.color, opacity: 0.9 })));
        mesh.renderOrder = 19;
        mesh.userData.occult = { layer: layer.id, item: item.id };
        group.add(mesh);
        pickables.push(mesh);
        objectsByItem.set(item.id, mesh);
      } else if (item.pos) {
        const map = item.icon ? iconTexture(item.icon, item.color || layer.color) : glyphTexture(item, layer);
        const sprite = new THREE.Sprite(overlay(new THREE.SpriteMaterial({ map })));
        sprite.position.set(...item.pos);
        sprite.scale.setScalar(item.size || 0.05);
        sprite.renderOrder = 20;
        sprite.userData.occult = { layer: layer.id, item: item.id };
        group.add(sprite);
        pickables.push(sprite);
        objectsByItem.set(item.id, sprite);
      }
    }
  }
  const itemOf = (layerId, itemId) => byId[layerId].items.find((i) => i.id === itemId);

  // ---------- Panel ----------
  const list = $('panel-list');
  const head = document.createElement('div');
  head.className = 'occ-title';
  head.innerHTML = '<h3>Occult anatomy</h3><span>from your Canva boards</span>';
  list.append(head);
  const iconHTML = (x, cls = 'occ-icon') => (x.icon
    ? `<img class="${cls}" src="${x.icon}" alt="">`
    : x.glyph ? `<span class="${cls} occ-glyph" style="color:${x.color}">${x.glyph === '☉' ? '⊙' : x.glyph}&#xFE0E;</span>`
      : `<span class="${cls} occ-dot" style="background:${x.color}"></span>`);
  const listed = (layer) => layer.items.filter((i) => (layer.id === 'hands' ? i.listOnly : true));

  for (const layer of layers) {
    const row = document.createElement('section');
    row.className = 'sys occ';
    row.style.setProperty('--c', layer.color);
    const legend = layer.legend ? `<div class="occ-legend">${layer.legend.map((l) => `<span><i style="background:${l.color}"></i>${l.name}</span>`).join('')}</div>` : '';
    const groupsHTML = layer.id === 'hands'
      ? [['Fingers', listed(layer).filter((i) => i.id.startsWith('finger-'))], ['Mudras', listed(layer).filter((i) => i.id.startsWith('mudra-'))]]
      : layer.id === 'tree'
        ? [['Sephiroth', layer.items.filter((i) => !i.listOnly)], ['Pillars', layer.items.filter((i) => i.listOnly)]]
        : [[layer.id === 'polarity' ? 'Your table' : '', listed(layer)]];
    row.innerHTML = `
      <div class="sys-row">
        <button class="sys-toggle" data-occ="${layer.id}">${iconHTML(layer)}<span class="sys-name">${layer.name}</span></button>
        <button class="sys-expand" aria-label="Show ${layer.name}" aria-expanded="false">▾</button>
      </div>
      <div class="sys-body" hidden>
        <p class="occ-about">${layer.about}</p>
        ${legend}
        ${groupsHTML.map(([title, items]) => `<div class="facet">${title ? `<div class="facet-head"><span>${title}</span></div>` : ''}
          <div class="pills">${items.map((i) => `<button class="pill occ-pill" data-layer="${layer.id}" data-item="${i.id}" title="${i.sub || ''}">${iconHTML(i, 'occ-pill-icon')}${i.name}</button>`).join('')}</div></div>`).join('')}
      </div>`;
    row.querySelector('.sys-toggle').addEventListener('click', () => toggleLayer(layer.id));
    const expand = row.querySelector('.sys-expand');
    expand.addEventListener('click', () => {
      const open = expand.getAttribute('aria-expanded') !== 'true';
      expand.setAttribute('aria-expanded', open);
      row.querySelector('.sys-body').hidden = !open;
    });
    for (const pill of row.querySelectorAll('.occ-pill')) {
      pill.addEventListener('click', () => {
        if (!enabled.has(layer.id)) toggleLayer(layer.id, true);
        select(layer.id, pill.dataset.item, true);
      });
    }
    list.append(row);
  }

  function syncPanel() {
    for (const el of document.querySelectorAll('[data-occ]')) el.setAttribute('aria-pressed', enabled.has(el.dataset.occ));
  }

  function toggleLayer(id, on = !enabled.has(id)) {
    on ? enabled.add(id) : enabled.delete(id);
    groups[id].visible = on;
    if (!on && current?.layer === id) deselect();
    if (id === 'polarity') {
      // Polarity colours the skin, so make sure the skin is showing.
      if (on) api.enableSystem('skin');
      api.applyVisibility();
    }
    save();
    syncPanel();
    api.render();
  }

  // ---------- Picking and the info card ----------
  let current = null; // { layer, item }

  function pick(raycaster) {
    const visible = pickables.filter((o) => groups[o.userData.occult.layer].visible);
    if (!visible.length) return null;
    const hits = raycaster.intersectObjects(visible, false);
    // Symbols win over the nadi tubes they sit on.
    const hit = hits.find((h) => h.object.isSprite) || hits[0];
    return hit ? hit.object.userData.occult : null;
  }

  function select(layerId, itemId, fly = false) {
    const layer = byId[layerId], item = itemOf(layerId, itemId);
    if (!item) return;
    api.deselectPart();
    current = { layer: layerId, item: itemId };
    $('info').hidden = false;
    $('info-part').hidden = true;
    $('info-occult').hidden = false;
    $('info-system').textContent = layer.name;
    $('info-name').textContent = item.name;
    const path = $('info-path');
    path.textContent = item.sub || '';

    const icon = $('occ-icon');
    icon.innerHTML = item.icon || item.glyph || item.num ? iconHTML(item.icon || item.glyph ? item : { ...item, glyph: String(item.num) }, 'occ-card-icon') : '';
    icon.hidden = !icon.innerHTML;
    const used = new Set();
    let unsure = false;
    $('occ-fields').innerHTML = (item.fields || []).map((f) => {
      if (f.q) unsure = true;
      for (const s of (f.src || '').split(',').map((x) => x.trim()).filter(Boolean)) used.add(s.split(' ')[0]);
      return `<dt>${esc(f.k)}</dt><dd class="${f.q ? 'q' : ''}">${esc(f.v)}${f.q ? '<b>*</b>' : ''}${f.note ? `<small>${esc(f.note)}</small>` : ''}</dd>`;
    }).join('');
    $('occ-note').textContent = item.note || '';
    $('occ-note').hidden = !item.note;
    $('occ-place').textContent = item.placement || '';
    $('occ-place').hidden = !item.placement;
    $('occ-foot').innerHTML = [unsure ? '<span class="q">*</span> incomplete, unsure or conflicting on your boards' : '',
      used.size ? `From ${[...used].map((s) => SOURCE_NAMES[s] || s).filter((v, i, a) => a.indexOf(v) === i).join(', ')}` : ''].filter(Boolean).join(' · ');
    const target = objectsByItem.get(item.id) || (item.focusIds || []).map((id) => objectsByItem.get(id)).find(Boolean);
    $('occ-focus').hidden = !target;
    $('occ-show').hidden = !item.show;
    if (item.show) $('occ-show').textContent = item.show.label;
    highlight(item.id);
    if (fly && target) focusItem(item, target);
    api.render();
  }

  function deselect() {
    if (!current) return;
    current = null;
    highlight(null);
    $('info-occult').hidden = true;
    $('occ-icon').hidden = true;
    $('info-part').hidden = false;
    if (!api.hasPartSelected()) $('info').hidden = true;
    api.render();
  }

  // The chosen symbol grows a little so it is easy to find.
  let grown = null;
  function highlight(itemId) {
    if (grown) { grown.obj.scale.setScalar(grown.size); grown = null; }
    const obj = itemId && objectsByItem.get(itemId);
    if (obj?.isSprite) {
      grown = { obj, size: obj.scale.x };
      obj.scale.setScalar(grown.size * 1.45);
    }
  }

  // Some items read best from one side (the gland triangle lies in the midline, so it is seen from the side).
  function focusItem(item, target) {
    if (item.frame) api.focusPoint(new THREE.Vector3(...item.frame.c), item.frame.r, new THREE.Vector3(...item.frame.view).normalize());
    else focusObject(target, item.view);
  }
  function focusObject(obj, view) {
    const box = new THREE.Box3().setFromObject(obj);
    const center = obj.isSprite ? obj.position.clone() : box.getCenter(new THREE.Vector3());
    const radius = obj.isSprite ? Math.max(obj.scale.x * 2.5, 0.06) : Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.08);
    api.focusPoint(center, radius, view && new THREE.Vector3(...view).normalize());
  }

  $('occ-focus').addEventListener('click', () => {
    if (!current) return;
    const item = itemOf(current.layer, current.item);
    const target = objectsByItem.get(item.id) || (item.focusIds || []).map((id) => objectsByItem.get(id)).find(Boolean);
    if (target) focusItem(item, target);
  });
  $('occ-show').addEventListener('click', () => {
    if (!current) return;
    const item = itemOf(current.layer, current.item);
    const keys = resolveShow(item.show);
    api.showStructures(keys, item.name);
  });

  function resolveShow(show) {
    const keys = [];
    for (const [key, s] of api.structures) {
      if (show.names?.includes(key)
        || (show.group && s.file === show.group[0] && s.groups.includes(show.group[1]))
        || (show.system && s.tags.includes(show.system))
        || (show.regionGroups && s.file === 'regions' && show.regionGroups.some((g) => s.groups.includes(g)) && !s.groups.includes('Hairs'))) keys.push(key);
    }
    return keys;
  }

  // ---------- Polarity colouring ----------
  const pol = byId.polarity;
  const polColor = Object.fromEntries(pol.legend.map((l) => [l.name.toLowerCase(), l.color]));
  const NONE = pol.legend.find((l) => l.id === 'none').color;
  const interiorCache = new Map();
  function polarityOf(s, key) {
    if (s.file === 'regions') {
      if (s.groups.includes('Hairs')) return null;
      const base = s.name.replace(/\.[lr]$/, '');
      const side = s.name.endsWith('.l') ? 'l' : 'r';
      const m = pol.skin[base];
      if (!m) return { none: true };
      const value = typeof m[2] === 'string' ? m[2] : m[2][side];
      const surface = m[1] === 'side' ? `${side === 'r' ? 'R' : 'L'} side` : m[1];
      return { value, row: m[0], surface };
    }
    if (!interiorCache.has(key)) {
      const hit = pol.interior.find(({ match: m }) => m.names?.includes(key)
        || (m.file === s.file && ((m.group && s.groups.includes(m.group)) || (m.regex && new RegExp(m.regex).test(s.name)))));
      interiorCache.set(key, hit ? { value: hit.pol, row: hit.row, surface: 'interior' } : null);
    }
    return interiorCache.get(key);
  }

  return {
    pick,
    select,
    deselect,
    isSelected: () => !!current,
    // Polarity takes over the colour of the parts it covers while the layer is on.
    colorFor(s, key) {
      if (!enabled.has('polarity')) return null;
      const p = polarityOf(s, key);
      if (!p) return null;
      return p.none ? NONE : polColor[p.value];
    },
    opacityFor(sys, opacity) {
      return enabled.has('polarity') && sys === 'skin' ? Math.max(opacity, 0.9) : opacity;
    },
    describePart(s, key) {
      if (!enabled.has('polarity')) return '';
      const p = polarityOf(s, key);
      if (!p) return '';
      if (p.none) return 'Polarity: not in your table';
      const row = pol.rows[p.row];
      return `Polarity: ${p.value} (${row.title.toLowerCase()}, ${p.surface})`;
    },
    syncPanel,
  };
}

// Escapes text for HTML and asks for the plain (non-emoji) form of zodiac and planet signs.
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/([\u2600-\u26FF])(?!\uFE0E)/g, '$1\uFE0E');
}
