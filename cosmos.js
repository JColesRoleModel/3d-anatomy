// The cosmic stage around the body. A breathing night sky (aurora and nebula from the two Gunna covers Brian
// shared) full of twinkling stars, with shooting stars and the odd random sky event: a meteor shower, a lightning
// storm, a comet, a nova or an aurora surge. Around the body sit 3D versions of the art on Brian's
// "Secret of the Ages" poster: the pillars with a sun and a moon above them, the emerald cross, the Tree of Life,
// the crown of twelve rays, the star of David as a star tetrahedron, the Aquarian jar and the bag of magic dust,
// the emerald tablet and the caduceus, plus a zodiac wheel and orbiting zodiac ring like the covers.
// Everything is drawn in code (nothing is copied from stock art), none of it can be tapped, and the pieces near
// the body fade away when you zoom in to study.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SETTINGS_KEY = 'tolnri.scene.v1';
const SYMBOL_FONT = "'Noto Sans Symbols'";
const SIGNS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
// Body landmarks (metres; the model stands on y = 0 facing +z, its right side is -x).
const BODY = { top: 1.705, heart: 1.29, navel: 1.02 };
const BREATH = 9; // seconds per breath
const MILKY_WAY = [0.55, 0.8, 0.12]; // the pole of the milky way's great circle

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const R = (a, b) => a + (b - a) * Math.random();
function seeded(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*snoise(p); p*=2.03; a*=0.5; } return s; }
`;

// Rings around the body grow faint where they pass in front of it, so they never hide the anatomy.
const FRONT_FADE = /* glsl */`
float frontFade(vec3 w, vec3 c){ vec3 toCam = normalize(cameraPosition - c); float f = dot(w - c, toCam); return mix(1.0, 0.16, smoothstep(-0.15, 0.3, f)); }
`;

export function initCosmos({ scene, camera, renderer, controls, hemi }) {
  // ---------- Settings ----------
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const settings = { sky: true, art: true, motion: !reduced };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch {}
  const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };

  const PLAIN_BG = new THREE.Color(0x0b0a1f);
  let time = 0, breath = 0, needsFrame = true;
  const U = { uTime: { value: 0 }, uBreath: { value: 0 }, uPR: { value: renderer.getPixelRatio() } }; // shared by every shader

  // ---------- Textures drawn in code ----------
  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const glowTex = canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
  const burstTex = canvasTexture(256, 256, (g) => {
    g.translate(128, 128);
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 128);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.1, 'rgba(255,250,230,0.8)'); r.addColorStop(0.35, 'rgba(255,230,180,0.15)'); r.addColorStop(1, 'rgba(255,220,160,0)');
    g.fillStyle = r; g.fillRect(-128, -128, 256, 256);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) {
      const long = i % 3 === 0;
      g.save(); g.rotate((i / 12) * Math.PI * 2);
      const lg = g.createLinearGradient(0, 0, long ? 126 : 80, 0);
      lg.addColorStop(0, 'rgba(255,245,220,0.9)'); lg.addColorStop(1, 'rgba(255,245,220,0)');
      g.fillStyle = lg; g.beginPath(); g.moveTo(0, -(long ? 3 : 2)); g.lineTo(long ? 126 : 80, 0); g.lineTo(0, long ? 3 : 2); g.fill();
      g.restore();
    }
  });
  const glowSprite = (color, scale, opacity = 1, tex = glowTex) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(scale);
    s.userData.baseOpacity = opacity;
    return s;
  };

  // Materials.
  // Ethereal glass: bright at the edges, faint in the middle, with light slowly rising through it.
  function etherMat(color, opacity = 1, { sway = 0, additive = true, base = 0.16 } = {}) {
    return new THREE.ShaderMaterial({
      uniforms: { ...U, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uFade: { value: 1 }, uSway: { value: sway }, uBase: { value: base } },
      vertexShader: /* glsl */`
        uniform float uTime, uSway;
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          float h = max(0.0, w.y - 0.45);
          w.x += sin(uTime * 0.7 + w.y * 2.3) * 0.012 * h * uSway;
          w.z += cos(uTime * 0.5 + w.y * 1.7) * 0.008 * h * uSway;
          vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity, uFade, uTime, uBreath, uBase;
        varying vec3 vN; varying vec3 vV; varying vec3 vW;
        void main(){
          float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
          float rise = 0.5 + 0.5 * sin(vW.y * 7.0 - uTime * 1.1);
          vec3 c = uColor * (0.22 + uBase + 1.3 * f) * (0.8 + 0.3 * rise) * (0.85 + 0.3 * uBreath);
          float a = (uBase + (1.0 - uBase) * f) * uOpacity * uFade;
          gl_FragColor = vec4(c * a, a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }
  // A small sky of gradients for metal to reflect, so gold looks like gold.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`varying vec3 vP; void main(){ vec3 d = normalize(vP);
      vec3 c = mix(vec3(0.06,0.05,0.16), vec3(1.0,0.86,0.58), smoothstep(-0.25, 0.85, d.y));
      c += vec3(0.45,0.25,0.75) * smoothstep(0.2, 1.0, d.x) * 0.7 + vec3(0.1,0.55,0.45) * smoothstep(0.3, 1.0, -d.x) * 0.5;
      gl_FragColor = vec4(c, 1.0); }`,
  })));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.03).texture;
  pmrem.dispose();
  const gold = () => new THREE.MeshStandardMaterial({ color: 0xe0ac55, metalness: 1, roughness: 0.27, envMap: env, envMapIntensity: 1.25, emissive: 0x2a1800, transparent: true });
  const metal = (color, emissive = 0x000000, rough = 0.3) => new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: rough, envMap: env, envMapIntensity: 1.1, emissive, transparent: true });

  // ---------- Sky ----------
  const sky = new THREE.Group();
  scene.add(sky);
  const skyU = { ...U, uFlash: { value: 0 }, uFlashDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() }, uAurora: { value: 0 }, uBand: { value: new THREE.Vector3(...MILKY_WAY).normalize() } };
  // The night sky is slow, so its costly noise is drawn into a cube map, one face at a time, a few times a second.
  // The dome you see only looks that up and adds the quick parts: breathing, lightning and aurora surges.
  const skyRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: false });
  const skyCam = new THREE.CubeCamera(0.1, 10, skyRT);
  const skyBake = new THREE.Scene();
  skyBake.add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uBand;
      varying vec3 vDir;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(vec3(0.02,0.016,0.06), vec3(0.075,0.05,0.17), smoothstep(-0.7, 0.3, h));
        col = mix(col, vec3(0.02,0.015,0.065), smoothstep(0.3, 1.0, h));
        float t = uTime * 0.004;
        // Aurora ribbons (emerald into teal and violet): a bright wavy lower edge with rays rising from it.
        float n1 = fbm(d * 1.4 + vec3(0.0, t * 3.0, t));
        float edge = 0.2 + 0.13 * n1;
        float above = h - edge;
        float rays = 0.55 + 0.45 * snoise(vec3(d.x * 11.0, d.z * 11.0, t * 9.0));
        float ribbon = smoothstep(-0.015, 0.02, above) * (exp(-above * 9.0) * 0.9 + exp(-above * 2.5) * 0.25) * rays;
        float patches = smoothstep(-0.25, 0.45, fbm(d * 2.1 + vec3(t * 5.0, 0.0, -t * 2.0)));
        vec3 aurora = mix(vec3(0.08,0.85,0.5), vec3(0.15,0.55,0.95), smoothstep(0.0, 0.35, above));
        aurora = mix(aurora, vec3(0.55,0.25,0.9), smoothstep(0.2, 0.6, above));
        float aur = ribbon * patches;
        col += aurora * aur * 0.39;
        // Violet and rose nebula.
        float n2 = fbm(d * 2.0 + vec3(t * 2.0, -t, 5.0));
        float neb = smoothstep(-0.05, 0.75, n2);
        float wisps = smoothstep(0.1, 0.9, fbm(d * 5.0 + vec3(-t, t * 3.0, 1.0)) + n2 * 0.5);
        col += mix(vec3(0.3,0.1,0.55), vec3(0.7,0.2,0.45), smoothstep(0.3, 0.95, n2)) * neb * 0.16;
        col += vec3(0.25,0.35,0.7) * wisps * neb * 0.07;
        // The milky way: a soft glowing river with dark dust lanes.
        float off = dot(d, uBand);
        float river = exp(-off * off * 60.0) * (0.6 + 0.4 * fbm(d * 4.0 + 2.0));
        float lanes = smoothstep(0.1, 0.6, fbm(d * 9.0 + 7.0)) * exp(-off * off * 400.0);
        col += vec3(0.42, 0.4, 0.62) * river * 0.16 * (1.0 - 0.7 * lanes);
        gl_FragColor = vec4(col, clamp(aur, 0.0, 1.0)); // alpha: how much aurora is here
      }`,
  })));
  skyCam.update(renderer, skyBake);
  let bakeFace = 0, bakeClock = 0;
  function bakeSkyFace() {
    const rt = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
    renderer.setRenderTarget(skyRT, bakeFace);
    renderer.render(skyBake, skyCam.children[bakeFace]);
    renderer.setRenderTarget(rt, face, mip);
    bakeFace = (bakeFace + 1) % 6;
  }
  skyU.uSky = { value: skyRT.texture };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(45, 64, 32), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform samplerCube uSky; uniform float uBreath, uFlash, uAurora; uniform vec3 uFlashDir;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec4 s = textureCube(uSky, d);
        vec3 col = s.rgb * (0.9 + 0.2 * uBreath);
        col += mix(vec3(0.08,0.85,0.5), vec3(0.3,0.45,0.95), smoothstep(0.25, 0.6, d.y)) * s.a * 0.9 * uAurora;
        // Lightning lights up the clouds.
        float f = max(dot(d, uFlashDir), 0.0), lum = dot(s.rgb, vec3(0.3, 0.5, 0.2));
        col += vec3(0.55,0.62,0.95) * uFlash * (0.06 + 0.7 * pow(f, 6.0)) * (0.6 + 4.0 * lum);
        col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  dome.renderOrder = -100;
  sky.add(dome);

  // Stars: thousands of points, each twinkling at its own speed; a few flash now and then.
  function starField(count, radius, rnd) {
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count), seed = new Float32Array(count * 3);
    const band = new THREE.Vector3(...MILKY_WAY).normalize();
    const u = new THREE.Vector3(1, 0, 0).cross(band).normalize(), w = band.clone().cross(u);
    const palette = [[1, 1, 1], [0.78, 0.87, 1], [1, 0.86, 0.62], [1, 0.74, 0.84], [0.7, 1, 0.9]];
    const weights = [0.55, 0.2, 0.14, 0.06, 0.05];
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      if (rnd() < 0.42) { // the milky way
        const a = rnd() * Math.PI * 2, off = (rnd() + rnd() + rnd() - 1.5) * 0.16;
        v.copy(u).multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a)).addScaledVector(band, off).normalize();
      } else {
        v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); if (v.lengthSq() > 1 || v.lengthSq() < 1e-4) { i--; continue; } v.normalize();
      }
      v.multiplyScalar(radius).toArray(pos, i * 3);
      let pick = rnd(), k = 0; while (pick > weights[k]) { pick -= weights[k]; k++; }
      col.set(palette[Math.min(k, 4)], i * 3);
      size[i] = 0.8 + Math.pow(rnd(), 6) * 6.5;
      seed.set([0.4 + rnd() * 3.2, rnd() * 6.283, rnd() < 0.14 ? 1 : 0], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    return new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`
        uniform float uTime, uPR; attribute float aSize; attribute vec3 aColor; attribute vec3 aSeed;
        varying vec3 vColor; varying float vBright; varying float vSize;
        void main(){
          float tw = 0.5 + 0.5 * sin(uTime * aSeed.x + aSeed.y);
          float sp = pow(max(0.0, sin(uTime * aSeed.x * 0.21 + aSeed.y * 1.7)), 80.0) * aSeed.z;
          vBright = (0.35 + 0.75 * tw) * (0.45 + 0.55 * fract(aSeed.y * 7.31)) * (0.6 + 0.25 * aSize) + sp * 3.0; vColor = aColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vSize = (aSize * (0.8 + 0.5 * tw + sp * 2.2) + 2.0) * uPR;
          gl_PointSize = vSize;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vBright; varying float vSize;
        void main(){
          vec2 p = (gl_PointCoord - 0.5) * vSize; float d = length(p), r = d / (0.5 * vSize); // d in pixels
          float a = exp(-d * d * 0.9) + exp(-r * r * 4.0) * 0.25 + (exp(-abs(p.x) * 2.5) + exp(-abs(p.y) * 2.5)) * max(0.0, 1.0 - r) * 0.18 * step(5.0, vSize);
          a *= vBright;
          gl_FragColor = vec4(vColor * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  }
  const stars = starField(60000, 40, seeded(11));
  stars.renderOrder = -90;
  sky.add(stars);

  // Motes of light at many depths, so moving the camera feels like moving through space.
  const motes = (() => {
    const rnd = seeded(23), n = 900;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const r = 1.8 + Math.pow(rnd(), 0.7) * 13, a = rnd() * Math.PI * 2, y = (rnd() * 2 - 1) * 0.85;
      const s = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * s * r, 0.9 + y * r * 0.7, Math.sin(a) * s * r], i * 3);
      seed.set([rnd() * 6.283, 0.6 + rnd() * 1.6], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
    return new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: /* glsl */`
        uniform float uTime, uPR; attribute vec2 aSeed; varying float vB;
        void main(){
          vec3 p = position + vec3(sin(uTime * 0.05 + aSeed.x), sin(uTime * 0.04 + aSeed.x * 2.0), cos(uTime * 0.045 + aSeed.x)) * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vB = 0.45 + 0.4 * sin(uTime * aSeed.y + aSeed.x);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSeed.y * 9.0 * uPR / -mv.z, 1.0, 6.0 * uPR);
        }`,
      fragmentShader: /* glsl */`
        varying float vB;
        void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-r * r * 5.0) * vB * 0.7; gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
  })();
  motes.renderOrder = -80;
  scene.add(motes);

  // ---------- Shooting stars, comets, lightning and novas ----------
  const transients = new THREE.Group();
  scene.add(transients);
  const live = []; // active transient effects, each with update(dt) -> false when finished
  const active = () => settings.sky && settings.motion;

  const streakMat = (head, tail, fall = 2.2) => new THREE.ShaderMaterial({
    uniforms: { uHead: { value: new THREE.Color(head) }, uTail: { value: new THREE.Color(tail) }, uAlpha: { value: 0 }, uPow: { value: fall } },
    vertexShader: 'attribute vec2 aUV; varying vec2 vUV; void main(){ vUV = aUV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uHead, uTail; uniform float uAlpha, uPow; varying vec2 vUV;
      void main(){ float a = pow(vUV.x, uPow) * (1.0 - vUV.y * vUV.y) * uAlpha; gl_FragColor = vec4(mix(uTail, uHead, vUV.x) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  function streakMesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('aUV', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]), 2));
    g.setIndex([0, 2, 1, 1, 2, 3]);
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    return m;
  }
  const side = new THREE.Vector3(), toCam = new THREE.Vector3();
  function placeStreak(mesh, tail, head, width) {
    const dir = head.clone().sub(tail);
    toCam.copy(camera.position).sub(head);
    side.crossVectors(dir, toCam).normalize().multiplyScalar(width);
    const a = mesh.geometry.attributes.position;
    a.setXYZ(0, tail.x - side.x * 0.3, tail.y - side.y * 0.3, tail.z - side.z * 0.3);
    a.setXYZ(1, tail.x + side.x * 0.3, tail.y + side.y * 0.3, tail.z + side.z * 0.3);
    a.setXYZ(2, head.x - side.x, head.y - side.y, head.z - side.z);
    a.setXYZ(3, head.x + side.x, head.y + side.y, head.z + side.z);
    a.needsUpdate = true;
  }
  // A point in the sky that is currently on screen.
  function skyPoint(nx, ny, dist) {
    return new THREE.Vector3(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(dist).add(camera.position);
  }

  function shootingStar({ from, angle, len = R(0.35, 0.8), dur = R(0.55, 1.2), dist = 24, width = R(0.05, 0.09), head = 0xffffff, tail = 0x8fb4ff } = {}) {
    from ||= [R(-0.85, 0.85), R(0.05, 0.9)];
    angle ??= R(-2.6, -0.55); // heading down the screen, left or right
    const S = skyPoint(from[0], from[1], dist), E = skyPoint(from[0] + Math.cos(angle) * len, from[1] + Math.sin(angle) * len, dist);
    const dir = E.clone().sub(S), total = dir.length(); dir.normalize();
    const mesh = streakMesh(streakMat(head, tail)), spark = glowSprite(head, width * 9, 0);
    transients.add(mesh, spark);
    let age = 0;
    live.push((dt) => {
      age += dt;
      const k = age / dur;
      if (k >= 1) { transients.remove(mesh, spark); mesh.geometry.dispose(); mesh.material.dispose(); spark.material.dispose(); return false; }
      const headP = S.clone().addScaledVector(dir, total * k);
      const tailP = S.clone().addScaledVector(dir, Math.max(0, total * k - total * 0.45));
      placeStreak(mesh, tailP, headP, width);
      const env = Math.pow(Math.sin(Math.PI * k), 0.6);
      mesh.material.uniforms.uAlpha.value = env;
      spark.position.copy(headP); spark.material.opacity = env * 0.9;
      return true;
    });
  }

  function meteorShower() {
    const radiant = [R(-0.6, 0.6), R(0.75, 1.1)];
    const n = 7 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (!active()) return;
        const a = R(-2.4, -0.75);
        shootingStar({ from: [radiant[0] + Math.cos(a) * R(0.05, 0.3), radiant[1] + Math.sin(a) * R(0.05, 0.3)], angle: a, len: R(0.3, 0.6), dur: R(0.5, 0.9) });
      }, i * R(120, 420));
    }
  }

  function comet() {
    const leftToRight = Math.random() < 0.5;
    const y0 = R(0.45, 0.85), dur = R(9, 13), dist = 30;
    const S = skyPoint(leftToRight ? -1.25 : 1.25, y0, dist), E = skyPoint(leftToRight ? 1.25 : -1.25, y0 + R(-0.25, 0.1), dist);
    const mesh = streakMesh(streakMat(0xdff6ff, 0x7a5cff, 1.3)), mesh2 = streakMesh(streakMat(0xffffff, 0x5ad8c0, 1.6));
    const head = glowSprite(0xe8fbff, 1.3, 0), core = glowSprite(0xffffff, 0.45, 0);
    transients.add(mesh, mesh2, head, core);
    let age = 0;
    live.push((dt) => {
      age += dt;
      const k = age / dur;
      if (k >= 1) { transients.remove(mesh, mesh2, head, core); [mesh, mesh2].forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); head.material.dispose(); core.material.dispose(); return false; }
      const p = S.clone().lerp(E, k), dir = E.clone().sub(S).normalize();
      // The tail streams away from the direction of travel and a little upward, like solar wind.
      const back = dir.clone().negate().add(new THREE.Vector3(0, 0.25, 0)).normalize();
      placeStreak(mesh, p.clone().addScaledVector(back, 7), p, 0.42);
      placeStreak(mesh2, p.clone().addScaledVector(back.clone().add(new THREE.Vector3(0, -0.12, 0)).normalize(), 4.5), p, 0.2);
      const env = smooth(0, 0.12, k) * (1 - smooth(0.85, 1, k));
      mesh.material.uniforms.uAlpha.value = env * 0.7; mesh2.material.uniforms.uAlpha.value = env * 0.6;
      head.position.copy(p); core.position.copy(p);
      head.material.opacity = env * 0.7; core.material.opacity = env;
      return true;
    });
  }

  function nova() {
    const p = skyPoint(R(-0.8, 0.8), R(0.1, 0.85), 32);
    const s = glowSprite(new THREE.Color().setHSL(R(0.08, 0.16), 0.6, 0.85), 0.1, 0, burstTex);
    s.position.copy(p);
    transients.add(s);
    let age = 0; const dur = 5.5;
    live.push((dt) => {
      age += dt;
      const k = age / dur;
      if (k >= 1) { transients.remove(s); s.material.dispose(); return false; }
      const grow = smooth(0, 0.25, k);
      s.scale.setScalar(0.2 + grow * 3.2 + k * 0.6);
      s.material.rotation = k * 0.6;
      s.material.opacity = grow * (1 - smooth(0.35, 1, k));
      return true;
    });
  }

  // Lightning: a forked bolt far away, flickering, lighting the clouds and the room.
  const boltMat = () => new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: 'attribute float aW; varying float vW; void main(){ vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uAlpha; varying float vW; void main(){ float a = (1.0 - vW * vW) * uAlpha; gl_FragColor = vec4(vec3(0.82, 0.86, 1.0) * a + vec3(0.3) * a * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  function boltGeometry(top, bottom, dist) {
    const paths = [];
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    function build(a, b, rough, width, depth) {
      let pts = [a, b];
      for (let lvl = 0; lvl < 6; lvl++) {
        const next = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const m = pts[i - 1].clone().lerp(pts[i], 0.5).addScaledVector(right, R(-1, 1) * rough * pts[i - 1].distanceTo(pts[i]));
          next.push(m, pts[i]);
        }
        pts = next;
      }
      paths.push({ pts, width });
      if (depth < 2) for (let i = 8; i < pts.length - 8; i += 8 + Math.floor(Math.random() * 10)) {
        if (Math.random() < 0.45) {
          const len = pts[i].distanceTo(b) * R(0.25, 0.5);
          const end = pts[i].clone().add(b.clone().sub(a).normalize().multiplyScalar(len)).addScaledVector(right, R(-1, 1) * len * 0.8);
          build(pts[i], end, rough * 1.1, width * 0.55, depth + 1);
        }
      }
    }
    build(top, bottom, 0.28, dist * 0.004, 0);
    const pos = [], w = [], idx = [];
    for (const { pts, width } of paths) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        toCam.copy(camera.position).sub(a);
        side.crossVectors(b.clone().sub(a), toCam).normalize().multiplyScalar(width * (1 - (i / pts.length) * 0.5));
        const base = pos.length / 3;
        for (const p of [a, b]) for (const s of [-1, 1]) { pos.push(p.x + side.x * s, p.y + side.y * s, p.z + side.z * s); w.push(s); }
        idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 1));
    g.setIndex(idx);
    return g;
  }
  function storm() {
    const strikes = 1 + Math.floor(Math.random() * 3);
    const nx = R(-0.75, 0.75);
    for (let s = 0; s < strikes; s++) {
      setTimeout(() => {
        if (!active()) return;
        const x = nx + R(-0.25, 0.25), dist = 28;
        const top = skyPoint(x, 1.1, dist), bottom = skyPoint(x + R(-0.25, 0.25), R(-0.35, 0.15), dist);
        const mesh = new THREE.Mesh(boltGeometry(top, bottom, dist), boltMat());
        mesh.frustumCulled = false;
        const glow = glowSprite(0xb8c8ff, dist * 0.35, 0);
        glow.position.copy(top.clone().lerp(bottom, 0.35));
        transients.add(mesh, glow);
        skyU.uFlashDir.value.copy(glow.position).sub(camera.position).normalize();
        let age = 0; const dur = 0.9;
        // Strike, a dark beat, a restrike, then a fade.
        const env = (t) => (t < 0.07 ? 1 : t < 0.13 ? 0.15 : t < 0.3 ? 0.9 : Math.max(0, 0.9 * (1 - (t - 0.3) / (dur - 0.3))));
        live.push((dt) => {
          age += dt;
          if (age >= dur) { transients.remove(mesh, glow); mesh.geometry.dispose(); mesh.material.dispose(); glow.material.dispose(); skyU.uFlash.value = 0; return false; }
          const e = env(age) * (0.85 + Math.random() * 0.15);
          mesh.material.uniforms.uAlpha.value = e;
          glow.material.opacity = e * 0.35;
          skyU.uFlash.value = e;
          return true;
        });
      }, s * R(500, 1400));
    }
  }

  function auroraSurge() {
    let age = 0; const dur = 11;
    live.push((dt) => {
      age += dt;
      skyU.uAurora.value = smooth(0, 3, age) * (1 - smooth(6, dur, age));
      return age < dur;
    });
  }

  const EVENTS = [[meteorShower, 0.25], [storm, 0.25], [comet, 0.2], [nova, 0.15], [auroraSurge, 0.15]];
  let nextStar = 3, nextEvent = 9;
  function scheduleEvents() {
    if (time > nextStar) { shootingStar(); nextStar = time + R(2.5, 9); }
    if (time > nextEvent) {
      let r = Math.random(), i = 0;
      while (r > EVENTS[i][1]) { r -= EVENTS[i][1]; i++; }
      EVENTS[Math.min(i, EVENTS.length - 1)][0]();
      nextEvent = time + R(16, 42);
    }
  }

  // ---------- The poster, in 3D ----------
  const art = new THREE.Group(); // everything from the poster and the covers
  scene.add(art);
  const nearFade = []; // { obj, mats, near, far, min }: fades from min (at near) to full (at far), by camera distance
  const fadeMats = (obj) => { const ms = []; obj.traverse((o) => { if (o.material) ms.push(...[].concat(o.material)); }); return ms; };
  const addNear = (obj, near, far, min = 0) => { art.add(obj); nearFade.push({ obj, mats: fadeMats(obj), near, far, min }); return obj; };

  // Zodiac wheel behind the body, like the astrological chart on both covers.
  const wheelTex = canvasTexture(2048, 2048, () => {});
  function drawWheel() {
    const c = wheelTex.image, g = c.getContext('2d'), S = 1024;
    g.clearRect(0, 0, 2048, 2048);
    g.translate(S, S);
    const line = (w, a) => { g.lineWidth = w; g.strokeStyle = `rgba(246,227,180,${a})`; };
    const circle = (r) => { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
    line(5, 0.9); circle(1000); line(3, 0.75); circle(930); circle(760); line(4, 0.85); circle(740); line(2, 0.5); circle(560); circle(200);
    for (let d = 0; d < 360; d++) {
      const a = (d * Math.PI) / 180, l = d % 30 === 0 ? 1000 : d % 5 === 0 ? 975 : 955;
      line(d % 30 === 0 ? 4 : 2, d % 30 === 0 ? 0.8 : 0.5);
      const r0 = d % 30 === 0 ? 560 : 930;
      g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.stroke();
    }
    g.fillStyle = 'rgba(250,232,190,0.95)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `500 112px ${SYMBOL_FONT}, sans-serif`;
    // Signs run counter-clockwise from Aries, as on a chart.
    SIGNS.forEach((s, i) => {
      const a = -((i * 30 + 15) * Math.PI) / 180;
      g.save(); g.translate(Math.cos(a) * 845, Math.sin(a) * 845); g.rotate(a + Math.PI / 2); g.fillText(s + '︎', 0, 6); g.restore();
    });
    // Each classical planet sits in the sign it rules, Moon in Cancer through Saturn in Capricorn.
    const PLANETS = [['☽', 3], ['☉', 4], ['☿', 5], ['♀', 6], ['♂', 7], ['♃', 8], ['♄', 9]];
    g.font = `500 84px ${SYMBOL_FONT}, sans-serif`;
    for (const [p, sign] of PLANETS) {
      const a = -((sign * 30 + 15) * Math.PI) / 180, x = Math.cos(a) * 650, y = Math.sin(a) * 650;
      if (p === '☉') { line(7, 0.95); g.beginPath(); g.arc(x, y, 30, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
      else g.fillText(p + '︎', x, y + 4);
    }
    line(2, 0.35);
    for (let k = 0; k < 12; k++) { const a = (k * Math.PI) / 6; g.beginPath(); g.moveTo(Math.cos(a) * 200, Math.sin(a) * 200); g.lineTo(Math.cos(a) * 560, Math.sin(a) * 560); g.stroke(); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    wheelTex.needsUpdate = true;
  }
  const wheel = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.7), new THREE.MeshBasicMaterial({ map: wheelTex, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  wheel.material.userData.baseOpacity = 0.3;
  wheel.position.set(0, 1.0, -0.62);
  addNear(wheel, 1.0, 2.2);

  // Orbiting zodiac ring, like the bands around the figure on the covers.
  const drawBand = (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `500 92px ${SYMBOL_FONT}, sans-serif`;
    SIGNS.forEach((s, i) => g.fillText(s + '︎', ((i + 0.5) / 12) * w, h / 2 + 4));
    g.fillRect(0, 6, w, 4); g.fillRect(0, h - 10, w, 4);
  };
  const bandTex = canvasTexture(4096, 128, drawBand);
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { ...U, uMap: { value: bandTex }, uFade: { value: 1 }, uCenter: { value: new THREE.Vector3(0, 0.98, 0) } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      ${FRONT_FADE}
      uniform sampler2D uMap; uniform float uTime, uBreath, uFade; uniform vec3 uCenter; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float ink = 1.0 - texture2D(uMap, vUv).r;
        float ndv = abs(dot(normalize(vN), normalize(vV)));
        float hue = 0.5 + 0.5 * sin(vUv.x * 12.566 + uTime * 0.25);
        vec3 base = mix(vec3(0.22, 0.9, 0.7), vec3(0.95, 0.5, 0.85), hue);
        vec3 c = base * (0.35 + 0.65 * ndv) + vec3(1.0) * pow(1.0 - ndv, 3.0) * 0.6 + vec3(0.9, 0.95, 1.0) * pow(ndv, 24.0) * 0.5;
        c = mix(c, vec3(0.05, 0.04, 0.12), ink * 0.85);
        float a = (0.62 + 0.15 * uBreath) * uFade * frontFade(vW, uCenter);
        gl_FragColor = vec4(c, a);
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const orbit = new THREE.Group();
  orbit.position.set(0, 0.98, 0);
  orbit.rotation.set(0.42, 0, -0.2);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.075, 192, 1, true), ringMat);
  orbit.add(ring);
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.006, 8, 160), new THREE.ShaderMaterial({
    uniforms: { ...U, uFade: { value: 1 }, uCenter: { value: new THREE.Vector3(0, 1.0, 0) } },
    vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`${FRONT_FADE}
      uniform float uFade, uBreath; uniform vec3 uCenter; varying vec3 vW; varying vec3 vN;
      void main(){ float ndv = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
        vec3 c = mix(vec3(0.75, 0.5, 0.18), vec3(1.0, 0.9, 0.62), pow(ndv, 3.0)) * (0.9 + 0.2 * uBreath);
        gl_FragColor = vec4(c, 0.85 * uFade * frontFade(vW, uCenter)); }`,
    transparent: true, depthWrite: false,
  }));
  const hoopPivot = new THREE.Group();
  hoopPivot.rotation.set(1.25, 0.3, 0);
  hoopPivot.add(hoop);
  const orbitAll = new THREE.Group();
  orbitAll.add(orbit, hoopPivot);
  hoopPivot.position.set(0, 1.0, 0);
  addNear(orbitAll, 1.6, 2.7);

  // Ionic pillars: rose on the body's right (Jachin) and blue on the left (Boaz), as on the poster,
  // with the violet middle pillar standing behind the spine.
  function pillar(color, height, radius, opacity) {
    const parts = [];
    const plinth = new THREE.BoxGeometry(radius * 3, 0.06, radius * 3); plinth.translate(0, 0.03, 0); parts.push(plinth);
    for (const [y, r, t] of [[0.078, 1.3, 0.2], [0.11, 1.12, 0.14]]) { const tor = new THREE.TorusGeometry(radius * r, radius * t, 8, 48); tor.rotateX(Math.PI / 2); tor.translate(0, y, 0); parts.push(tor); }
    const capH = 0.15, shaftH = height - 0.13 - capH;
    const shaft = new THREE.CylinderGeometry(radius * 0.9, radius, shaftH, 72, 16, true);
    const p = shaft.attributes.position;
    for (let i = 0; i < p.count; i++) { // 24 flutes
      const x = p.getX(i), z = p.getZ(i), th = Math.atan2(z, x), k = 1 - 0.07 * Math.pow(0.5 + 0.5 * Math.cos(th * 24), 2);
      p.setXYZ(i, x * k, p.getY(i), z * k);
    }
    shaft.computeVertexNormals(); shaft.translate(0, 0.13 + shaftH / 2, 0); parts.push(shaft);
    const top = 0.13 + shaftH;
    const ech = new THREE.TorusGeometry(radius * 0.98, radius * 0.17, 8, 48); ech.rotateX(Math.PI / 2); ech.translate(0, top + 0.02, 0); parts.push(ech);
    const abacus = new THREE.BoxGeometry(radius * 3.1, 0.035, radius * 2.3); abacus.translate(0, top + capH - 0.018, 0); parts.push(abacus);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // the four volutes
      const pts = [];
      for (let a = 0; a <= Math.PI * 3.5; a += 0.12) { const r = radius * 0.62 * (1 - a / (Math.PI * 4.2)); pts.push(new THREE.Vector3(sx * (radius * 1.15 + Math.sin(a) * r * sx), top + 0.075 + Math.cos(a) * r - radius * 0.1, sz * radius * 0.95)); }
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, radius * 0.08, 6, false));
    }
    for (const sx of [-1, 1]) { const bol = new THREE.CylinderGeometry(radius * 0.4, radius * 0.4, radius * 1.9, 16, 1); bol.rotateX(Math.PI / 2); bol.translate(sx * radius * 1.15, top + 0.075, 0); parts.push(bol); }
    const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }));
    return new THREE.Mesh(merged, etherMat(color, opacity));
  }
  const PILLAR_H = 2.0; // low enough that the sun and moon above them fit in the opening view
  const jachin = pillar(0xff9fae, PILLAR_H, 0.075, 0.9); jachin.position.set(-1.18, 0, -0.28);
  const boaz = pillar(0x9fb0ff, PILLAR_H, 0.075, 0.9); boaz.position.set(1.18, 0, -0.28);
  const middle = pillar(0xa056ee, 2.45, 0.08, 0.32); middle.position.set(0, 0, -1.05);
  const pillars = new THREE.Group(); pillars.add(jachin, boaz, middle);
  addNear(pillars, 0.9, 2.0);

  // The emerald cross behind the body.
  const cross = (() => {
    const w = 0.22, H = 2.3, yc = 1.62, L = 0.78;
    const a = w / 2, lo = yc - w / 2, hi = yc + w / 2;
    const shape = new THREE.Shape([[-a, 0], [a, 0], [a, lo], [L, lo], [L, hi], [a, hi], [a, H], [-a, H], [-a, hi], [-L, hi], [-L, lo], [-a, lo]].map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2 });
    const m = new THREE.Mesh(g, etherMat(0x3fe08f, 0.9, { base: 0.32 }));
    m.position.set(0, 0.04, -0.36);
    return m;
  })();
  addNear(cross, 0.9, 2.0);

  // The Tree of Life: golden line art like the poster's tree, standing behind the body with its round crown of
  // branches framing the head and its roots spreading under the feet. It sways, and its leaves twinkle in 3D.
  const tree = (() => {
    const rnd = seeded(5);
    const segs = [], tips = [];
    const CROWN = [0, 1.12], ROOTS = [0, 0.02];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    // Each branch bends toward the rim of a circle, so the crown and the roots come out round.
    function grow(p, ang, len, w, depth, center, reach) {
      const end = [p[0] + Math.sin(ang) * len, p[1] + Math.cos(ang) * len];
      segs.push([p, end, w]);
      if (depth === 0) { tips.push(end); return; }
      const outAng = Math.atan2(end[0] - center[0], end[1] - center[1]);
      const n = depth > 3 ? 2 : rnd() < 0.5 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        let a = ang + (i - (n - 1) / 2) * (0.42 + 0.3 * rnd());
        a += Math.atan2(Math.sin(outAng - a), Math.cos(outAng - a)) * 0.3;
        const left = reach - dist(end, center);
        grow(end, a, Math.max(0.035, Math.min(len * (0.72 + 0.12 * rnd()), left * 0.55)), w * 0.68, depth - 1, center, reach);
      }
    }
    segs.push([[0, -0.02], [0, 0.92], 0.07]); // trunk
    for (let i = 0; i < 7; i++) grow([0, 0.92], -1.75 + (i / 6) * 3.5 + (rnd() - 0.5) * 0.12, 0.28, 0.045, 5, CROWN, 1.02);
    for (let i = 0; i < 6; i++) grow([0, 0.0], Math.PI - 1.25 + (i / 5) * 2.5 + (rnd() - 0.5) * 0.2, 0.16, 0.04, 3, ROOTS, 0.56);
    // Tree space (metres, feet at y = 0) onto the canvas.
    const X0 = -1.25, Y0 = -0.62, SPAN_W = 2.5, SPAN_H = 3.3, CW = 1024, CH = Math.round((1024 * SPAN_H) / SPAN_W);
    const px = ([x, y]) => [((x - X0) / SPAN_W) * CW, CH - ((y - Y0) / SPAN_H) * CH];
    const tex = canvasTexture(CW, CH, (g) => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [blur, alpha, widen] of [[14, 0.22, 1.7], [0, 1, 1]]) {
        g.shadowBlur = blur; g.shadowColor = 'rgba(255,190,90,0.9)';
        for (const [a, b, w] of segs) {
          const [ax, ay] = px(a), [bx, by] = px(b);
          const grad = g.createLinearGradient(ax, ay, bx, by);
          grad.addColorStop(0, `rgba(250,206,120,${alpha})`); grad.addColorStop(1, `rgba(255,238,190,${alpha})`);
          g.strokeStyle = grad; g.lineWidth = Math.max(1.2, (w / SPAN_W) * CW * widen);
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        }
      }
      g.shadowBlur = 0;
      // A thin ring around it, as in the institute's seal.
      const [cx, cy] = px([0, 0.98]);
      g.strokeStyle = 'rgba(246,227,180,0.5)'; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, (1.62 / SPAN_W) * CW, 0, Math.PI * 2); g.stroke();
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(SPAN_W, SPAN_H), new THREE.ShaderMaterial({
      uniforms: { ...U, uMap: { value: tex }, uFade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform float uTime, uBreath, uFade; varying vec2 vUv;
        void main(){
          float h = smoothstep(0.42, 1.0, vUv.y);
          vec2 uv = vUv + vec2(sin(uTime * 0.6 + vUv.y * 5.0) * 0.006 * h, 0.0);
          vec4 t = texture2D(uMap, uv);
          float a = t.a * (0.4 + 0.15 * uBreath) * uFade;
          gl_FragColor = vec4(t.rgb * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    plane.position.set(X0 + SPAN_W / 2, Y0 + SPAN_H / 2, 0);
    const group = new THREE.Group();
    group.add(plane);
    // Leaves: a few twinkling lights around each tip, some just in front of the drawing and some behind it.
    const leaves = [], seeds = [];
    for (const [x, y] of tips) for (let k = 0; k < 3; k++) { leaves.push(x + (rnd() - 0.5) * 0.08, y + (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.25); seeds.push(rnd()); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(leaves, 3));
    lg.setAttribute('aS', new THREE.Float32BufferAttribute(seeds, 1));
    group.add(new THREE.Points(lg, new THREE.ShaderMaterial({
      uniforms: { ...U, uFade: { value: 1 } },
      vertexShader: /* glsl */`
        uniform float uTime, uPR; attribute float aS; varying float vB; varying vec3 vC;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          w.x += sin(uTime * 0.6 + position.y * 1.5) * 0.015 * smoothstep(1.0, 2.6, position.y);
          vec4 mv = viewMatrix * w;
          vB = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.7 + aS * 2.2) + aS * 40.0), 2.0);
          vC = mix(vec3(1.0, 0.8, 0.42), vec3(0.5, 1.0, 0.68), step(0.62, aS));
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(0.05 * uPR * 320.0 / -mv.z, 2.0, 12.0 * uPR);
        }`,
      fragmentShader: /* glsl */`
        uniform float uFade; varying float vB; varying vec3 vC;
        void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-r * r * 6.0) * vB * 0.85 * uFade; gl_FragColor = vec4(vC * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    group.position.set(0, 0, -1.0);
    return group;
  })();
  addNear(tree, 0.9, 2.0);

  // The crown of rays above the head (Keter).
  const crown = (() => {
    const group = new THREE.Group();
    const g = gold();
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.077, 0.032, 48, 1, true), g); group.add(band);
    for (const [y, r] of [[-0.016, 0.077], [0.016, 0.072]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0035, 8, 48), g); t.rotation.x = Math.PI / 2; t.position.y = y; group.add(t); }
    const jewelColors = [0xe0245e, 0x2f6bff, 0x22d38a];
    // Twelve points, one for each cranial nerve, each with a jewel below and a pearl on top.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const c = jewelColors[i % 3];
      const j = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 12, 8), metal(c, c, 0.15)); j.position.set(Math.sin(a) * 0.077, 0, Math.cos(a) * 0.077); group.add(j);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.0095, 0.056, 4), g);
      spike.position.set(Math.sin(a) * 0.071, 0.016 + 0.028, Math.cos(a) * 0.071); spike.rotation.set(Math.cos(a) * 0.18, 0, -Math.sin(a) * 0.18); group.add(spike);
      const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.005, 10, 8), metal(0xffffff, 0x887766, 0.2)); pearl.position.set(Math.sin(a) * 0.076, 0.075, Math.cos(a) * 0.076); group.add(pearl);
    }
    // Twelve rays for the twelve cranial nerves, fanning upward six on each side as on the poster's crown;
    // they always face you, like a halo.
    const rays = new THREE.Group();
    const rayGeo = (len, w) => { const s = new THREE.Shape(); s.moveTo(-w, 0); s.lineTo(0, len); s.lineTo(w, 0); s.lineTo(-w, 0); return new THREE.ShapeGeometry(s); };
    const rayMats = [];
    for (let i = 0; i < 12; i++) {
      const ang = -1.3 + (i / 11) * 2.6, len = 0.4 - 0.08 * Math.abs(ang) / 1.3;
      const m = new THREE.ShaderMaterial({
        uniforms: { ...U, uLen: { value: len }, uPhase: { value: i * 1.7 }, uFade: { value: 1 } },
        vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */`uniform float uLen, uPhase, uTime, uBreath, uFade; varying float vY;
          void main(){ float k = vY / uLen; float a = pow(1.0 - k, 0.7) * (0.8 + 0.2 * sin(uTime * 1.3 + uPhase)) * (0.85 + 0.3 * uBreath) * uFade; gl_FragColor = vec4(mix(vec3(1.0, 0.72, 0.3), vec3(1.0, 0.9, 0.6), k) * a, a); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      rayMats.push(m);
      const ray = new THREE.Mesh(rayGeo(len, 0.013), m);
      ray.position.y = 0.0; ray.rotation.z = -ang;
      rays.add(ray);
    }
    const halo = glowSprite(0xffd27a, 0.42, 0.55);
    rays.add(halo);
    const wrap = new THREE.Group();
    wrap.add(group, rays);
    wrap.position.set(0, BODY.top + 0.15, 0);
    wrap.userData = { spin: group, rays };
    return wrap;
  })();
  addNear(crown, 0.6, 1.4);

  // The star of David as a star tetrahedron (merkaba): two tetrahedra turning opposite ways around the body.
  const merkaba = (() => {
    const group = new THREE.Group();
    const tet = (sign, color) => {
      const s = 1.08, v = [new THREE.Vector3(0, s, 0)];
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; v.push(new THREE.Vector3(Math.cos(a) * s * 0.943, -s / 3, Math.sin(a) * s * 0.943)); }
      if (sign < 0) v.forEach((p) => { p.y = -p.y; });
      const edges = [[0, 1], [0, 2], [0, 3], [1, 2], [2, 3], [3, 1]];
      const geos = edges.map(([a, b]) => {
        const len = v[a].distanceTo(v[b]);
        const g = new THREE.CylinderGeometry(0.0032, 0.0032, len, 5, 1, true);
        g.translate(0, len / 2, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v[b].clone().sub(v[a]).normalize()));
        g.translate(v[a].x, v[a].y, v[a].z);
        g.deleteAttribute('uv');
        return g;
      });
      const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
      mesh.material.userData.baseOpacity = 0.3;
      const tg = new THREE.Group(); tg.add(mesh);
      for (const p of v) { const s2 = glowSprite(color, 0.06, 0.65); s2.position.copy(p); tg.add(s2); }
      return tg;
    };
    const a = tet(1, 0xffd68a), b = tet(-1, 0xc9b8ff);
    group.add(a, b);
    group.position.set(0, 0.95, 0);
    group.userData = { a, b };
    return group;
  })();
  addNear(merkaba, 1.5, 2.6);

  // A small sun above Jachin (the rose pillar, on the body's right) and a small moon above Boaz (the blue pillar,
  // on the left). The moon is lit from the sun's side, so it shows as a half moon.
  const sun = (() => {
    const group = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 48, 32), new THREE.ShaderMaterial({
      uniforms: { ...U, uFade: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec3 vW; void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */`uniform float uTime, uBreath, uFade; varying vec3 vN; varying vec3 vP; varying vec3 vW;
        void main(){
          float ndv = abs(dot(normalize(vN), normalize(cameraPosition - vW)));
          vec3 q = normalize(vP) * 9.0;
          float gran = sin(q.x * 3.1 + uTime * 0.9) * sin(q.y * 2.7 - uTime * 0.7) * sin(q.z * 3.3 + uTime * 0.5);
          vec3 c = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.86, 0.45), pow(ndv, 0.6)) * (0.9 + 0.12 * gran + 0.15 * uBreath);
          gl_FragColor = vec4(c * uFade, uFade); }`,
      transparent: true,
    }));
    group.add(ball);
    const rays = glowSprite(0xffd890, 0.62, 0.75, burstTex); group.add(rays);
    const glow = glowSprite(0xffb347, 0.42, 0.85); group.add(glow);
    group.position.set(-1.18, PILLAR_H + 0.15, -0.28);
    group.userData = { rays, glow };
    return group;
  })();
  addNear(sun, 0.9, 2.0);
  const moon = (() => {
    const tex = canvasTexture(512, 256, (g) => {
      const rnd = seeded(11);
      g.fillStyle = '#d9dbe6'; g.fillRect(0, 0, 512, 256);
      for (let i = 0; i < 9; i++) { // maria
        g.fillStyle = `rgba(110,116,140,${0.25 + rnd() * 0.25})`;
        g.beginPath(); g.ellipse(rnd() * 512, 60 + rnd() * 140, 30 + rnd() * 50, 20 + rnd() * 35, rnd() * 3, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 70; i++) { // craters
        const x = rnd() * 512, y = 20 + rnd() * 216, r = 2 + rnd() * 9;
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
        g.fillStyle = 'rgba(90,95,120,0.25)'; g.beginPath(); g.arc(x + r * 0.2, y + r * 0.2, r * 0.8, 0, Math.PI * 2); g.fill();
      }
    });
    const group = new THREE.Group();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.068, 48, 32), new THREE.ShaderMaterial({
      uniforms: { ...U, uMap: { value: tex }, uFade: { value: 1 }, uSun: { value: new THREE.Vector3() } },
      vertexShader: 'varying vec3 vN; varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */`uniform sampler2D uMap; uniform vec3 uSun; uniform float uBreath, uFade; varying vec3 vN; varying vec3 vW; varying vec2 vUv;
        void main(){
          vec3 n = normalize(vN);
          float lit = smoothstep(-0.08, 0.25, dot(n, normalize(uSun - vW)));
          float rim = pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.0);
          vec3 tex = texture2D(uMap, vUv).rgb;
          vec3 c = tex * (0.07 + 1.05 * lit) * vec3(0.95, 0.97, 1.06) + vec3(0.55, 0.62, 0.95) * rim * 0.35 * (0.8 + 0.4 * uBreath);
          gl_FragColor = vec4(c * uFade, uFade); }`,
      transparent: true,
    }));
    group.add(ball);
    const glow = glowSprite(0xb9c8ff, 0.36, 0.45); group.add(glow);
    group.position.set(1.18, PILLAR_H + 0.15, -0.28);
    group.userData = { ball, glow };
    ball.material.uniforms.uSun.value.copy(sun.position);
    return group;
  })();
  addNear(moon, 0.9, 2.0);

  // The Aquarian jar, tipped, pouring a stream of light away from the body.
  const jar = (() => {
    const group = new THREE.Group();
    const prof = [[0.0, 0], [0.035, 0], [0.04, 0.006], [0.032, 0.018], [0.05, 0.04], [0.078, 0.09], [0.088, 0.14], [0.08, 0.19], [0.058, 0.235], [0.036, 0.262], [0.03, 0.285], [0.034, 0.305], [0.048, 0.318], [0.044, 0.324], [0.028, 0.312]];
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40), metal(0x1f7d86, 0x06222a, 0.22));
    body.material.side = THREE.DoubleSide;
    group.add(body);
    const g = gold();
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([[0.078, 0.17], [0.125, 0.215], [0.11, 0.28], [0.04, 0.292]].map(([x, y]) => new THREE.Vector3(s * x, y, 0)));
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0075, 8, false), g));
    }
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.004, 8, 32), g); lip.rotation.x = Math.PI / 2; lip.position.y = 0.32; group.add(lip);
    const foot = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.004, 8, 32), g); foot.rotation.x = Math.PI / 2; foot.position.y = 0.004; group.add(foot);
    const pivot = new THREE.Group(); pivot.add(group);
    group.position.y = -0.16;
    pivot.rotation.z = 1.95; // mouth toward the body's right (-x), tipped down
    const holder = new THREE.Group(); holder.add(pivot);
    holder.position.set(-0.9, 0.7, 0.05);
    holder.scale.setScalar(0.8);
    // Water: each particle follows its own arc from the mouth, reusing itself when it fades.
    const N = 520, seed = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) seed.set([Math.random(), Math.random() * 2 - 1, Math.random() * 2 - 1], i * 3);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    wg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    const water = new THREE.Points(wg, new THREE.ShaderMaterial({
      uniforms: { ...U, uMouth: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3() }, uFade: { value: 1 } },
      vertexShader: /* glsl */`
        uniform float uTime, uPR; uniform vec3 uMouth, uDir; attribute vec3 aSeed; varying float vA; varying float vK;
        void main(){
          float k = fract(uTime / 1.3 + aSeed.x); float t = k * 1.3;
          vec3 p = uMouth + uDir * (0.3 * t) + vec3(aSeed.y, 0.0, aSeed.z) * 0.05 * t + vec3(0.0, -0.55 * t * t, 0.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vA = smoothstep(0.0, 0.05, k) * (1.0 - smoothstep(0.55, 1.0, k)); vK = k;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((0.05 - 0.02 * k) * uPR * 320.0 / -mv.z, 1.0, 12.0 * uPR);
        }`,
      fragmentShader: /* glsl */`
        uniform float uFade; varying float vA; varying float vK;
        void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-r * r * 5.0) * vA * 0.6 * uFade; gl_FragColor = vec4(mix(vec3(0.75, 1.0, 1.0), vec3(0.25, 0.75, 1.0), vK) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    water.frustumCulled = false;
    const wrap = new THREE.Group();
    wrap.add(holder, water);
    wrap.userData = { holder, pivot, water, mouth: new THREE.Vector3(0, 0.32, 0), group };
    return wrap;
  })();
  addNear(jar, 0.9, 1.8);

  // The bag of magic dust, glittering dust spiralling up out of it.
  const bag = (() => {
    const prof = [[0.0, 0], [0.04, 0.003], [0.068, 0.02], [0.08, 0.05], [0.078, 0.085], [0.062, 0.115], [0.035, 0.14], [0.022, 0.152], [0.024, 0.16], [0.04, 0.172], [0.052, 0.19], [0.046, 0.195], [0.03, 0.182]];
    const geo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { // cloth folds
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(z, x), k = 1 + 0.05 * Math.sin(th * 7 + y * 30) * smooth(0.0, 0.08, y);
      p.setXYZ(i, x * k, y, z * k);
    }
    geo.computeVertexNormals();
    const sack = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5a2fa0, roughness: 0.75, metalness: 0.1, envMap: env, envMapIntensity: 0.6, emissive: 0x1a0838, side: THREE.DoubleSide, transparent: true }));
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.0045, 8, 32), gold()); rope.rotation.x = Math.PI / 2; rope.position.y = 0.156;
    const group = new THREE.Group(); group.add(sack, rope);
    group.position.set(0.82, 0.5, 0.2);
    const N = 380, seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) seed.set([Math.random(), Math.random(), Math.random() * 6.283, Math.random()], i * 4);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      uniforms: { ...U, uTop: { value: new THREE.Vector3() }, uFade: { value: 1 } },
      vertexShader: /* glsl */`
        uniform float uTime, uPR; uniform vec3 uTop; attribute vec4 aSeed; varying float vA; varying vec3 vC;
        void main(){
          float k = fract(uTime / 3.2 + aSeed.x);
          float a = aSeed.z + k * 4.0, r = 0.015 + k * 0.14 * (0.4 + aSeed.y);
          vec3 p = uTop + vec3(cos(a) * r, k * 0.6, sin(a) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float tw = 0.5 + 0.5 * sin(uTime * (6.0 + aSeed.w * 8.0) + aSeed.w * 50.0);
          vA = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.6, 1.0, k)) * (0.4 + 0.6 * tw);
          vC = aSeed.w < 0.45 ? vec3(1.0, 0.85, 0.45) : aSeed.w < 0.8 ? vec3(0.8, 0.6, 1.0) : vec3(1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(0.04 * uPR * 320.0 / -mv.z, 1.5, 10.0 * uPR);
        }`,
      fragmentShader: /* glsl */`
        uniform float uFade; varying float vA; varying vec3 vC;
        void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0;
          float a = (exp(-r * r * 7.0) + (exp(-abs(q.x) * 40.0) + exp(-abs(q.y) * 40.0)) * max(0.0, 1.0 - r) * 0.5) * vA * uFade; gl_FragColor = vec4(vC * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    dust.frustumCulled = false;
    const wrap = new THREE.Group(); wrap.add(group, dust);
    wrap.userData = { group, dust };
    return wrap;
  })();
  addNear(bag, 0.9, 1.8);

  // ---------- The emerald tablet and the caduceus ----------
  // The emerald tablet's engraving (drawn again once its fonts have loaded).
  function drawTablet(g, W, Hh) {
    g.clearRect(0, 0, W, Hh);
    g.strokeStyle = 'rgba(210,255,190,0.85)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(22, Hh - 18); g.lineTo(22, 256); g.arc(256, 256, 234, Math.PI, 0); g.lineTo(490, Hh - 18); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(225,255,200,0.95)'; g.textAlign = 'center';
    g.font = `500 64px ${SYMBOL_FONT}, serif`; g.fillText('☿︎', 256, 118);
    g.font = '700 34px "Cormorant Garamond", Georgia, serif'; g.fillText('EMERALD TABLET I', 256, 192);
    g.font = 'italic 500 24px "Cormorant Garamond", Georgia, serif'; g.fillText('The History of Thoth, the Atlantean', 256, 228);
    const words = 'I, Thoth, the Atlantean, master of mysteries, keeper of records, mighty king, magician, living from generation to generation, being about to pass into the Halls of Amenti, set down for the guidance of those that are to come after, these records of the mighty wisdom of Great Atlantis.'.split(' ');
    g.font = '600 25px "Cormorant Garamond", Georgia, serif';
    let line = '', y = 282;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width > 400) { g.fillText(line, 256, y); y += 33; line = word; } else line = test;
    }
    g.fillText(line, 256, y);
  }
  // The emerald tablet, engraved with the opening of Brian's "Emerald Tablet I" document.
  const tablet = (() => {
    const w = 0.36, h = 0.5;
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 3, curveSegments: 24 });
    geo.translate(0, -h / 2, -0.0175);
    const gem = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { ...U, uFade: { value: 1 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */`uniform float uBreath, uFade; varying vec3 vN; varying vec3 vV;
        void main(){ float ndv = abs(dot(normalize(vN), normalize(vV))); float f = pow(1.0 - ndv, 2.0);
          vec3 c = mix(vec3(0.02, 0.24, 0.13), vec3(0.3, 1.0, 0.62), f) + vec3(0.1, 0.5, 0.3) * (0.3 + 0.3 * uBreath) + vec3(0.85, 1.0, 0.9) * pow(ndv, 40.0) * 0.4;
          gl_FragColor = vec4(c, 0.86 * uFade); }`,
      transparent: true,
    }));
    const text = canvasTexture(512, 712, drawTablet);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, w * 0.9 * (712 / 512)), new THREE.MeshBasicMaterial({ map: text, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    face.position.set(0, -0.005, 0.0275);
    const group = new THREE.Group(); group.add(gem, face);
    const glow = glowSprite(0x4dffb0, 0.9, 0.25); group.add(glow);
    group.userData.text = text;
    return group;
  })();
  // It floats at the upper corner of the downward (blue) tetrahedron on the body's left, above the bag of magic dust,
  // at about the bag's size: Thoth is a lunar god, so it sits on the moon's side.
  tablet.scale.setScalar(0.55);
  tablet.position.set(0.86, 1.36, 0.12);
  addNear(tablet, 0.9, 1.8);

  // The caduceus: a golden staff (sushumna), two serpents (ida in silver-blue, pingala in red-gold) and wings.
  const caduceus = (() => {
    const group = new THREE.Group();
    const g = gold();
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.95, 12), g); staff.position.y = 0.025; group.add(staff);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.034, 20, 14), g); orb.position.y = 0.53; group.add(orb);
    const orbGlow = glowSprite(0xffe2a0, 0.22, 0.6); orbGlow.position.y = 0.53; group.add(orbGlow);
    const feather = (len) => {
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.bezierCurveTo(len * 0.3, 0.022, len * 0.75, 0.02, len, 0.004); s.bezierCurveTo(len * 0.75, -0.012, len * 0.3, -0.016, 0, 0);
      return new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false });
    };
    for (const sx of [-1, 1]) {
      const wing = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const f = new THREE.Mesh(feather(0.26 - i * 0.028), g);
        f.rotation.z = 0.25 + i * 0.2;
        f.position.y = -i * 0.006;
        wing.add(f);
      }
      wing.position.set(sx * 0.012, 0.45, 0);
      wing.scale.x = sx;
      group.add(wing);
    }
    for (const [phase, color, emissive] of [[0, 0xe9864a, 0x3a1000], [Math.PI, 0xaabfff, 0x0a1440]]) {
      const pts = [];
      for (let s = 0; s <= 1.0001; s += 0.01) {
        const a = Math.PI * 2 * 2.25 * s + phase, A = 0.075 * (1 - 0.35 * s);
        pts.push(new THREE.Vector3(A * Math.sin(a), -0.4 + 0.78 * s, 0.02 * Math.cos(a)));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const m = metal(color, emissive, 0.25);
      group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.0095, 8, false), m));
      const end = pts[pts.length - 1];
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), m);
      head.scale.set(1.5, 0.85, 1); head.position.copy(end).add(new THREE.Vector3(-Math.sign(end.x) * 0.012, 0.01, 0));
      group.add(head);
    }
    return group;
  })();
  // The caduceus floats at the other upper corner, on the body's right above the Aquarian jar, at about the jar's size.
  caduceus.scale.setScalar(0.3);
  caduceus.position.set(-0.88, 1.36, 0.06);
  addNear(caduceus, 0.9, 1.8);

  // ---------- Fonts, then the drawings that need them ----------
  // The faces are declared in style.css; ask for them, then redraw the wheel, the ring band and the tablet.
  const redrawText = () => {
    drawWheel();
    drawBand(bandTex.image.getContext('2d'), bandTex.image.width, bandTex.image.height); bandTex.needsUpdate = true;
    const t = tablet.userData.text; drawTablet(t.image.getContext('2d'), t.image.width, t.image.height); t.needsUpdate = true;
    needsFrame = true;
  };
  Promise.all([
    document.fonts.load(`500 92px ${SYMBOL_FONT}`, '♈☽♄☿'),
    document.fonts.load('600 25px "Cormorant Garamond"'),
    document.fonts.load('700 34px "Cormorant Garamond"'),
    document.fonts.load('italic 500 24px "Cormorant Garamond"'),
  ]).catch((err) => console.warn('Font not loaded', err)).then(redrawText);

  // ---------- Each frame ----------
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  function apply() {
    const showSky = settings.sky, showArt = settings.art;
    // Anything still crossing the sky finishes at once when the sky or the motion is turned off.
    if (!active()) { for (const f of live.splice(0)) f(1e3); }
    sky.visible = motes.visible = transients.visible = showSky;
    art.visible = showArt;
    scene.background = showSky ? null : PLAIN_BG;
    if (!showSky) { skyU.uFlash.value = 0; if (hemi) hemi.intensity = hemiBase; }
    needsFrame = true;
  }
  const hemiBase = hemi ? hemi.intensity : 1;
  apply();

  function update(dt) {
    const moving = settings.motion && (settings.sky || settings.art);
    if (moving) time += dt;
    breath = 0.5 - 0.5 * Math.cos((time / BREATH) * Math.PI * 2);
    U.uTime.value = time; U.uBreath.value = breath; U.uPR.value = renderer.getPixelRatio();

    sky.position.copy(camera.position);
    if (moving && settings.sky && (bakeClock += dt) > 0.08) { bakeClock = 0; bakeSkyFace(); }
    if (moving && settings.sky) scheduleEvents();
    for (let i = live.length - 1; i >= 0; i--) if (!live[i](moving ? dt : 0)) live.splice(i, 1);
    if (hemi) hemi.intensity = hemiBase * (1 + skyU.uFlash.value * 0.6);

    if (settings.art) {
      const dist = camera.position.distanceTo(controls.target);
      for (const { obj, mats, near, far, min } of nearFade) {
        const f = min + (1 - min) * smooth(near, far, dist);
        obj.visible = f > 0.01;
        for (const m of mats) {
          if (m.uniforms?.uFade) m.uniforms.uFade.value = f;
          else if (m.uniforms?.uOpacity) m.uniforms.uOpacity.value = f;
          else { m.userData.baseOpacity ??= m.opacity; m.opacity = m.userData.baseOpacity * f; }
        }
      }
      wheel.rotation.z = time * 0.008;
      ring.rotation.y = time * 0.06;
      hoop.rotation.z = -time * 0.09;
      crown.userData.spin.rotation.y = time * 0.22;
      crown.position.y = BODY.top + 0.15 + Math.sin(time * 0.8) * 0.004;
      crown.userData.rays.quaternion.copy(camera.quaternion);
      merkaba.userData.a.rotation.y = time * 0.05;
      merkaba.userData.b.rotation.y = -time * 0.05;
      merkaba.scale.setScalar(1 + 0.015 * breath);
      sun.userData.rays.material.rotation = time * 0.05;
      sun.userData.rays.scale.setScalar(0.62 + 0.08 * breath);
      sun.userData.glow.scale.setScalar(0.42 + 0.06 * breath);
      moon.userData.ball.rotation.y = time * 0.03;
      // Jar: bob, then aim the stream from its mouth.
      const { holder, pivot, water, mouth, group: jarBody } = jar.userData;
      holder.position.y = 0.7 + Math.sin(time * 0.7) * 0.02;
      pivot.rotation.z = 1.95 + Math.sin(time * 0.5) * 0.05;
      jar.updateMatrixWorld(true);
      water.material.uniforms.uMouth.value.copy(mouth).applyMatrix4(jarBody.matrixWorld);
      water.material.uniforms.uDir.value.set(0, 1, 0).applyQuaternion(jarBody.getWorldQuaternion(tmpQ)).normalize();
      const { group: bagBody, dust } = bag.userData;
      bagBody.position.y = 0.5 + Math.sin(time * 0.6 + 1) * 0.015;
      bagBody.rotation.y = Math.sin(time * 0.3) * 0.4;
      dust.material.uniforms.uTop.value.copy(bagBody.position).add(tmpV.set(0, 0.19, 0));
      tablet.position.y = 1.36 + Math.sin(time * 0.65 + 2) * 0.015;
      tablet.rotation.set(Math.sin(time * 0.4) * 0.05, Math.sin(time * 0.3) * 0.45, Math.sin(time * 0.35) * 0.04);
      caduceus.position.y = 1.36 + Math.sin(time * 0.7 + 3) * 0.015;
      caduceus.rotation.set(Math.sin(time * 0.5) * 0.05, time * 0.25, 0);
    }
    const ret = moving || needsFrame;
    needsFrame = false;
    return ret;
  }

  return {
    update,
    get time() { return time; },
    get breath() { return breath; },
    settings,
    set(key, value) { settings[key] = value; saveSettings(); apply(); },
    // Starts a sky event now: one by name, or a random one.
    event(name) {
      if (!active()) return;
      const fn = { shootingStar, meteorShower, storm, comet, nova, auroraSurge }[name] || EVENTS[Math.floor(Math.random() * EVENTS.length)][0];
      fn();
      needsFrame = true;
    },
  };
}
