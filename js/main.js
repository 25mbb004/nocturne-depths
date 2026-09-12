// ————————————————————————————————————————————————————————————
// NOCTURNE: DEPTHS — twenty levels down, a boss at every one.
// Three.js + custom GLSL + WebAudio. Everything procedural.
// Designed & built by Claude (Fable 5).
// ————————————————————————————————————————————————————————————

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ————— constants —————
const WORLD = { minX: -46, maxX: 46, minY: -10.5, maxY: 15, reefY: -13 };
const CLUSTER_XS = [-38, -25.5, -13, 0, 13, 25.5, 38];
const SPORE_POOL = 44;
const SPORE_ACTIVE = 30;
const LEVELS = 20;
const SAVE_KEY = 'nocturne-depths-level';

const COL = {
  cyan: new THREE.Color('#6ff7e3'),
  violet: new THREE.Color('#9d7bff'),
  amber: new THREE.Color('#ffd98c'),
  iceBlue: new THREE.Color('#8cf5ff'),
  red: new THREE.Color('#ff2d55'),
};

const LEVEL_NAMES = [
  'The Shallows Remember', 'First Dark', 'The Drifting Field', 'Where Rays Forget',
  'The Sunless Garden', 'Choir of Cold', 'The Long Fall', 'Teeth of the Current',
  'A Country of Night', 'The Violet Vault', "Old Light's Grave", 'The Breathless Mile',
  'Court of the Maw', 'Salt and Silence', 'The Hollow Bloom', 'Beneath All Names',
  'The Last Lantern', 'Black Meridian', 'The Heart of Sinking', 'Abyssal Crown',
];
const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
const ARCHS = ['dredger', 'reliquary', 'undertow', 'choir', 'lure'];
const BOSS_NAMES = {
  dredger: ['The Silt Dredger', 'The Barbed Dredger', 'The Trench Butcher', 'The Unlit Colossus'],
  reliquary: ['The Closed Reliquary', 'The Rusted Vault', 'The Choir Casket', 'The Sealed Heart'],
  undertow: ['The Pale Ribbon', 'The Undertow', 'The Coil of Night', 'The Meridian Eel'],
  choir: ['The Grasping Choir', 'The Six-Handed Psalm', 'The Thousand Fingers', 'The Empress of Arms'],
  lure: ['The False Lantern', 'The Beckoner', "The Liar's Light", 'The Last Lure'],
};
const BOSS_HINTS = {
  dredger: 'WEAK POINT · THE GLOWING MAW',
  reliquary: 'ATTACK THROUGH THE GAP IN ITS SHELL',
  undertow: 'STRIKE THE HEAD · MIND THE TAIL',
  choir: 'IT IS OPEN AFTER EVERY SLAM',
  lure: 'IT IS ONLY OPEN WHEN SPENT',
};

// palette anchors (linear space) — shallows → violet vault → crimson abyss
const PALETTES = [
  { deep: [0.0008, 0.003, 0.009], mid: [0.003, 0.014, 0.032], top: [0.012, 0.05, 0.085], ray: [0.45, 0.85, 0.9], fog: 0x04101c },
  { deep: [0.002, 0.0012, 0.009], mid: [0.010, 0.006, 0.030], top: [0.028, 0.016, 0.07], ray: [0.68, 0.5, 0.95], fog: 0x0a0518 },
  { deep: [0.0028, 0.0008, 0.003], mid: [0.013, 0.003, 0.010], top: [0.032, 0.008, 0.02], ray: [0.9, 0.38, 0.48], fog: 0x100410 },
];
function lerpTriplet(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
function paletteFor(n) {
  const t = (n - 1) / (LEVELS - 1);
  const [pa, pb, k] = t < 0.5 ? [PALETTES[0], PALETTES[1], t * 2] : [PALETTES[1], PALETTES[2], (t - 0.5) * 2];
  return {
    deep: lerpTriplet(pa.deep, pb.deep, k),
    mid: lerpTriplet(pa.mid, pb.mid, k),
    top: lerpTriplet(pa.top, pb.top, k),
    ray: lerpTriplet(pa.ray, pb.ray, k),
    fog: new THREE.Color(pa.fog).lerp(new THREE.Color(pb.fog), k),
  };
}

function levelConfig(n) {
  const tier = Math.floor((n - 1) / 5);
  const arch = ARCHS[(n - 1) % 5];
  return {
    n, tier, arch,
    name: LEVEL_NAMES[n - 1],
    bossName: BOSS_NAMES[arch][tier],
    summonCost: 6 + Math.floor(n / 4),        // lumens that wake the boss
    bossHP: Math.round((52 + n * 11) * (arch === 'lure' && tier >= 1 ? 1.25 : 1)),
    speed: 1 + n * 0.045,
    urchins: Math.min(1 + Math.floor(n / 3), 7),
    palette: paletteFor(n),
  };
}

// ————— renderer / scene —————
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('scene'),
    antialias: true,
    powerPreference: 'high-performance',
  });
} catch (e) {
  document.getElementById('webglFail').classList.remove('hidden');
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04101c, 0.02);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 2, 18);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.55, 0.38
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const clock = new THREE.Clock();
let elapsed = 0;

// ————— shared helpers —————
function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [off, col] of stops) g.addColorStop(off, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const softGlowTex = radialTexture([
  [0, 'rgba(255,255,255,1)'],
  [0.25, 'rgba(255,255,255,0.55)'],
  [1, 'rgba(255,255,255,0)'],
]);
const ringTex = radialTexture([
  [0, 'rgba(255,255,255,0)'],
  [0.72, 'rgba(255,255,255,0)'],
  [0.82, 'rgba(255,255,255,0.9)'],
  [0.9, 'rgba(255,255,255,0.25)'],
  [1, 'rgba(255,255,255,0)'],
]);
const rand = (a, b) => a + Math.random() * (b - a);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

// expanding shockwave rings
const rings = [];
function spawnRing(pos, color = 0x9df5e8, maxScale = 22, dur = 1.3) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ringTex, color, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.position.copy(pos);
  sp.scale.setScalar(0.4);
  scene.add(sp);
  rings.push({ sp, t: 0, maxScale, dur });
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    const k = Math.min(r.t / r.dur, 1);
    const e = 1 - Math.pow(1 - k, 3);
    r.sp.scale.setScalar(0.4 + e * r.maxScale);
    r.sp.material.opacity = (1 - k) * 0.85;
    if (k >= 1) { scene.remove(r.sp); r.sp.material.dispose(); rings.splice(i, 1); }
  }
}

// ————— background dome (palette-driven) —————
const domeMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  uniforms: {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(...PALETTES[0].deep) },
    uMid: { value: new THREE.Color(...PALETTES[0].mid) },
    uTop: { value: new THREE.Color(...PALETTES[0].top) },
  },
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uDeep;
    uniform vec3 uMid;
    uniform vec3 uTop;
    varying vec3 vDir;
    void main() {
      float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
      vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.55, h));
      col = mix(col, uTop, smoothstep(0.55, 1.0, h));
      float shimmer = sin(vDir.x * 34.0 + uTime * 0.4) * sin(vDir.x * 21.0 - uTime * 0.27) * 0.5 + 0.5;
      col += uTop * 0.35 * shimmer * smoothstep(0.6, 1.0, h);
      col += uTop * 0.5 * pow(max(vDir.y, 0.0), 3.0);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const dome = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 24), domeMat);
scene.add(dome);

// ————— god rays (palette-driven color) —————
const rayGroup = new THREE.Group();
{
  const rayGeo = new THREE.PlaneGeometry(1, 1);
  rayGeo.translate(0, -0.5, 0);
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uSeed: { value: Math.random() * 10 },
        uIntensity: { value: rand(0.1, 0.2) },
        uColor: { value: new THREE.Color(...PALETTES[0].ray) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform float uSeed;
        uniform float uIntensity;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float band = pow(sin(vUv.x * 3.14159), 2.2);
          float fade = pow(vUv.y, 1.6);
          float breathe = 0.7 + 0.3 * sin(uTime * 0.35 + uSeed * 7.0);
          gl_FragColor = vec4(uColor, band * fade * uIntensity * breathe);
        }`,
    });
    const ray = new THREE.Mesh(rayGeo, mat);
    ray.position.set(rand(WORLD.minX, WORLD.maxX), 34, rand(-24, -14));
    ray.scale.set(rand(5, 15), rand(55, 85), 1);
    ray.rotation.z = rand(-0.14, 0.14);
    ray.userData = { baseRot: ray.rotation.z, sway: rand(0.15, 0.4), speed: rand(0.1, 0.25) };
    rayGroup.add(ray);
  }
}
scene.add(rayGroup);

// palette transition machinery
const paletteState = {
  cur: paletteFor(1),
  from: paletteFor(1),
  to: paletteFor(1),
  t: 1,
};
function setPaletteTarget(p) {
  paletteState.from = {
    deep: [...paletteState.cur.deep],
    mid: [...paletteState.cur.mid],
    top: [...paletteState.cur.top],
    ray: [...paletteState.cur.ray],
    fog: paletteState.cur.fog.clone(),
  };
  paletteState.to = p;
  paletteState.t = 0;
}
function updatePalette(dt) {
  const ps = paletteState;
  if (ps.t >= 1) return;
  ps.t = Math.min(1, ps.t + dt / 2.6);
  const k = ps.t * ps.t * (3 - 2 * ps.t);
  ps.cur = {
    deep: lerpTriplet(ps.from.deep, ps.to.deep, k),
    mid: lerpTriplet(ps.from.mid, ps.to.mid, k),
    top: lerpTriplet(ps.from.top, ps.to.top, k),
    ray: lerpTriplet(ps.from.ray, ps.to.ray, k),
    fog: ps.from.fog.clone().lerp(ps.to.fog, k),
  };
  domeMat.uniforms.uDeep.value.setRGB(...ps.cur.deep);
  domeMat.uniforms.uMid.value.setRGB(...ps.cur.mid);
  domeMat.uniforms.uTop.value.setRGB(...ps.cur.top);
  scene.fog.color.copy(ps.cur.fog);
  for (const child of rayGroup.children) child.material.uniforms.uColor.value.setRGB(...ps.cur.ray);
}

// ————— marine snow —————
{
  const N = 1200;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rand(-70, 70);
    pos[i * 3 + 1] = rand(-20, 30);
    pos[i * 3 + 2] = rand(-22, 14);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime;
      attribute float aSeed;
      varying float vA;
      void main() {
        vec3 p = position;
        float range = 50.0;
        float speed = 0.25 + aSeed * 0.5;
        p.y = 30.0 - mod(30.0 - p.y + uTime * speed, range);
        p.x += sin(uTime * 0.22 + aSeed * 40.0) * 0.9;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.7 + aSeed * 1.3) * (140.0 / -mv.z);
        vA = 0.05 + aSeed * 0.15;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vA;
        gl_FragColor = vec4(0.62, 0.85, 0.9, a);
      }`,
  });
  scene.add(new THREE.Points(geo, mat));
}

// ————— reef floor —————
{
  const geo = new THREE.PlaneGeometry(160, 34, 70, 12);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, Math.sin(x * 0.24) * 1.1 + Math.sin(x * 0.53 + 2.0) * 0.7 + Math.sin(z * 0.4) * 0.5);
  }
  geo.computeVertexNormals();
  const floor = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x050c16 }));
  floor.position.y = WORLD.reefY - 1.2;
  scene.add(floor);
}

// ————— coral clusters (scenery — bloom on victory) —————
const coralVert = `
  uniform float uTime;
  uniform float uAwake;
  attribute float aH;
  attribute float aRand;
  varying float vH;
  varying float vRand;
  void main() {
    vH = aH;
    vRand = aRand;
    vec3 p = position;
    float sway = sin(uTime * 1.1 + p.x * 0.7 + aRand * 6.28) * aH * (0.06 + 0.1 * uAwake);
    p.x += sway;
    p.z += sway * 0.6;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const coralFrag = `
  uniform float uTime;
  uniform float uAwake;
  uniform float uHueShift;
  varying float vH;
  varying float vRand;
  void main() {
    vec3 dormant = mix(vec3(0.003, 0.008, 0.016), vec3(0.01, 0.03, 0.05), vH);
    dormant += vec3(0.012, 0.055, 0.05) * pow(vH, 4.0) * (0.5 + 0.5 * sin(uTime * 1.3 + vRand * 7.0));
    vec3 base = mix(vec3(0.14, 0.85, 0.75), vec3(0.62, 0.38, 0.98), clamp(vH * 1.15 - uHueShift * 0.3, 0.0, 1.0));
    float pulse = 0.75 + 0.25 * sin(uTime * 1.8 + vRand * 9.0 + vH * 4.0);
    vec3 awake = base * (0.3 + 0.75 * vH) * pulse;
    awake += vec3(1.0) * pow(vH, 6.0) * 0.35 * pulse;
    vec3 col = mix(dormant, awake, uAwake);
    gl_FragColor = vec4(col, 1.0);
  }`;

class Cluster {
  constructor(x, index) {
    this.index = index;
    this.x = x;
    this.state = 'dormant';
    this.awake = 0;
    this.bloomStart = 0;
    this.center = new THREE.Vector3(x, WORLD.reefY + 1.6, 0);

    const parts = [];
    const branchCount = 34 + Math.floor(Math.random() * 12);
    for (let b = 0; b < branchCount; b++) {
      const h = rand(0.7, 3.8);
      const isFan = Math.random() < 0.12;
      let g;
      if (isFan) {
        g = new THREE.ConeGeometry(rand(0.3, 0.55), h, 8);
        g.scale(1.35, 1, 0.2);
      } else {
        g = new THREE.CylinderGeometry(rand(0.025, 0.07), rand(0.1, 0.2), h, 5, 3);
      }
      g.translate(0, h / 2, 0);
      const pAttr = g.attributes.position;
      const aH = new Float32Array(pAttr.count);
      const aR = new Float32Array(pAttr.count);
      const br = Math.random();
      for (let i = 0; i < pAttr.count; i++) {
        aH[i] = THREE.MathUtils.clamp(pAttr.getY(i) / h, 0, 1);
        aR[i] = br;
      }
      g.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
      g.setAttribute('aRand', new THREE.BufferAttribute(aR, 1));
      g.rotateX(rand(-0.22, 0.22));
      g.rotateZ(rand(-0.3, 0.3));
      const r = Math.pow(Math.random(), 0.7) * 3.9;
      const th = Math.random() * Math.PI * 2;
      g.translate(x + Math.cos(th) * r, WORLD.reefY + rand(-0.4, 0.3), Math.sin(th) * r * 0.75 - 0.9);
      g.deleteAttribute('normal');
      g.deleteAttribute('uv');
      parts.push(g);
    }
    const merged = BufferGeometryUtils.mergeGeometries(parts);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAwake: { value: 0 }, uHueShift: { value: Math.random() } },
      vertexShader: coralVert,
      fragmentShader: coralFrag,
    });
    this.mesh = new THREE.Mesh(merged, this.mat);
    scene.add(this.mesh);

    this.heart = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softGlowTex, color: 0x2a5f74, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.heart.position.copy(this.center);
    this.heart.scale.setScalar(5);
    scene.add(this.heart);
  }
  beginBloom(t) { if (this.state === 'dormant') { this.state = 'blooming'; this.bloomStart = t; } }
  reset() { this.state = 'dormant'; }
  update(t, dt) {
    this.mat.uniforms.uTime.value = t;
    if (this.state === 'blooming') {
      const k = THREE.MathUtils.clamp((t - this.bloomStart) / 2.6, 0, 1);
      this.awake = k * k * (3 - 2 * k);
      if (k >= 1) this.state = 'awake';
      if (Math.random() < 0.4) {
        spawnBurst(
          new THREE.Vector3(this.x + rand(-3.4, 3.4), WORLD.reefY + rand(0.5, 3), rand(-1.4, 1.4)),
          Math.random() < 0.5 ? COL.cyan : COL.violet, 2, 1.6, new THREE.Vector3(0, 2.4, 0)
        );
      }
    } else if (this.state === 'dormant' && this.awake > 0) {
      this.awake = Math.max(0, this.awake - dt * 0.5); // the reef falls asleep again, deeper down
    }
    this.mat.uniforms.uAwake.value = this.awake;
    if (this.state === 'dormant' && this.awake < 0.05) {
      this.heart.material.opacity = 0.55 + 0.25 * Math.sin(t * 1.4 + this.index * 2.2);
      this.heart.material.color.setHex(0x2a5f74);
      this.heart.scale.setScalar(6.5 + Math.sin(t * 1.4 + this.index * 2.2));
    } else {
      this.heart.material.opacity = 0.24 + 0.12 * this.awake + 0.06 * Math.sin(t * 2.2 + this.index);
      this.heart.material.color.lerpColors(new THREE.Color(0x2a5f74), new THREE.Color(0x3ef0d0), this.awake);
      this.heart.scale.setScalar(6.5 + this.awake * 1.5);
    }
  }
}
const clusters = CLUSTER_XS.map((x, i) => new Cluster(x, i));

// ————— player —————
const player = {
  pos: new THREE.Vector3(0, 3, 0),
  vel: new THREE.Vector3(),
  target: new THREE.Vector3(0, 3, 0),
  carried: 0,
  invuln: 0,
  dashT: 0,
  dashCd: 0,
  group: new THREE.Group(),
};
{
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xeafffa, transparent: true })
  );
  player.core = core;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softGlowTex, color: 0x7df0dd, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.scale.setScalar(2.6);
  player.halo = halo;
  player.group.add(core, halo);
  scene.add(player.group);
}

// tendrils
const TENDRIL_NODES = 22;
const tendrilMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  uniforms: {
    uColorA: { value: COL.cyan },
    uColorB: { value: COL.violet },
    uOpacity: { value: 0.85 },
  },
  vertexShader: `
    attribute float aT;
    varying float vT;
    void main() {
      vT = aT;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform float uOpacity;
    varying float vT;
    void main() {
      vec3 col = mix(uColorA, uColorB, pow(vT, 0.65)) * 1.35;
      float a = (1.0 - vT);
      a *= a;
      gl_FragColor = vec4(col, a * uOpacity);
    }`,
});
class Tendril {
  constructor(angle) {
    this.angle = angle;
    this.phase = Math.random() * Math.PI * 2;
    this.freq = rand(2.2, 3.4);
    this.width = 0;
    this.targetWidth = rand(0.09, 0.16);
    this.nodes = [];
    for (let i = 0; i < TENDRIL_NODES; i++) this.nodes.push(player.pos.clone());
    const N = TENDRIL_NODES;
    const positions = new Float32Array(N * 2 * 3);
    const aT = new Float32Array(N * 2);
    const indices = [];
    for (let i = 0; i < N; i++) {
      aT[i * 2] = aT[i * 2 + 1] = i / (N - 1);
      if (i < N - 1) {
        const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
        indices.push(a, b, c, b, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setIndex(indices);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, tendrilMat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(dt, t) {
    this.width += (this.targetWidth - this.width) * Math.min(1, dt * 2);
    const anchor = _v1.copy(player.pos);
    anchor.x += Math.cos(this.angle) * 0.3;
    anchor.y += Math.sin(this.angle) * 0.3;
    this.nodes[0].copy(anchor);
    const follow = Math.min(1, dt * 13);
    for (let i = 1; i < TENDRIL_NODES; i++) {
      const n = this.nodes[i];
      n.lerp(this.nodes[i - 1], follow);
      const w = i / TENDRIL_NODES;
      n.y += Math.sin(t * this.freq + this.phase + i * 0.5) * 0.1 * w * dt * 60 * 0.16;
      n.x += Math.cos(t * this.freq * 0.7 + this.phase + i * 0.4) * 0.05 * w * dt * 60 * 0.16;
    }
    const posAttr = this.geo.attributes.position;
    for (let i = 0; i < TENDRIL_NODES; i++) {
      const prev = this.nodes[Math.max(0, i - 1)];
      const next = this.nodes[Math.min(TENDRIL_NODES - 1, i + 1)];
      _v2.subVectors(next, prev);
      _v3.set(-_v2.y, _v2.x, 0);
      const len = _v3.length();
      if (len > 0.0001) _v3.divideScalar(len);
      else _v3.set(0, 1, 0);
      const w = this.width * (1 - i / (TENDRIL_NODES - 1));
      const n = this.nodes[i];
      posAttr.setXYZ(i * 2, n.x + _v3.x * w, n.y + _v3.y * w, n.z);
      posAttr.setXYZ(i * 2 + 1, n.x - _v3.x * w, n.y - _v3.y * w, n.z);
    }
    posAttr.needsUpdate = true;
  }
}
const tendrils = [];
function setTendrilCount(n) {
  while (tendrils.length < n) {
    tendrils.push(new Tendril((tendrils.length / Math.max(n, 1)) * Math.PI * 2 + rand(0, 0.8)));
  }
}
setTendrilCount(4);

// ————— spores —————
const spores = [];
const sporeMesh = new THREE.InstancedMesh(
  new THREE.IcosahedronGeometry(0.13, 1),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
  SPORE_POOL
);
sporeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(sporeMesh);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
for (let i = 0; i < SPORE_POOL; i++) {
  const isCyan = Math.random() < 0.3;
  spores.push({
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    seed: Math.random() * 100,
    alive: false,
    respawnAt: 0,
    color: isCyan ? COL.iceBlue.clone() : COL.amber.clone(),
  });
  sporeMesh.setColorAt(i, spores[i].color);
}
sporeMesh.instanceColor.needsUpdate = true;
function spawnSpore(s, x, y) {
  s.alive = true;
  s.pos.set(
    x !== undefined ? x : rand(WORLD.minX + 2, WORLD.maxX - 2),
    y !== undefined ? y : rand(WORLD.reefY + 2.5, WORLD.maxY - 2),
    rand(-1.5, 1.5)
  );
  s.vel.set(0, 0, 0);
}
for (let i = 0; i < SPORE_ACTIVE; i++) spawnSpore(spores[i]);

// ————— urchin geometry (shared with bosses) —————
let urchinGeo, urchinMat;
{
  const body = new THREE.IcosahedronGeometry(0.5, 1);
  const dirGeo = new THREE.IcosahedronGeometry(1, 0);
  const dirPos = dirGeo.attributes.position;
  const spikeDirs = [];
  const seen = new Set();
  for (let i = 0; i < dirPos.count; i++) {
    const v = new THREE.Vector3(dirPos.getX(i), dirPos.getY(i), dirPos.getZ(i)).normalize();
    const key = v.toArray().map((n) => n.toFixed(2)).join(',');
    if (!seen.has(key)) { seen.add(key); spikeDirs.push(v); }
  }
  const parts = [body];
  const up = new THREE.Vector3(0, 1, 0);
  for (const dir of spikeDirs) {
    const cone = new THREE.ConeGeometry(0.09, 0.62, 5);
    cone.translate(0, 0.31, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
    cone.applyQuaternion(q);
    cone.translate(dir.x * 0.42, dir.y * 0.42, dir.z * 0.42);
    parts.push(cone);
  }
  for (const g of parts) g.deleteAttribute('uv');
  urchinGeo = BufferGeometryUtils.mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  urchinGeo.computeVertexNormals();
  urchinMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.4);
        float pulse = 0.7 + 0.3 * sin(uTime * 2.6);
        vec3 col = mix(vec3(0.006, 0.003, 0.012), vec3(0.85, 0.12, 0.28) * pulse, rim);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ————— urchins (dash-destructible) —————
const URCHIN_POOL = 8;
const urchins = [];
for (let i = 0; i < URCHIN_POOL; i++) {
  const mesh = new THREE.Mesh(urchinGeo, urchinMat);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softGlowTex, color: 0xff2d55, transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  halo.scale.setScalar(3.4);
  mesh.add(halo);
  mesh.visible = false;
  scene.add(mesh);
  urchins.push({
    mesh, halo,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    seed: Math.random() * 100,
    spin: new THREE.Vector3(rand(-0.4, 0.4), rand(-0.4, 0.4), rand(-0.4, 0.4)),
    active: false, dead: false, respawnAt: 0,
  });
}
function placeUrchin(u) {
  u.pos.set(rand(WORLD.minX + 6, WORLD.maxX - 6), rand(-6, 12), rand(-1, 1));
  if (u.pos.distanceTo(player.pos) < 9) u.pos.x += u.pos.x > player.pos.x ? 10 : -10;
  u.pos.x = THREE.MathUtils.clamp(u.pos.x, WORLD.minX + 2, WORLD.maxX - 2);
  u.dead = false;
  u.mesh.visible = true;
}
function setUrchinCount(n) {
  for (let i = 0; i < URCHIN_POOL; i++) {
    const u = urchins[i];
    const wasActive = u.active;
    u.active = i < n;
    if (u.active && !wasActive) placeUrchin(u);
    if (!u.active) { u.mesh.visible = false; u.dead = false; }
  }
}

// ————— particle bursts —————
const BURST_N = 700;
const burst = {
  idx: 0,
  pos: new Float32Array(BURST_N * 3),
  vel: new Float32Array(BURST_N * 3),
  col: new Float32Array(BURST_N * 3),
  life: new Float32Array(BURST_N),
  maxLife: new Float32Array(BURST_N),
  alpha: new Float32Array(BURST_N),
  size: new Float32Array(BURST_N),
};
{
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(burst.pos, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(burst.col, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(burst.alpha, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(burst.size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aColor;
      attribute float aAlpha;
      attribute float aSize;
      varying vec3 vC;
      varying float vA;
      void main() {
        vC = aColor;
        vA = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * aAlpha * (240.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vC;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vC * 1.6, a);
      }`,
  });
  burst.points = new THREE.Points(geo, mat);
  burst.points.frustumCulled = false;
  scene.add(burst.points);
}
function spawnBurst(origin, color, n = 14, speed = 2.6, bias = null) {
  for (let k = 0; k < n; k++) {
    const i = burst.idx = (burst.idx + 1) % BURST_N;
    burst.pos[i * 3] = origin.x;
    burst.pos[i * 3 + 1] = origin.y;
    burst.pos[i * 3 + 2] = origin.z;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(rand(-1, 1));
    const sp = speed * rand(0.35, 1);
    burst.vel[i * 3] = Math.sin(ph) * Math.cos(th) * sp + (bias ? bias.x : 0);
    burst.vel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * sp + (bias ? bias.y : 0);
    burst.vel[i * 3 + 2] = Math.cos(ph) * sp * 0.4 + (bias ? bias.z : 0);
    burst.col[i * 3] = color.r;
    burst.col[i * 3 + 1] = color.g;
    burst.col[i * 3 + 2] = color.b;
    burst.maxLife[i] = burst.life[i] = rand(0.5, 1.1);
    burst.size[i] = rand(4, 9);
  }
}
function updateBursts(dt) {
  for (let i = 0; i < BURST_N; i++) {
    if (burst.life[i] <= 0) { burst.alpha[i] = 0; continue; }
    burst.life[i] -= dt;
    const t = Math.max(0, burst.life[i] / burst.maxLife[i]);
    burst.alpha[i] = t;
    burst.pos[i * 3] += burst.vel[i * 3] * dt;
    burst.pos[i * 3 + 1] += burst.vel[i * 3 + 1] * dt;
    burst.pos[i * 3 + 2] += burst.vel[i * 3 + 2] * dt;
    burst.vel[i * 3] *= 0.94;
    burst.vel[i * 3 + 1] *= 0.94;
    burst.vel[i * 3 + 2] *= 0.94;
  }
  burst.points.geometry.attributes.position.needsUpdate = true;
  burst.points.geometry.attributes.aAlpha.needsUpdate = true;
  burst.points.geometry.attributes.aColor.needsUpdate = true;
}

// ————— bolts (boss projectiles) —————
const BOLT_POOL = 48;
const bolts = [];
for (let i = 0; i < BOLT_POOL; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softGlowTex, color: 0xff3355, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.scale.setScalar(0.9);
  scene.add(sp);
  bolts.push({ sp, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, seed: Math.random() * 10 });
}
let boltIdx = 0;
function spawnBolt(pos, vel) {
  const b = bolts[boltIdx = (boltIdx + 1) % BOLT_POOL];
  b.pos.copy(pos);
  b.vel.copy(vel);
  b.life = 5;
  b.sp.material.opacity = 0.85;
}
function updateBolts(dt, t) {
  const playing = state === 'gather' || state === 'boss';
  for (const b of bolts) {
    if (b.life <= 0) { b.sp.material.opacity = 0; continue; }
    b.life -= dt;
    b.pos.addScaledVector(b.vel, dt);
    b.pos.y += Math.sin(t * 6 + b.seed * 10) * 0.6 * dt;
    b.sp.position.copy(b.pos);
    b.sp.material.opacity = Math.min(0.85, b.life * 1.4) * (0.75 + 0.25 * Math.sin(t * 9 + b.seed));
    if (b.pos.x < WORLD.minX - 4 || b.pos.x > WORLD.maxX + 4 || b.pos.y < WORLD.reefY || b.pos.y > WORLD.maxY + 4) b.life = 0;
    if (playing && player.invuln <= 0 && b.life > 0 && b.pos.distanceTo(player.pos) < 0.75) {
      b.life = 0;
      hurtPlayer(2, _v1.copy(b.vel).normalize(), 0.35);
    }
  }
}
function clearBolts() { for (const b of bolts) b.life = 0; }

// ————— telegraphs — warnings before every dangerous boss attack —————
const telegraphs = [];
function spawnTelegraph(pos, radius, dur, onFire, color = 0xff4d6b) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ringTex, color, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.position.copy(pos);
  sp.scale.setScalar(radius * 2);
  scene.add(sp);
  telegraphs.push({ sp, t: 0, dur, onFire, pos: pos.clone(), radius });
}
function updateTelegraphs(dt) {
  for (let i = telegraphs.length - 1; i >= 0; i--) {
    const tg = telegraphs[i];
    tg.t += dt;
    tg.sp.material.opacity = Math.min(1, tg.t * 2.2) * (0.4 + 0.3 * Math.sin(tg.t * 22));
    tg.sp.scale.setScalar(tg.radius * 2 * (1.05 - 0.05 * Math.sin(tg.t * 22)));
    if (tg.t >= tg.dur) {
      scene.remove(tg.sp);
      tg.sp.material.dispose();
      telegraphs.splice(i, 1);
      if (tg.onFire) tg.onFire(tg.pos);
    }
  }
}

// ————— hazards — lingering void zones that deny area —————
const hazardTex = radialTexture([
  [0, 'rgba(46,0,18,0.9)'],
  [0.6, 'rgba(110,8,38,0.55)'],
  [0.82, 'rgba(255,45,85,0.5)'],
  [1, 'rgba(255,45,85,0)'],
]);
const hazards = [];
function spawnHazard(pos, radius, dur) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: hazardTex, transparent: true, opacity: 0, depthWrite: false,
  }));
  sp.position.copy(pos);
  sp.scale.setScalar(radius * 2.3);
  scene.add(sp);
  hazards.push({ sp, t: 0, dur, pos: pos.clone(), radius });
}
function updateHazards(dt) {
  const playing = state === 'gather' || state === 'boss';
  for (let i = hazards.length - 1; i >= 0; i--) {
    const hz = hazards[i];
    hz.t += dt;
    hz.sp.material.opacity = Math.min(0.85, hz.t * 3, (hz.dur - hz.t) * 1.4);
    hz.sp.material.rotation += dt * 0.5;
    if (playing && player.invuln <= 0 && hz.t > 0.25 && hz.pos.distanceTo(player.pos) < hz.radius) {
      _v1.subVectors(player.pos, hz.pos);
      if (_v1.lengthSq() < 0.01) _v1.set(0, 1, 0);
      hurtPlayer(3, _v1.normalize(), 0.8);
    }
    if (hz.t >= hz.dur) { scene.remove(hz.sp); hz.sp.material.dispose(); hazards.splice(i, 1); }
  }
}

// ————— shockwaves — expanding damage rings from slams —————
const shocks = [];
function spawnShock(pos, maxR = 10, speed = 10) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ringTex, color: 0xff4d6b, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.position.copy(pos);
  scene.add(sp);
  shocks.push({ sp, r: 0.5, maxR, speed, pos: pos.clone() });
  AudioSys.thud();
  shake = Math.max(shake, 0.4);
}
function updateShocks(dt) {
  const playing = state === 'gather' || state === 'boss';
  for (let i = shocks.length - 1; i >= 0; i--) {
    const s = shocks[i];
    s.r += s.speed * dt;
    s.sp.scale.setScalar(s.r * 2);
    s.sp.material.opacity = 0.9 * (1 - s.r / s.maxR);
    if (playing && player.invuln <= 0 && Math.abs(s.pos.distanceTo(player.pos) - s.r) < 0.9) {
      _v1.subVectors(player.pos, s.pos).normalize();
      hurtPlayer(4, _v1, 1);
    }
    if (s.r >= s.maxR) { scene.remove(s.sp); s.sp.material.dispose(); shocks.splice(i, 1); }
  }
}

function clearBossFx() {
  for (const tg of telegraphs) { scene.remove(tg.sp); tg.sp.material.dispose(); }
  telegraphs.length = 0;
  for (const hz of hazards) { scene.remove(hz.sp); hz.sp.material.dispose(); }
  hazards.length = 0;
  for (const s of shocks) { scene.remove(s.sp); s.sp.material.dispose(); }
  shocks.length = 0;
}

// ————— player abilities — the four lights —————
const ABILITIES = [
  { id: 'pulse', name: 'LUMEN PULSE', roman: 'I', unlock: 1, cdMax: 0.65, cost: 1, cd: 0 },
  { id: 'bolt', name: 'LUMEN PROJECTILE', roman: 'VI', unlock: 6, cdMax: 1.05, cost: 1, cd: 0 },
  { id: 'tether', name: 'LUMEN TETHER', roman: 'XI', unlock: 11, cdMax: 1.0, cost: 0, cd: 0 },
  { id: 'charge', name: 'VOID CHARGE', roman: 'XVI', unlock: 16, cdMax: 5.5, cost: 3, cd: 0 },
];
let selectedAbility = 0;
const combat = { attackHeld: false, tetherOn: false, tetherDrain: 0, charging: false, chargeT: 0 };
const CHARGE_FULL = 2.2;

function abilityUnlocked(i) { return level >= ABILITIES[i].unlock; }

let resistHintShown = false;
function resistFx(pos) {
  spawnBurst(pos, new THREE.Color(0x76889a), 6, 1.6);
  AudioSys.note(146, { vol: 0.06, decay: 0.22, plain: true, type: 'triangle' });
  if (!resistHintShown) {
    resistHintShown = true;
    setHint('it resists — find where it is open', 3000);
  }
}

// player projectiles
const PBOLT_POOL = 14;
const pbolts = [];
for (let i = 0; i < PBOLT_POOL; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softGlowTex, color: 0x9df5ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.scale.setScalar(0.85);
  scene.add(sp);
  pbolts.push({ sp, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0 });
}
let pboltIdx = 0;
function firePBolt(dir) {
  const b = pbolts[pboltIdx = (pboltIdx + 1) % PBOLT_POOL];
  b.pos.copy(player.pos).addScaledVector(dir, 0.7);
  b.vel.copy(dir).multiplyScalar(27);
  b.life = 1.35;
  b.sp.material.opacity = 0.95;
  spawnBurst(b.pos, COL.iceBlue, 4, 1.2);
  AudioSys.pew();
}
function updatePBolts(dt) {
  for (const b of pbolts) {
    if (b.life <= 0) { b.sp.material.opacity = 0; continue; }
    b.life -= dt;
    b.pos.addScaledVector(b.vel, dt);
    b.sp.position.copy(b.pos);
    if (b.life <= 0) { b.sp.material.opacity = 0; continue; }
    for (const u of urchins) {
      if (u.active && !u.dead && u.pos.distanceTo(b.pos) < 1.15) {
        killUrchin(u);
        b.life = 0;
        break;
      }
    }
    if (b.life <= 0) continue;
    if (boss && !boss.dead && state === 'boss') {
      if (b.pos.distanceTo(boss.weakPos) < Math.max(boss.weakRadius * 0.85, 1.1)) {
        const mul = boss.damageMul(b.pos);
        if (mul > 0) boss.takeDamage(13 * mul, b.pos);
        else resistFx(b.pos);
        b.life = 0;
      } else if (b.pos.distanceTo(boss.pos) < boss.bodyRadius * 0.9) {
        resistFx(b.pos);
        b.life = 0;
      }
    }
  }
}

// tether — a living beam between wisp and weak point
const TETHER_SEGS = 12;
let tetherMesh;
{
  const positions = new Float32Array(TETHER_SEGS * 2 * 3);
  const aT = new Float32Array(TETHER_SEGS * 2);
  const indices = [];
  for (let i = 0; i < TETHER_SEGS; i++) {
    aT[i * 2] = aT[i * 2 + 1] = i / (TETHER_SEGS - 1);
    if (i < TETHER_SEGS - 1) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  geo.setIndex(indices);
  tetherMesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float aT;
      varying float vT;
      void main() {
        vT = aT;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying float vT;
      void main() {
        vec3 col = mix(vec3(0.44, 0.97, 0.89), vec3(1.0), 0.5 + 0.5 * sin(vT * 26.0 - uTime * 18.0));
        gl_FragColor = vec4(col * 1.6, 0.85);
      }`,
  }));
  tetherMesh.frustumCulled = false;
  tetherMesh.visible = false;
  scene.add(tetherMesh);
}
function updateTetherMesh(t) {
  if (!boss) return;
  const posAttr = tetherMesh.geometry.attributes.position;
  for (let i = 0; i < TETHER_SEGS; i++) {
    const k = i / (TETHER_SEGS - 1);
    _v1.lerpVectors(player.pos, boss.weakPos, k);
    _v1.y += Math.sin(t * 11 + k * 9) * 0.35 * Math.sin(k * Math.PI);
    _v2.subVectors(boss.weakPos, player.pos);
    _v3.set(-_v2.y, _v2.x, 0).normalize();
    const w = 0.11 * (0.7 + 0.3 * Math.sin(t * 14 + k * 6));
    posAttr.setXYZ(i * 2, _v1.x + _v3.x * w, _v1.y + _v3.y * w, 0);
    posAttr.setXYZ(i * 2 + 1, _v1.x - _v3.x * w, _v1.y - _v3.y * w, 0);
  }
  posAttr.needsUpdate = true;
  tetherMesh.material.uniforms.uTime.value = t;
}
function tryTether() {
  if (!boss || boss.dead || state !== 'boss') { setHint('nothing to bind', 1600); return; }
  if (ABILITIES[2].cd > 0) return;
  if (player.carried < 1) { setHint('the tether feeds on your light — gather more', 2400); return; }
  if (player.pos.distanceTo(boss.weakPos) > 14) { setHint('too far — drift closer to bind it', 2000); return; }
  if (boss.damageMul(player.pos) <= 0) { resistFx(boss.weakPos); return; }
  combat.tetherOn = true;
  combat.tetherDrain = 0;
  tetherMesh.visible = true;
  AudioSys.tetherStart();
}
function stopTether(broke) {
  if (!combat.tetherOn) return;
  combat.tetherOn = false;
  tetherMesh.visible = false;
  AudioSys.tetherStop();
  ABILITIES[2].cd = ABILITIES[2].cdMax;
  if (broke) spawnBurst(player.pos, new THREE.Color(0x76889a), 8, 2);
}

// void charge — held, then released as a piercing beam
const beams = [];
function fireBeam(dir, p) {
  const len = 46;
  const width = 0.5 + p * 1.3;
  const geo = new THREE.PlaneGeometry(len, 1);
  geo.translate(len / 2, 0, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: 0xd9c8ff, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  mesh.position.copy(player.pos);
  mesh.rotation.z = Math.atan2(dir.y, dir.x);
  mesh.scale.y = width;
  scene.add(mesh);
  beams.push({ mesh, t: 0 });
  spawnRing(player.pos, 0xc9b8ff, 4 + p * 6, 0.6);
  spawnBurst(player.pos, COL.violet, 24, 6, _v3.copy(dir).multiplyScalar(8));
  shake = Math.max(shake, 0.45 + p * 0.4);
  slowmo = Math.max(slowmo, 0.16);
  AudioSys.beam(p);
  const dmg = 18 + p * 44;
  const hitLine = (pt, r) => {
    _v3.subVectors(pt, player.pos);
    const along = _v3.x * dir.x + _v3.y * dir.y;
    if (along < 0 || along > len) return false;
    const perpSq = _v3.lengthSq() - along * along;
    return perpSq < (r + width * 0.7) * (r + width * 0.7);
  };
  for (const b of bolts) if (b.life > 0 && hitLine(b.pos, 0.5)) { b.life = 0; spawnBurst(b.pos, COL.red, 4, 1.5); }
  for (const u of urchins) if (u.active && !u.dead && hitLine(u.pos, 1)) killUrchin(u);
  if (boss && !boss.dead && state === 'boss') {
    if (hitLine(boss.weakPos, boss.weakRadius * 0.9 + 0.4)) {
      const mul = boss.damageMul(player.pos);
      if (mul > 0) boss.takeDamage(dmg * mul, boss.weakPos);
      else resistFx(boss.weakPos);
    } else if (hitLine(boss.pos, boss.bodyRadius * 0.8)) {
      resistFx(boss.pos);
    }
  }
}
function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    b.t += dt;
    b.mesh.material.opacity = Math.max(0, 1 - b.t / 0.35);
    b.mesh.scale.y *= Math.pow(0.4, dt);
    if (b.t > 0.35) {
      scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      beams.splice(i, 1);
    }
  }
}
function beginCharge() {
  if (ABILITIES[3].cd > 0) return;
  if (player.carried < ABILITIES[3].cost) { setHint(`the void asks ${ABILITIES[3].cost} lumens`, 2200); return; }
  combat.charging = true;
  combat.chargeT = 0;
  AudioSys.chargeStart();
}
function cancelCharge() {
  if (!combat.charging) return;
  combat.charging = false;
  AudioSys.chargeStop(false);
}
function releaseCharge() {
  if (!combat.charging) return;
  const p = Math.min(combat.chargeT / CHARGE_FULL, 1);
  combat.charging = false;
  AudioSys.chargeStop(true);
  if (p < 0.14) return; // tap — fizzles, costs nothing
  player.carried -= ABILITIES[3].cost;
  updateLumenHud();
  ABILITIES[3].cd = ABILITIES[3].cdMax;
  mouseToWorld(_v1);
  _v2.subVectors(_v1, player.pos);
  if (_v2.lengthSq() < 0.01) _v2.set(1, 0, 0);
  fireBeam(_v2.normalize().clone(), p);
}

function killUrchin(u) {
  u.dead = true;
  u.mesh.visible = false;
  u.respawnAt = elapsed + rand(6, 10);
  spawnBurst(u.pos, COL.red, 18, 4);
  spawnRing(u.pos, 0xff4d6b, 4.5, 0.55);
  AudioSys.chime(6);
  shake = Math.max(shake, 0.25);
}

function firePulse() {
  spawnRing(player.pos, 0x9df5e8, 5.2, 0.45);
  spawnBurst(player.pos, COL.cyan, 16, 5);
  AudioSys.pulse();
  // the pulse is also a shield-break: clears nearby boss bolts
  for (const b of bolts) {
    if (b.life > 0 && b.pos.distanceTo(player.pos) < 5.2) {
      b.life = 0;
      spawnBurst(b.pos, COL.red, 4, 1.5);
    }
  }
  for (const u of urchins) {
    if (u.active && !u.dead && u.pos.distanceTo(player.pos) < 5.2) killUrchin(u);
  }
  if (boss && !boss.dead && state === 'boss') {
    if (boss.weakPos.distanceTo(player.pos) < 5.2) {
      const mul = boss.damageMul(player.pos);
      if (mul > 0) boss.takeDamage(10 * mul, boss.weakPos);
      else resistFx(boss.weakPos);
    } else if (boss.pos.distanceTo(player.pos) < boss.bodyRadius + 4) {
      resistFx(_v1.copy(player.pos).lerp(boss.pos, 0.55));
    }
  }
}

function beginAttack() {
  if (state !== 'gather' && state !== 'boss' && state !== 'victory') return;
  combat.attackHeld = true;
  const ab = ABILITIES[selectedAbility];
  if (ab.id === 'tether') tryTether();
  else if (ab.id === 'charge') beginCharge();
  // pulse & bolt fire from the held-attack loop in updateAbilities
}
function endAttack() {
  combat.attackHeld = false;
  if (combat.tetherOn) stopTether(false);
  if (combat.charging) releaseCharge();
}

function updateAbilities(dt, t) {
  for (const ab of ABILITIES) ab.cd = Math.max(0, ab.cd - dt);
  const ab = ABILITIES[selectedAbility];

  // held-fire for pulse / projectile
  if (combat.attackHeld && (state === 'gather' || state === 'boss' || state === 'victory')) {
    if (ab.id === 'pulse' && ab.cd <= 0) {
      if (player.carried >= ab.cost) {
        player.carried -= ab.cost;
        updateLumenHud();
        ab.cd = ab.cdMax;
        firePulse();
      } else {
        combat.attackHeld = false;
        setHint('no light left — gather the motes', 2400);
      }
    } else if (ab.id === 'bolt' && ab.cd <= 0) {
      if (player.carried >= ab.cost) {
        player.carried -= ab.cost;
        updateLumenHud();
        ab.cd = ab.cdMax;
        mouseToWorld(_v1);
        _v2.subVectors(_v1, player.pos);
        if (_v2.lengthSq() < 0.01) _v2.set(1, 0, 0);
        firePBolt(_v2.normalize());
      } else {
        combat.attackHeld = false;
        setHint('no light left — gather the motes', 2400);
      }
    }
  }

  // tether maintenance
  if (combat.tetherOn) {
    const broken =
      !boss || boss.dead || state !== 'boss' ||
      player.pos.distanceTo(boss.weakPos) > 15.5 ||
      boss.damageMul(player.pos) <= 0 ||
      player.carried < 1;
    if (broken) {
      stopTether(true);
    } else {
      boss.takeDamage(9.5 * dt * boss.damageMul(player.pos), null);
      boss.hitFlash = Math.max(boss.hitFlash, 0.3);
      combat.tetherDrain += 1.25 * dt;
      if (combat.tetherDrain >= 1) {
        combat.tetherDrain -= 1;
        player.carried--;
        updateLumenHud();
      }
      updateTetherMesh(t);
      if (Math.random() < dt * 14) spawnBurst(boss.weakPos, COL.cyan, 2, 1.6);
    }
  }

  // charge build-up
  if (combat.charging) {
    combat.chargeT = Math.min(combat.chargeT + dt, CHARGE_FULL);
    const p = combat.chargeT / CHARGE_FULL;
    if (Math.random() < dt * (6 + p * 18)) {
      spawnBurst(player.pos, p > 0.7 ? COL.violet : COL.iceBlue, 2, 0.7);
    }
    AudioSys.chargeTick(p);
  }

  updatePBolts(dt);
  updateBeams(dt);
  updateAbilityBarCds();
}

// ————— audio —————
const AudioSys = {
  ctx: null, master: null, muted: false, bossGain: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.delay = this.ctx.createDelay(1);
    this.delay.delayTime.value = 0.34;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.38;
    const wet = this.ctx.createGain();
    wet.gain.value = 0.3;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.master);
    const padGain = this.ctx.createGain();
    padGain.gain.value = 0.05;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 1.4;
    padGain.connect(filter).connect(this.master);
    for (const f of [55, 82.41, 110, 164.81]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = rand(-6, 6);
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g).connect(padGain);
      o.start();
    }
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const nf = this.ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 240;
    const ng = this.ctx.createGain();
    ng.gain.value = 0.05;
    noise.connect(nf).connect(ng).connect(this.master);
    noise.start();
    // boss dread layer — low pulse, faded in during fights
    this.bossGain = this.ctx.createGain();
    this.bossGain.gain.value = 0;
    const bo = this.ctx.createOscillator();
    bo.type = 'triangle';
    bo.frequency.value = 41.2;
    const bLfo = this.ctx.createOscillator();
    bLfo.frequency.value = 1.1;
    const bLfoG = this.ctx.createGain();
    bLfoG.gain.value = 0.5;
    const bAmp = this.ctx.createGain();
    bAmp.gain.value = 0.5;
    bLfo.connect(bLfoG).connect(bAmp.gain);
    bo.connect(bAmp).connect(this.bossGain).connect(this.master);
    bo.start();
    bLfo.start();
  },
  setBossLayer(on) {
    if (!this.ctx || !this.bossGain) return;
    this.bossGain.gain.linearRampToValueAtTime(on ? 0.11 : 0, this.ctx.currentTime + 1.2);
  },
  note(freq, opts = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + (opts.delay || 0);
    const o = this.ctx.createOscillator();
    o.type = opts.type || 'sine';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol || 0.16, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (opts.decay || 1.4));
    o.connect(g);
    g.connect(this.master);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + (opts.decay || 1.4) + 0.1);
    if (!opts.plain) {
      const o2 = this.ctx.createOscillator();
      o2.frequency.value = freq * 2.01;
      const g2 = this.ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime((opts.vol || 0.16) * 0.28, t + 0.01);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + (opts.decay || 1.4) * 0.6);
      o2.connect(g2).connect(this.delay);
      o2.start(t);
      o2.stop(t + (opts.decay || 1.4));
    }
  },
  chime(step) {
    const penta = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.7, 1318.5, 1568.0, 1760.0];
    this.note(penta[Math.min(step, penta.length - 1)], { vol: 0.14, decay: 1.5 });
  },
  chord() {
    const notes = [261.63, 392.0, 523.25, 659.25, 783.99];
    notes.forEach((f, i) => this.note(f, { delay: i * 0.09, vol: 0.13, decay: 2.6 }));
    this.note(130.81, { vol: 0.16, decay: 3.2, plain: true });
  },
  victory() {
    this.chord();
    [1046.5, 1174.7, 1318.5, 1568.0].forEach((f, i) =>
      this.note(f, { delay: 0.5 + i * 0.11, vol: 0.09, decay: 2 }));
  },
  thud() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(86, t);
    o.frequency.exponentialRampToValueAtTime(34, t + 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.6);
  },
  roar() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(26, t + 1.4);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.7);
  },
  strike() {
    if (!this.ctx || this.muted) return;
    this.note(1318.5, { vol: 0.2, decay: 0.5, type: 'triangle' });
    this.note(659.25, { vol: 0.14, decay: 0.9 });
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.18);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
  },
  dash() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.3;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.22);
    const g = this.ctx.createGain();
    g.gain.value = 0.14;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  },
  pulse() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(392, t);
    o.frequency.exponentialRampToValueAtTime(196, t + 0.16);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.25);
    const len = this.ctx.sampleRate * 0.14;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.12;
    src.connect(f).connect(g2).connect(this.master);
    src.start(t);
  },
  pew() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(1100, t);
    o.frequency.exponentialRampToValueAtTime(340, t + 0.13);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(this.master);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + 0.18);
  },
  tetherStart() {
    if (!this.ctx || this.muted || this.tetherNodes) return;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 0.15);
    const o1 = this.ctx.createOscillator();
    o1.frequency.value = 220;
    const o2 = this.ctx.createOscillator();
    o2.frequency.value = 331;
    o2.detune.value = 8;
    const trem = this.ctx.createOscillator();
    trem.frequency.value = 9;
    const tremG = this.ctx.createGain();
    tremG.gain.value = 0.4;
    const amp = this.ctx.createGain();
    amp.gain.value = 0.6;
    trem.connect(tremG).connect(amp.gain);
    o1.connect(amp);
    o2.connect(amp);
    amp.connect(g).connect(this.master);
    g.connect(this.delay);
    o1.start(); o2.start(); trem.start();
    this.tetherNodes = { g, o1, o2, trem };
  },
  tetherStop() {
    if (!this.ctx || !this.tetherNodes) return;
    const n = this.tetherNodes;
    this.tetherNodes = null;
    const t = this.ctx.currentTime;
    n.g.gain.linearRampToValueAtTime(0, t + 0.18);
    setTimeout(() => { try { n.o1.stop(); n.o2.stop(); n.trem.stop(); } catch (e) { /* done */ } }, 400);
  },
  chargeStart() {
    if (!this.ctx || this.muted || this.chargeNodes) return;
    const g = this.ctx.createGain();
    g.gain.value = 0.001;
    g.gain.linearRampToValueAtTime(0.09, this.ctx.currentTime + CHARGE_FULL);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(58, this.ctx.currentTime);
    o.frequency.linearRampToValueAtTime(420, this.ctx.currentTime + CHARGE_FULL);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    o.connect(f).connect(g).connect(this.master);
    o.start();
    this.chargeNodes = { g, o };
  },
  chargeTick() { /* pitch ramp is pre-scheduled; hook kept for future shaping */ },
  chargeStop(fired) {
    if (!this.ctx || !this.chargeNodes) return;
    const n = this.chargeNodes;
    this.chargeNodes = null;
    const t = this.ctx.currentTime;
    n.g.gain.cancelScheduledValues(t);
    n.g.gain.setValueAtTime(n.g.gain.value, t);
    n.g.gain.linearRampToValueAtTime(0, t + (fired ? 0.05 : 0.25));
    setTimeout(() => { try { n.o.stop(); } catch (e) { /* done */ } }, 500);
  },
  beam(p) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(46, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.3 + p * 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.75);
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.16 + p * 0.12;
    src.connect(f).connect(g2).connect(this.master);
    src.start(t);
    this.note(1568, { vol: 0.08 + p * 0.06, decay: 1.2 });
  },
};

// ————— game state / UI —————
let state = 'title'; // title | gather | boss | victory | transition | won
let level = 1;
let cfg = levelConfig(1);
let boss = null;
let startTime = 0;
let totalCollected = 0;
let hits = 0;
let bossesFelled = 0;
let combo = 0;
let lastCollect = -10;
let shake = 0;
let slowmo = 0;
let stateTimer = 0;

const hud = document.getElementById('hud');
const hintEl = document.getElementById('hint');
const lumenEl = document.getElementById('lumenCount');
const depthNumEl = document.getElementById('depthNum');
const depthLabelEl = document.getElementById('depthLabel');
const bossBarEl = document.getElementById('bossBar');
const bossNameEl = document.getElementById('bossName');
const bossFillEl = document.getElementById('bossFill');
const bossCostEl = document.getElementById('bossCost');
const annEl = document.getElementById('announce');
const annOverEl = document.getElementById('annOver');
const annTitleEl = document.getElementById('annTitle');
const hitflashEl = document.getElementById('hitflash');

let hintTimer = null;
function setHint(text, holdMs = 0) {
  clearTimeout(hintTimer);
  hintEl.classList.remove('visible');
  if (!text) return;
  hintTimer = setTimeout(() => {
    hintEl.textContent = text;
    hintEl.classList.add('visible');
    if (holdMs > 0) hintTimer = setTimeout(() => hintEl.classList.remove('visible'), holdMs);
  }, 650);
}
function updateLumenHud() {
  lumenEl.textContent = player.carried;
  lumenEl.classList.remove('pop');
  void lumenEl.offsetWidth;
  lumenEl.classList.add('pop');
}
let annTimer = null;
function announce(over, title, holdMs = 2600) {
  clearTimeout(annTimer);
  annOverEl.textContent = over;
  annTitleEl.textContent = title;
  annEl.classList.add('visible');
  annTimer = setTimeout(() => annEl.classList.remove('visible'), holdMs);
}
function updateBossBar() {
  if (!boss) return;
  bossFillEl.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
}

// ————— shared combat —————
function hurtPlayer(lost, knockDir, mag = 1) {
  hits++;
  player.invuln = 2.0;
  stopTether(true);   // pain severs the bind
  cancelCharge();     // and scatters the gathering void
  const n = Math.min(player.carried, lost);
  player.carried -= n;
  updateLumenHud();
  let scattered = 0;
  for (const s of spores) {
    if (scattered >= n) break;
    if (!s.alive) {
      spawnSpore(
        s,
        THREE.MathUtils.clamp(player.pos.x + rand(-5, 5), WORLD.minX + 2, WORLD.maxX - 2),
        THREE.MathUtils.clamp(player.pos.y + rand(-3, 5), WORLD.reefY + 2, WORLD.maxY - 1)
      );
      scattered++;
    }
  }
  if (knockDir) player.vel.addScaledVector(knockDir, 14 * mag);
  shake = Math.min(1, 0.5 + 0.3 * mag);
  spawnBurst(player.pos, COL.red, 20, 4);
  spawnRing(player.pos, 0xff4d6b, 7, 0.8);
  hitflashEl.classList.add('flash');
  setTimeout(() => hitflashEl.classList.remove('flash'), 90);
  AudioSys.thud();
  combo = 0;
}

function makeEye(scale = 1) {
  const eye = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.2 * scale, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff2cf, transparent: true })
  );
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softGlowTex, color: 0xffd98c, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  glow.scale.setScalar(2 * scale);
  eye.add(core, glow);
  eye.userData = { core, glow };
  return eye;
}

// ————— bosses —————
class Boss {
  constructor(c) {
    this.cfg = c;
    this.hp = c.bossHP;
    this.maxHp = c.bossHP;
    this.group = new THREE.Group();
    this.pos = new THREE.Vector3(
      THREE.MathUtils.clamp(player.pos.x > 0 ? player.pos.x - 16 : player.pos.x + 16, WORLD.minX + 4, WORLD.maxX - 4),
      Math.min(player.pos.y + 6, WORLD.maxY - 2), 0
    );
    this.vel = new THREE.Vector3();
    this.vulnerable = true;
    this.weakPos = new THREE.Vector3();
    this.weakRadius = 1.8;
    this.bodyRadius = 2.4;
    this.hitFlash = 0;
    this.dead = false;
    this.attackT = 0;
    scene.add(this.group);
  }
  clampPos() {
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, WORLD.minX + 3, WORLD.maxX - 3);
    this.pos.y = THREE.MathUtils.clamp(this.pos.y, WORLD.reefY + 4, WORLD.maxY - 1);
    this.pos.z = 0;
  }
  applyEye(t) {
    const { core, glow } = this.eye.userData;
    const pulse = this.vulnerable ? 0.85 + 0.35 * Math.sin(t * 5) : 0.15;
    core.material.opacity = this.vulnerable ? 1 : 0.25;
    glow.material.opacity = Math.min(1, pulse * (this.hitFlash > 0 ? 1.4 : 1));
    glow.scale.setScalar((this.vulnerable ? 2.3 : 1.2) + 0.3 * Math.sin(t * 3.4));
    this.hitFlash = Math.max(0, this.hitFlash - 0.05);
  }
  // amount is already multiplied by damageMul by the caller; `at` marks the hit point
  takeDamage(amount, at) {
    if (this.dead || amount <= 0) return;
    this.hp -= amount;
    this.hitFlash = 1;
    updateBossBar();
    if (at) spawnBurst(at, COL.cyan, Math.min(6 + Math.round(amount), 22), 3.6);
    if (amount >= 9) {
      spawnRing(at || this.weakPos, 0x9df5e8, 6, 0.55);
      slowmo = Math.max(slowmo, 0.15);
      shake = Math.max(shake, 0.35);
      AudioSys.strike();
    }
    if (this.hp <= 0) { this.die(); onBossDefeated(); }
  }
  // 0 = immune right now, fractional = chip damage, 1 = fully open.
  // attackerPos lets armored bosses gate damage by direction.
  damageMul() {
    return this.vulnerable ? 1 : 0;
  }
  die() {
    this.dead = true;
    this.vulnerable = false;
  }
  dispose() {
    scene.remove(this.group);
  }
  contactCheck() {
    if (player.invuln > 0) return;
    if (this.pos.distanceTo(player.pos) < this.bodyRadius + 0.35) {
      _v1.subVectors(player.pos, this.pos).normalize();
      hurtPlayer(4, _v1, 1);
      this.vel.addScaledVector(_v1, -4);
    }
  }
  // bosses close distance fast, then fight at normal pace
  farBoost() {
    return this.pos.distanceTo(player.pos) > 12 ? 3.5 : 1;
  }
}

// THE DREDGER — a crawling abyssal scavenger. Floor-bound, claw swipes,
// lunging charges. Its glowing mouth is always exposed — the teaching boss.
class Dredger extends Boss {
  constructor(c) {
    super(c);
    const s = this.s = 1.15 + c.tier * 0.18;
    this.body = new THREE.Group();
    const hump = (r, x, y) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), urchinMat);
      m.scale.y = 0.62;
      m.position.set(x, y, 0);
      return m;
    };
    this.body.add(hump(1.5, -1.6, 0.4), hump(1.9, 0, 0.7), hump(1.35, 1.7, 0.35));
    for (let i = 0; i < 7; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, rand(0.7, 1.3), 5), urchinMat);
      spike.position.set(rand(-2.2, 2.2), rand(1.1, 1.7), rand(-0.4, 0.4));
      spike.rotation.z = rand(-0.4, 0.4);
      this.body.add(spike);
    }
    this.legs = [];
    for (let i = 0; i < 6; i++) {
      const leg = new THREE.Mesh(new THREE.ConeGeometry(0.13, 2.3, 5), urchinMat);
      leg.geometry.translate(0, -1.15, 0);
      leg.position.set(-2 + (i % 3) * 1.9, 0, i < 3 ? 0.85 : -0.85);
      this.legs.push(leg);
      this.body.add(leg);
    }
    // claw arm — its telegraph weapon
    this.claw = new THREE.Group();
    const armSeg = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 6), urchinMat);
    armSeg.geometry.translate(0, 1.2, 0);
    const clawTip = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.1, 5), urchinMat);
    clawTip.geometry.translate(0, 0.55, 0);
    clawTip.position.y = 2.4;
    clawTip.rotation.z = 0.7;
    this.claw.add(armSeg, clawTip);
    this.claw.position.set(2.2, 0.4, 0.3);
    this.claw.rotation.z = -1.2;
    this.body.add(this.claw);
    // the glowing mouth — front underside, the obvious weak point
    this.eye = makeEye(1.35);
    this.eye.position.set(2.3, -0.5, 0.5);
    this.body.add(this.eye);
    this.body.scale.setScalar(s);
    this.group.add(this.body);
    this.bodyRadius = 2.3 * s;
    this.weakRadius = 2.0;
    this.mode = 'crawl'; // crawl | swipeWind | lungeWind | lunging
    this.modeT = 0;
    this.facing = 1;
    this.pos.y = WORLD.reefY + 1.9 * s;
  }
  update(dt, t) {
    const s = this.s;
    this.modeT += dt;
    const groundY = WORLD.reefY + 1.9 * s + Math.sin(t * 2.2) * 0.12;
    if (this.mode === 'crawl') {
      const dx = player.pos.x - this.pos.x;
      this.facing = dx >= 0 ? 1 : -1;
      this.vel.x += Math.sign(dx) * 2.4 * this.cfg.speed * this.farBoost() * dt;
      this.vel.multiplyScalar(Math.pow(0.2, dt));
      this.pos.x += this.vel.x * dt;
      this.pos.y += (groundY - this.pos.y) * Math.min(1, dt * 4);
      this.attackT += dt;
      if (this.attackT > 3.4 / this.cfg.speed) {
        this.attackT = 0;
        const near = Math.abs(dx) < 7.5 && player.pos.y < WORLD.reefY + 9;
        if (near) {
          this.mode = 'swipeWind';
          this.modeT = 0;
          spawnTelegraph(
            _v1.set(this.pos.x + this.facing * 3.4 * s, this.pos.y + 0.6, 0), 3.6 * s, 0.85
          );
          AudioSys.thud();
        } else if (this.cfg.tier >= 1 && Math.random() < 0.5) {
          // silt spit — a fan of bolts
          _v1.subVectors(player.pos, this.pos).normalize();
          for (const spread of [-0.28, 0, 0.28]) {
            _v2.copy(_v1).applyAxisAngle(_v3.set(0, 0, 1), spread);
            spawnBolt(this.pos, _v2.multiplyScalar(5.2));
          }
        } else {
          this.mode = 'lungeWind';
          this.modeT = 0;
          spawnRing(this.pos, 0xff4d6b, 4, 0.9);
        }
      }
    } else if (this.mode === 'swipeWind') {
      // claw rises — the wind-up everyone learns to read
      this.claw.rotation.z = -1.2 + Math.min(this.modeT / 0.85, 1) * 2.3;
      if (this.modeT > 0.85) {
        this.mode = 'crawl';
        this.modeT = 0;
        this.claw.rotation.z = -1.2;
        const inX = (player.pos.x - this.pos.x) * this.facing;
        if (player.invuln <= 0 && inX > -0.5 && inX < 6.5 * s && Math.abs(player.pos.y - this.pos.y) < 4.4) {
          _v1.set(this.facing, 0.7, 0).normalize();
          hurtPlayer(5, _v1, 1.2);
        }
        spawnShock(_v1.set(this.pos.x + this.facing * 3.2 * s, this.pos.y, 0), 5.5 * s, 13);
      }
    } else if (this.mode === 'lungeWind') {
      this.body.rotation.z = -this.facing * Math.min(this.modeT / 0.95, 1) * 0.3;
      if (this.modeT > 0.95) {
        this.mode = 'lunging';
        this.modeT = 0;
        this.body.rotation.z = 0;
        this.vel.x = this.facing * 17 * Math.min(this.cfg.speed, 1.7);
        AudioSys.roar();
      }
    } else if (this.mode === 'lunging') {
      this.pos.x += this.vel.x * dt;
      this.vel.x *= Math.pow(0.25, dt);
      this.pos.y += (groundY - this.pos.y) * Math.min(1, dt * 4);
      if (this.modeT > 0.95) { this.mode = 'crawl'; this.modeT = 0; }
    }
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, WORLD.minX + 3, WORLD.maxX - 3);
    this.pos.z = 0;
    this.group.position.copy(this.pos);
    this.body.scale.x = s * this.facing; // face the player
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].rotation.x = Math.sin(t * 8 + i * 1.1) * 0.35;
    }
    this.weakPos.set(this.pos.x + this.facing * 2.3 * s, this.pos.y - 0.5 * s, 0);
    this.vulnerable = this.mode !== 'lunging'; // shielded while charging
    this.applyEye(t);
    this.contactCheck();
  }
}

class Reliquary extends Boss {
  constructor(c) {
    super(c);
    // THE RELIQUARY — an armored heart. Its shell has one gap; attacks only
    // land through the gap, or during the vent when the whole shell opens.
    const s = this.s = 1.0 + c.tier * 0.15;
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(1.0 * s, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xb08d54, transparent: true, opacity: 0.7 })
    );
    this.coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softGlowTex, color: 0xffd98c, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.coreGlow.scale.setScalar(2.6 * s);
    this.eye = makeEye(0.9);
    this.eye.position.set(0, 0, 1.1 * s);
    // armor: torus-arc plates in the play plane, one segment missing = the gap
    this.shell = new THREE.Group();
    const PLATES = 6;
    this.gapBase = Math.PI / PLATES; // gap center sits in the skipped segment
    for (let i = 1; i < PLATES; i++) {
      const arc = (Math.PI * 2) / PLATES - 0.22;
      const plate = new THREE.Mesh(new THREE.TorusGeometry(1.9 * s, 0.42 * s, 8, 10, arc), urchinMat);
      plate.rotation.z = i * (Math.PI * 2) / PLATES + 0.11;
      this.shell.add(plate);
      const stud = new THREE.Mesh(new THREE.ConeGeometry(0.14 * s, 0.6 * s, 5), urchinMat);
      const a = i * (Math.PI * 2) / PLATES + 0.11 + arc / 2;
      stud.position.set(Math.cos(a) * 2.3 * s, Math.sin(a) * 2.3 * s, 0);
      stud.rotation.z = a - Math.PI / 2;
      this.shell.add(stud);
    }
    this.group.add(this.coreGlow, this.core, this.eye, this.shell);
    this.bodyRadius = 2.1 * s;
    this.weakRadius = 1.5 * s;
    this.spinSpeed = 0.45 + c.tier * 0.12;
    this.vent = { timer: 0, open: false, period: 10 - c.tier * 1.2 };
    this.vulnerable = false;
  }
  gapAlignedWith(p) {
    const a = Math.atan2(p.y - this.pos.y, p.x - this.pos.x);
    let d = a - (this.shell.rotation.z + this.gapBase);
    d = Math.atan2(Math.sin(d), Math.cos(d));
    return Math.abs(d) < 0.46;
  }
  damageMul(attackerPos) {
    if (this.dead) return 0;
    if (this.vent.open) return 1;
    if (attackerPos && this.gapAlignedWith(attackerPos)) return 1;
    return 0;
  }
  update(dt, t) {
    const s = this.s;
    this.vel.x += Math.sign(player.pos.x - this.pos.x) * 0.9 * this.farBoost() * dt;
    this.vel.y += Math.sin(t * 0.5) * 0.4 * dt;
    this.vel.multiplyScalar(Math.pow(0.3, dt));
    this.pos.addScaledVector(this.vel, dt);
    this.clampPos();
    this.group.position.copy(this.pos);
    this.weakPos.copy(this.pos);
    // shell rotation — the gap orbits; stops while venting
    if (!this.vent.open) this.shell.rotation.z += this.spinSpeed * dt;
    // vent cycle: shell opens wide, core exposed from every angle
    this.vent.timer += dt;
    if (!this.vent.open && this.vent.timer > this.vent.period) {
      this.vent.open = true;
      this.vent.timer = 0;
      spawnRing(this.pos, 0xffd98c, 5 * s, 0.8);
      AudioSys.roar();
    } else if (this.vent.open && this.vent.timer > 3.2) {
      this.vent.open = false;
      this.vent.timer = 0;
      // the shell snaps shut — shockwave
      spawnShock(this.pos, 8 * s, 12);
    }
    const shellScale = this.vent.open ? 1.35 : 1;
    this.shell.scale.x += (shellScale - this.shell.scale.x) * Math.min(1, dt * 5);
    this.shell.scale.y = this.shell.scale.x;
    this.vulnerable = this.vent.open || this.gapAlignedWith(player.pos);
    this.core.material.opacity = 0.45 + 0.25 * Math.sin(t * 3);
    this.coreGlow.material.opacity = this.vulnerable ? 0.42 : 0.2;
    this.applyEye(t);
    // it spits through its own gap — the open path is also the dangerous one
    this.attackT += dt;
    if (!this.vent.open && this.attackT > 2.7 / this.cfg.speed) {
      this.attackT = 0;
      const ga = this.shell.rotation.z + this.gapBase;
      _v1.set(Math.cos(ga), Math.sin(ga), 0);
      for (const spread of [-0.16, 0, 0.16]) {
        _v2.copy(_v1).applyAxisAngle(_v3.set(0, 0, 1), spread);
        spawnBolt(this.pos, _v2.multiplyScalar(5.6));
      }
    }
    // shell contact
    if (player.invuln <= 0 && !this.vent.open) {
      const d = this.pos.distanceTo(player.pos);
      if (d > 1.5 * s && d < 2.5 * s && !this.gapAlignedWith(player.pos)) {
        _v1.subVectors(player.pos, this.pos).normalize();
        hurtPlayer(4, _v1, 1);
      }
    }
  }
}

class Undertow extends Boss {
  constructor(c) {
    super(c);
    // THE UNDERTOW — a hunting eel. Rear-back charges, a tail sweep that
    // punishes chasing its back half, and (later tiers) a burrow-and-erupt.
    this.segments = [];
    this.segPos = [];
    const segN = 13 + c.tier;
    for (let i = 0; i < segN; i++) {
      const r = i === 0 ? 1.0 : Math.max(0.66 * (1 - i / (segN + 4)), 0.16);
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 14), urchinMat);
      if (i === 0) m.scale.set(1.5, 0.85, 0.85); // elongated skull
      scene.add(m);
      this.segments.push(m);
      this.segPos.push(this.pos.clone().add(new THREE.Vector3(-i * 1.0, 0, 0)));
      // dorsal fin plates along the front half
      if (i > 0 && i < 7 && i % 2 === 1) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.9, 4), urchinMat);
        fin.scale.z = 0.25;
        fin.position.y = r + 0.3;
        m.add(fin);
      }
    }
    // jaw fins framing the skull
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 4), urchinMat);
      fin.scale.z = 0.22;
      fin.rotation.z = side * 2.1;
      fin.position.set(0.4, side * 0.75, 0);
      this.segments[0].add(fin);
    }
    this.eye = makeEye(1.0);
    scene.add(this.eye);
    this.bodyRadius = 1.1;
    this.weakRadius = 1.8;
    this.wander = rand(0, 10);
    this.mode = 'swim'; // swim | rearing | charging | burrowing | buried | erupting
    this.modeT = 0;
    this.tailCd = 0;
    this.burrowCd = 12;
  }
  damageMul() {
    if (this.dead) return 0;
    return (this.mode === 'buried' || this.mode === 'burrowing') ? 0 : 1;
  }
  update(dt, t) {
    const head = this.segPos[0];
    this.modeT += dt;
    this.tailCd -= dt;
    this.burrowCd -= dt;
    this.attackT += dt;

    if (this.mode === 'swim') {
      this.wander += dt;
      _v1.set(
        player.pos.x + Math.cos(this.wander * 0.7) * 10,
        player.pos.y + Math.sin(this.wander * 1.1) * 6,
        0
      );
      _v2.subVectors(_v1, head).normalize();
      this.vel.addScaledVector(_v2, 6 * dt);
      this.vel.clampLength(0, 6.5 * this.cfg.speed);
      if (this.cfg.tier >= 1 && this.burrowCd <= 0) {
        this.mode = 'burrowing';
        this.modeT = 0;
        this.burrowCd = 14 - this.cfg.tier * 2;
        AudioSys.thud();
      } else if (this.attackT > 4.6 / this.cfg.speed) {
        this.attackT = 0;
        this.mode = 'rearing';
        this.modeT = 0;
        spawnRing(head, 0xff4d6b, 3.2, 0.85);
        AudioSys.thud();
      }
    } else if (this.mode === 'rearing') {
      // pulls back before striking — the read
      _v1.subVectors(head, player.pos).normalize();
      this.vel.addScaledVector(_v1, 5 * dt);
      this.vel.clampLength(0, 4);
      if (this.modeT > 0.85) {
        this.mode = 'charging';
        this.modeT = 0;
        _v1.subVectors(player.pos, head).normalize();
        this.vel.copy(_v1).multiplyScalar(16 * Math.min(this.cfg.speed, 1.7));
        AudioSys.roar();
      }
    } else if (this.mode === 'charging') {
      if (this.modeT > 1.0) { this.mode = 'swim'; this.modeT = 0; }
    } else if (this.mode === 'burrowing') {
      // dives beneath the reef
      this.vel.set(this.vel.x * 0.4, -14, 0);
      if (head.y < WORLD.reefY - 2.5) {
        this.mode = 'buried';
        this.modeT = 0;
        this.vel.set(0, 0, 0);
        // strike marker under the player — get out of the circle
        spawnTelegraph(_v1.set(player.pos.x, Math.max(player.pos.y, WORLD.reefY + 3), 0), 4.2, 1.35, (p) => {
          for (let i = 0; i < this.segPos.length; i++) this.segPos[i].set(p.x, WORLD.reefY - 2 - i * 0.9, 0);
          this.mode = 'erupting';
          this.modeT = 0;
          this.vel.set(0, 19, 0);
          spawnShock(_v2.set(p.x, WORLD.reefY + 1.5, 0), 7, 14);
          AudioSys.roar();
        });
      }
    } else if (this.mode === 'buried') {
      // waiting for the telegraph to fire
    } else if (this.mode === 'erupting') {
      this.vel.y *= Math.pow(0.3, dt);
      if (this.modeT > 1.1) { this.mode = 'swim'; this.modeT = 0; }
    }

    head.addScaledVector(this.vel, dt);
    head.x = THREE.MathUtils.clamp(head.x, WORLD.minX + 2, WORLD.maxX - 2);
    if (this.mode !== 'burrowing' && this.mode !== 'buried' && this.mode !== 'erupting') {
      head.y = THREE.MathUtils.clamp(head.y, WORLD.reefY + 3.5, WORLD.maxY - 1);
    }
    for (let i = 1; i < this.segPos.length; i++) {
      _v1.subVectors(this.segPos[i - 1], this.segPos[i]);
      const d = _v1.length();
      const rest = 0.95;
      if (d > rest) this.segPos[i].addScaledVector(_v1.normalize(), d - rest);
    }
    const hidden = this.mode === 'buried';
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].visible = !hidden || this.segPos[i].y > WORLD.reefY - 0.5;
      this.segments[i].position.copy(this.segPos[i]);
      this.segments[i].position.y += Math.sin(t * 3 + i * 0.7) * 0.05;
    }
    // skull faces travel direction
    if (this.vel.lengthSq() > 0.05) {
      this.segments[0].rotation.z = Math.atan2(this.vel.y, this.vel.x);
    }
    this.pos.copy(head);
    this.weakPos.copy(head);
    this.eye.visible = !hidden;
    if (this.vel.lengthSq() > 0.01) {
      this.eye.position.copy(head).addScaledVector(_v1.copy(this.vel).normalize(), 0.9);
    } else {
      this.eye.position.copy(head);
    }
    this.vulnerable = this.damageMul() > 0;
    this.applyEye(t);

    // tail sweep — punishes hunting its back half
    if (this.tailCd <= 0 && this.mode === 'swim') {
      const tailIdx = Math.floor(this.segPos.length * 0.7);
      const tail = this.segPos[tailIdx];
      if (tail.distanceTo(player.pos) < 3.6) {
        this.tailCd = 5;
        spawnTelegraph(tail.clone(), 4.6, 0.7, (p) => {
          spawnShock(p, 5.2, 14);
          if (player.invuln <= 0 && p.distanceTo(player.pos) < 4.8) {
            _v1.subVectors(player.pos, p).normalize();
            hurtPlayer(4, _v1, 1.3);
          }
        });
      }
    }

    if (player.invuln <= 0 && !hidden) {
      for (let i = 0; i < this.segPos.length; i++) {
        if (this.segPos[i].distanceTo(player.pos) < (i === 0 ? 1.3 : 0.85)) {
          _v1.subVectors(player.pos, this.segPos[i]).normalize();
          hurtPlayer(4, _v1, 1);
          break;
        }
      }
    }
  }
  dispose() {
    super.dispose();
    for (const m of this.segments) scene.remove(m);
    scene.remove(this.eye);
  }
}

// THE HOLLOW CHOIR — a bell-bodied predator with five grasping limbs.
// Slams are telegraphed at your position; a limb left stuck after a slam
// leaves the core exposed. Otherwise attacks only chip it.
class Choir extends Boss {
  constructor(c) {
    super(c);
    const s = this.s = 1.35 + c.tier * 0.18;
    this.bell = new THREE.Mesh(new THREE.SphereGeometry(1.7 * s, 20, 16), urchinMat);
    this.bell.scale.y = 0.8;
    // crown of spikes
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18 * s, 1.0 * s, 5), urchinMat);
      const a = (i / 6) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 1.2 * s, 1.2 * s, Math.sin(a) * 0.5 * s);
      spike.rotation.z = -Math.cos(a) * 0.5;
      this.bell.add(spike);
    }
    // exposed core beneath the bell
    this.eye = makeEye(1.25);
    this.eye.position.set(0, -1.15 * s, 0.4);
    this.group.add(this.bell, this.eye);
    this.bodyRadius = 1.75 * s;
    this.weakRadius = 1.7;
    // five limbs — follow-the-leader chains, same math as the player's tendrils
    this.limbs = [];
    for (let li = 0; li < 5; li++) {
      const nodes = [];
      const meshes = [];
      for (let i = 0; i < 8; i++) {
        const r = Math.max(0.34 * s * (1 - i / 10), 0.12);
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 10), urchinMat);
        scene.add(m);
        meshes.push(m);
        nodes.push(this.pos.clone());
      }
      this.limbs.push({
        nodes, meshes,
        baseAngle: Math.PI + (li - 2) * 0.55, // hang beneath the bell
        state: 'idle', // idle | slamming | stuck | sweeping
        stateT: 0,
        target: new THREE.Vector3(),
        phase: rand(0, Math.PI * 2),
      });
    }
    this.exposed = 0; // seconds of open weak point remaining
    this.minions = [];
  }
  damageMul() {
    if (this.dead) return 0;
    return this.exposed > 0 ? 1 : 0.3; // chip damage unless a limb is stuck
  }
  spawnMinion() {
    if (this.cfg.tier < 2 || this.minions.length >= this.cfg.tier) return;
    const m = new THREE.Mesh(urchinGeo, urchinMat);
    m.scale.setScalar(0.72);
    scene.add(m);
    this.minions.push({
      mesh: m,
      pos: this.pos.clone().add(new THREE.Vector3(rand(-2, 2), rand(-2, 2), 0)),
      vel: new THREE.Vector3(),
    });
  }
  update(dt, t) {
    const s = this.s;
    this.exposed = Math.max(0, this.exposed - dt);
    // hovers above the player, keeping slam range
    _v1.set(player.pos.x, Math.min(player.pos.y + 7, WORLD.maxY - 3), 0);
    _v2.subVectors(_v1, this.pos);
    this.vel.addScaledVector(_v2.normalize(), 1.6 * this.cfg.speed * this.farBoost() * dt);
    this.vel.multiplyScalar(Math.pow(0.25, dt));
    this.pos.addScaledVector(this.vel, dt);
    this.clampPos();
    this.group.position.copy(this.pos);
    this.bell.rotation.y += dt * 0.4;
    this.weakPos.copy(this.pos).add(_v3.set(0, -1.15 * s, 0));
    this.vulnerable = this.exposed > 0;
    this.applyEye(t);

    // limb behaviors
    this.attackT += dt;
    if (this.attackT > 3.2 / this.cfg.speed) {
      this.attackT = 0;
      const idle = this.limbs.filter((l) => l.state === 'idle');
      if (idle.length) {
        const limb = idle[Math.floor(Math.random() * idle.length)];
        limb.state = 'slamming';
        limb.stateT = 0;
        limb.target.copy(player.pos);
        spawnTelegraph(player.pos.clone(), 3.4, 0.95, (p) => {
          spawnShock(p, 5, 13);
          if (player.invuln <= 0 && p.distanceTo(player.pos) < 3) {
            _v1.subVectors(player.pos, p);
            if (_v1.lengthSq() < 0.01) _v1.set(0, 1, 0);
            hurtPlayer(5, _v1.normalize(), 1.2);
          }
          limb.state = 'stuck';
          limb.stateT = 0;
          limb.target.copy(p);
          this.exposed = 2.6; // the opening
          spawnRing(this.weakPos, 0xffd98c, 4, 0.7);
        });
      }
      if (Math.random() < 0.4) this.spawnMinion();
    }
    for (const limb of this.limbs) {
      limb.stateT += dt;
      if (limb.state === 'stuck' && limb.stateT > 2.6) { limb.state = 'idle'; limb.stateT = 0; }
      // head node target
      if (limb.state === 'idle') {
        limb.phase += dt;
        _v1.set(
          this.pos.x + Math.cos(limb.baseAngle + Math.sin(limb.phase * 0.9) * 0.4) * 3.4 * s,
          this.pos.y + Math.sin(limb.baseAngle + Math.cos(limb.phase * 0.7) * 0.3) * 3.4 * s,
          0
        );
      } else {
        _v1.copy(limb.target);
      }
      const tip = limb.nodes[limb.nodes.length - 1];
      tip.lerp(_v1, Math.min(1, dt * (limb.state === 'slamming' ? 3 : 6)));
      // root pinned to the bell rim
      limb.nodes[0].copy(this.pos).add(_v2.set(Math.cos(limb.baseAngle) * 1.2 * s, Math.sin(limb.baseAngle) * 1.2 * s, 0));
      // relax middle nodes between root and tip
      for (let i = 1; i < limb.nodes.length - 1; i++) {
        const k = i / (limb.nodes.length - 1);
        _v2.lerpVectors(limb.nodes[0], tip, k);
        _v2.y += Math.sin(t * 2.4 + limb.phase + k * 4) * 0.5 * (1 - Math.abs(k - 0.5) * 2) * 2;
        limb.nodes[i].lerp(_v2, Math.min(1, dt * 8));
      }
      for (let i = 0; i < limb.meshes.length; i++) limb.meshes[i].position.copy(limb.nodes[i]);
      // limb contact — tips hurt while slamming
      if (player.invuln <= 0 && limb.state !== 'stuck') {
        if (tip.distanceTo(player.pos) < 0.9) {
          _v1.subVectors(player.pos, tip).normalize();
          hurtPlayer(3, _v1, 0.8);
        }
      }
    }

    // minions
    for (let i = this.minions.length - 1; i >= 0; i--) {
      const mo = this.minions[i];
      _v1.subVectors(player.pos, mo.pos).normalize();
      mo.vel.addScaledVector(_v1, 2.6 * dt);
      mo.vel.multiplyScalar(Math.pow(0.25, dt));
      mo.pos.addScaledVector(mo.vel, dt);
      mo.mesh.position.copy(mo.pos);
      mo.mesh.rotation.z += dt;
      if (player.dashT > 0 && mo.pos.distanceTo(player.pos) < 1.1) {
        spawnBurst(mo.pos, COL.red, 16, 3.5);
        scene.remove(mo.mesh);
        this.minions.splice(i, 1);
        AudioSys.chime(4);
        continue;
      }
      if (player.invuln <= 0 && mo.pos.distanceTo(player.pos) < 0.95) {
        _v1.subVectors(player.pos, mo.pos).normalize();
        hurtPlayer(3, _v1, 0.7);
      }
    }
    this.contactCheck();
  }
  dispose() {
    super.dispose();
    for (const limb of this.limbs) for (const m of limb.meshes) scene.remove(m);
    for (const mo of this.minions) scene.remove(mo.mesh);
    this.minions.length = 0;
  }
}

class Lure extends Boss {
  constructor(c) {
    super(c);
    this.body = new THREE.Mesh(
      new THREE.SphereGeometry(1.7 + c.tier * 0.2, 24, 24),
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: { uTime: { value: 0 }, uReveal: { value: 0.12 } },
        vertexShader: `
          varying vec3 vN;
          varying vec3 vView;
          void main() {
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          uniform float uTime;
          uniform float uReveal;
          varying vec3 vN;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.6);
            vec3 col = mix(vec3(0.002, 0.001, 0.006), vec3(0.7, 0.15, 0.3), rim * (0.25 + uReveal));
            gl_FragColor = vec4(col, 0.55 + uReveal * 0.45);
          }`,
      })
    );
    this.lure = new THREE.Group();
    const lureCore = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd98c })
    );
    const lureGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softGlowTex, color: 0xffd98c, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    lureGlow.scale.setScalar(1.6);
    this.lure.add(lureCore, lureGlow);
    // antenna stalk holding the lure — the fishing rod
    this.stalk = new THREE.Mesh(new THREE.ConeGeometry(0.06, 3.2, 5), urchinMat);
    this.stalk.geometry.translate(0, 1.6, 0);
    // tail fin
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 4), urchinMat);
    tail.scale.z = 0.2;
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -(1.7 + c.tier * 0.2) - 0.7;
    this.eye = makeEye(1.0);
    this.eye.visible = false;
    this.group.add(this.body, this.stalk, tail, this.lure, this.eye);
    this.bodyRadius = 1.7 + c.tier * 0.2;
    this.weakRadius = 2.1;
    this.mode = 'stalk'; // p1: stalk | lunge | tired — p2: cast | screamWind | exhaust
    this.modeT = 0;
    this.vulnerable = false;
    this.phase = 1;
    this.hasP2 = c.tier >= 1; // deeper lures shed their skin at half health
    this.pos.y = rand(2, 8);
  }
  damageMul() {
    if (this.dead) return 0;
    if (this.phase === 1) {
      if (this.mode === 'tired') return 1;
      if (this.mode === 'stalk') return 0.25; // chip through the dark
      return 0;
    }
    if (this.mode === 'exhaust') return 1;
    if (this.mode === 'cast') return 0.25;
    return 0; // scream wind-up is armored
  }
  enterP2() {
    this.phase = 2;
    this.mode = 'cast';
    this.modeT = 0;
    this.body.material.uniforms.uReveal.value = 0.9;
    this.lure.visible = false;
    this.stalk.visible = false;
    announce('IT SHEDS THE DISGUISE', this.cfg.bossName, 2600);
    spawnRing(this.pos, 0xff4d6b, 14, 1.2);
    AudioSys.roar();
    shake = 0.9;
  }
  update(dt, t) {
    this.modeT += dt;
    this.body.material.uniforms.uTime.value = t;
    if (this.hasP2 && this.phase === 1 && this.hp <= this.maxHp * 0.55) this.enterP2();

    if (this.phase === 1) {
      if (this.mode === 'stalk') {
        _v1.subVectors(player.pos, this.pos).normalize();
        this.vel.addScaledVector(_v1, 1.0 * this.cfg.speed * this.farBoost() * dt);
        this.vel.multiplyScalar(Math.pow(0.25, dt));
        this.pos.addScaledVector(this.vel, dt);
        this.lure.position.set(
          _v1.x * (this.bodyRadius + 1.9),
          _v1.y * (this.bodyRadius + 1.9) + Math.sin(t * 2.2) * 0.3,
          0
        );
        this.stalk.rotation.z = Math.atan2(this.lure.position.y, this.lure.position.x) - Math.PI / 2;
        this.body.material.uniforms.uReveal.value =
          Math.max(0.10, this.body.material.uniforms.uReveal.value - dt * 0.4);
        _v2.copy(this.pos).add(this.lure.position);
        if (_v2.distanceTo(player.pos) < 3.0) {
          this.mode = 'lunge';
          this.modeT = 0;
          _v1.subVectors(player.pos, this.pos).normalize();
          this.vel.copy(_v1).multiplyScalar(16 * Math.min(this.cfg.speed, 1.7));
          this.body.material.uniforms.uReveal.value = 1;
          AudioSys.roar();
        }
      } else if (this.mode === 'lunge') {
        this.pos.addScaledVector(this.vel, dt);
        this.vel.multiplyScalar(Math.pow(0.12, dt));
        if (this.modeT > 0.8) { this.mode = 'tired'; this.modeT = 0; }
      } else if (this.mode === 'tired') {
        this.vel.multiplyScalar(Math.pow(0.2, dt));
        this.pos.addScaledVector(this.vel, dt);
        this.body.material.uniforms.uReveal.value = 0.85;
        if (this.modeT > 3.2) { this.mode = 'stalk'; this.modeT = 0; }
      }
    } else {
      // PHASE 2 — the true creature: void pools, bolt spirals, the scream
      this.body.material.uniforms.uReveal.value = 0.9;
      if (this.mode === 'cast') {
        // circles the player while conjuring
        _v1.set(player.pos.x + Math.cos(t * 0.55) * 10, player.pos.y + Math.sin(t * 0.85) * 6, 0);
        _v2.subVectors(_v1, this.pos).normalize();
        this.vel.addScaledVector(_v2, 2.4 * dt);
        this.vel.multiplyScalar(Math.pow(0.3, dt));
        this.pos.addScaledVector(this.vel, dt);
        this.attackT += dt;
        if (this.attackT > 2.2) {
          this.attackT = 0;
          // void pool beneath the player
          spawnTelegraph(player.pos.clone(), 3.4, 1.1, (p) => spawnHazard(p, 3.2, 4.5));
          // spiral of bolts
          const n = 5 + this.cfg.tier;
          for (let i = 0; i < n; i++) {
            const a = t + (i / n) * Math.PI * 2;
            spawnBolt(this.pos, _v3.set(Math.cos(a), Math.sin(a), 0).multiplyScalar(4.6));
          }
        }
        if (this.modeT > 6.5) {
          this.mode = 'screamWind';
          this.modeT = 0;
          spawnTelegraph(this.pos.clone(), 11, 1.5, null, 0xff2d55);
          AudioSys.thud();
        }
      } else if (this.mode === 'screamWind') {
        this.vel.multiplyScalar(Math.pow(0.1, dt));
        if (this.modeT > 1.5) {
          this.mode = 'exhaust';
          this.modeT = 0;
          spawnShock(this.pos, 13, 11);
          spawnRing(this.pos, 0xff4d6b, 13, 1.1);
          AudioSys.roar();
        }
      } else if (this.mode === 'exhaust') {
        // spent — wide open. burn it.
        this.vel.multiplyScalar(Math.pow(0.2, dt));
        this.pos.addScaledVector(this.vel, dt);
        if (this.modeT > 4.2) { this.mode = 'cast'; this.modeT = 0; }
      }
    }

    this.clampPos();
    this.group.position.copy(this.pos);
    this.weakPos.copy(this.pos);
    this.eye.position.set(0, this.bodyRadius * 0.5, 0.6);
    this.eye.visible = this.damageMul() >= 1;
    this.vulnerable = this.damageMul() >= 1;
    this.applyEye(t);
    const touching = this.pos.distanceTo(player.pos) < this.bodyRadius + 0.3;
    if (player.invuln <= 0 && touching && (this.phase === 2 || this.mode !== 'stalk')) {
      _v1.subVectors(player.pos, this.pos).normalize();
      hurtPlayer(this.mode === 'lunge' ? 7 : 4, _v1, this.mode === 'lunge' ? 1.4 : 1);
    }
  }
}

const BOSS_CLASSES = { dredger: Dredger, reliquary: Reliquary, undertow: Undertow, choir: Choir, lure: Lure };

// ————— level flow —————
function setupLevel(n, { silent = false } = {}) {
  level = n;
  cfg = levelConfig(n);
  setPaletteTarget(cfg.palette);
  setUrchinCount(cfg.urchins);
  for (const c of clusters) c.reset();
  clearBolts();
  clearBossFx();
  stopTether(false);
  cancelCharge();
  if (boss) { boss.dispose(); boss = null; }
  AudioSys.setBossLayer(false);
  depthNumEl.textContent = `${n} / ${LEVELS}`;
  depthLabelEl.textContent = `DEPTH ${ROMAN[n - 1]} · ${cfg.name.toUpperCase()}`;
  bossBarEl.classList.remove('visible');
  try { localStorage.setItem(SAVE_KEY, String(n)); } catch (e) { /* private mode */ }
  if (!silent) {
    announce(`DEPTH ${ROMAN[n - 1]}`, cfg.name);
    setHint(`gather ${cfg.summonCost} lumens — something is listening`, 6000);
  }
  // new light unlocked at this depth?
  const newAb = ABILITIES.findIndex((a) => a.unlock === n);
  if (newAb > 0) {
    selectedAbility = newAb;
    setTimeout(() => {
      announce('A NEW LIGHT', ABILITIES[newAb].name.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase()), 3000);
      setHint(`${ABILITIES[newAb].name.toLowerCase()} — press ${newAb + 1} to switch attacks`, 7000);
      AudioSys.victory();
    }, silent ? 400 : 3000);
  }
  refreshAbilityBar();
}

function summonBoss() {
  const B = BOSS_CLASSES[cfg.arch];
  boss = new B(cfg);
  state = 'boss';
  AudioSys.roar();
  AudioSys.setBossLayer(true);
  bossNameEl.textContent = cfg.bossName.toUpperCase();
  bossCostEl.textContent = BOSS_HINTS[cfg.arch];
  updateBossBar();
  bossBarEl.classList.add('visible');
  announce('IT WAKES', cfg.bossName, 2200);
  setHint('your light is your weapon — aim for the golden glow', 5200);
  shake = 0.8;
}

function onBossDefeated() {
  bossesFelled++;
  state = 'victory';
  stateTimer = 0;
  stopTether(false);
  cancelCharge();
  clearBossFx();
  AudioSys.setBossLayer(false);
  bossBarEl.classList.remove('visible');
  spawnBurst(boss.pos, COL.cyan, 60, 7);
  spawnBurst(boss.pos, COL.violet, 40, 5);
  spawnRing(boss.pos, 0x9df5e8, 30, 1.8);
  for (const c of clusters) c.beginBloom(elapsed);
  AudioSys.roar();
  AudioSys.victory();
  boss.dispose();
  boss = null;
  if (level < LEVELS) setHint('the water exhales — descend', 3600);
  else setHint('');
}

// ————— UI wiring —————
const isTouch = window.matchMedia('(pointer: coarse)').matches;
if (isTouch) {
  const ems = document.querySelectorAll('.controls-hint em');
  if (ems[0]) ems[0].textContent = 'your finger';
  if (ems[1]) ems[1].textContent = 'hold to attack';
  if (ems[3]) ems[3].textContent = 'the dash button';
  document.getElementById('dashBtn').classList.remove('hidden');
}

// ————— ability bar —————
const AB_ICONS = [
  // pulse — a burst ring
  '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="7" opacity="0.7"/><circle cx="12" cy="12" r="10.4" opacity="0.32"/>',
  // projectile — a dart in flight
  '<path d="M2.5 12h11" opacity="0.5"/><path d="M9 12h5.5"/><path d="M13 7.5l7.5 4.5-7.5 4.5z" fill="currentColor" stroke="none"/>',
  // tether — two bound nodes
  '<circle cx="4.6" cy="12" r="2.1" fill="currentColor" stroke="none"/><circle cx="19.4" cy="12" r="2.1" fill="currentColor" stroke="none"/><path d="M6.8 12c2.4-3.4 3.6 3.4 6 0s2.4-1.7 4.4 0"/>',
  // void charge — gathering star
  '<circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/><path d="M12 2.6v5M12 16.4v5M2.6 12h5M16.4 12h5" /><path d="M5.4 5.4l3 3M15.6 15.6l3 3M18.6 5.4l-3 3M8.4 15.6l-3 3" opacity="0.5"/>',
];
const abilityBarEl = document.getElementById('abilityBar');
const abilityNameEl = document.getElementById('abilityName');
const abilitySlots = [];
{
  ABILITIES.forEach((ab, i) => {
    const el = document.createElement('div');
    el.className = 'ab-slot';
    el.innerHTML =
      `<div class="ab-cd"></div>` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${AB_ICONS[i]}</svg>` +
      `<span class="ab-key">${i + 1}</span>` +
      `<span class="ab-lock">${ab.roman}</span>`;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      selectAbility(i);
    });
    abilityBarEl.appendChild(el);
    abilitySlots.push({ el, cdEl: el.querySelector('.ab-cd') });
  });
}
function refreshAbilityBar() {
  ABILITIES.forEach((ab, i) => {
    const slot = abilitySlots[i];
    slot.el.classList.toggle('locked', !abilityUnlocked(i));
    slot.el.classList.toggle('selected', i === selectedAbility && abilityUnlocked(i));
  });
  abilityNameEl.textContent = ABILITIES[selectedAbility].name;
}
function updateAbilityBarCds() {
  ABILITIES.forEach((ab, i) => {
    const slot = abilitySlots[i];
    let k = ab.cdMax > 0 ? ab.cd / ab.cdMax : 0;
    if (ab.id === 'charge' && combat.charging) k = 1 - combat.chargeT / CHARGE_FULL;
    slot.cdEl.style.height = `${Math.round(k * 100)}%`;
    if (ab.id === 'tether') slot.el.classList.toggle('active', combat.tetherOn);
    if (ab.id === 'charge') slot.el.classList.toggle('active', combat.charging);
  });
}
document.getElementById('dashBtn').addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  e.preventDefault();
  tryDash();
});

{
  const el = document.getElementById('titleWord');
  const word = el.textContent;
  el.textContent = '';
  [...word].forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'ch';
    span.textContent = ch;
    span.style.animationDelay = `${0.25 + i * 0.09}s`;
    el.appendChild(span);
  });
  document.querySelectorAll('.reveal').forEach((r, i) => {
    r.style.animationDelay = `${0.9 + i * 0.18}s`;
  });
}

let savedLevel = 1;
try { savedLevel = Math.min(LEVELS, Math.max(1, parseInt(localStorage.getItem(SAVE_KEY) || '1', 10) || 1)); } catch (e) { /* ignore */ }
const continueBtn = document.getElementById('continueBtn');
if (savedLevel > 1) {
  continueBtn.textContent = `CONTINUE — DEPTH ${ROMAN[savedLevel - 1]}`;
  continueBtn.classList.remove('hidden');
}

function beginRun(startLevel) {
  AudioSys.init();
  if (AudioSys.ctx && AudioSys.ctx.state === 'suspended') AudioSys.ctx.resume();
  document.getElementById('titleScreen').classList.add('dismissed');
  hud.classList.remove('hidden');
  requestAnimationFrame(() => hud.classList.add('visible'));
  state = 'gather';
  startTime = elapsed;
  AudioSys.chord();
  setupLevel(startLevel, { silent: true });
  announce(`DEPTH ${ROMAN[startLevel - 1]}`, LEVEL_NAMES[startLevel - 1]);
  setHint(
    (isTouch ? 'drift with your finger' : 'drift with your cursor') +
    ` — gather ${levelConfig(startLevel).summonCost} lumens`,
    6500
  );
}
document.getElementById('startBtn').addEventListener('click', () => beginRun(1));
continueBtn.addEventListener('click', () => beginRun(savedLevel));
document.getElementById('againBtn').addEventListener('click', () => {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  location.reload();
});

document.getElementById('soundToggle').addEventListener('click', () => {
  AudioSys.muted = !AudioSys.muted;
  if (AudioSys.master) {
    AudioSys.master.gain.linearRampToValueAtTime(
      AudioSys.muted ? 0 : 0.5, AudioSys.ctx.currentTime + 0.2
    );
  }
  document.getElementById('soundOnIcon').style.display = AudioSys.muted ? 'none' : '';
  document.getElementById('soundOffIcon').style.display = AudioSys.muted ? '' : 'none';
});

// ————— input —————
const mouseNdc = new THREE.Vector2(0, 0.2);
window.addEventListener('pointermove', (e) => {
  mouseNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
});
// left press = attack (hold for tether / charge) · right-click or space = dash
window.addEventListener('pointerdown', (e) => {
  mouseNdc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.ab-slot')) return;
  if (e.pointerType === 'mouse' && e.button === 2) { tryDash(); return; }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  beginAttack();
});
window.addEventListener('pointerup', () => endAttack());
window.addEventListener('blur', () => endAttack());
window.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('a')) e.preventDefault();
});
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
    e.preventDefault();
    tryDash();
    return;
  }
  if (e.key >= '1' && e.key <= '4') { selectAbility(parseInt(e.key, 10) - 1); return; }
  if (e.key === 'q' || e.key === 'Q') cycleAbility(-1);
  if (e.key === 'e' || e.key === 'E') cycleAbility(1);
});

function selectAbility(i, silent = false) {
  if (i < 0 || i >= ABILITIES.length) return;
  if (!abilityUnlocked(i)) {
    setHint(`${ABILITIES[i].name.toLowerCase()} wakes at depth ${ABILITIES[i].roman}`, 2400);
    const slot = abilitySlots[i];
    if (slot) {
      slot.el.classList.remove('denied');
      void slot.el.offsetWidth;
      slot.el.classList.add('denied');
    }
    return;
  }
  if (i === selectedAbility) return;
  // switching never resets cooldowns — but hold-states end cleanly
  stopTether(false);
  cancelCharge();
  selectedAbility = i;
  if (!silent) AudioSys.note(620 + i * 130, { vol: 0.06, decay: 0.35, plain: true });
  refreshAbilityBar();
}
function cycleAbility(dir) {
  for (let step = 1; step <= ABILITIES.length; step++) {
    const i = (selectedAbility + dir * step + ABILITIES.length * 4) % ABILITIES.length;
    if (abilityUnlocked(i)) { selectAbility(i); return; }
  }
}

function tryDash() {
  if (state !== 'gather' && state !== 'boss' && state !== 'victory') return;
  if (player.dashCd > 0) return;
  if (combat.charging) return; // committed to the void
  mouseToWorld(_v1);
  _v2.subVectors(_v1, player.pos);
  if (_v2.lengthSq() < 0.01) _v2.copy(player.vel);
  if (_v2.lengthSq() < 0.01) _v2.set(1, 0, 0);
  _v2.normalize();
  player.vel.addScaledVector(_v2, 30);
  player.dashT = 0.34;
  player.dashCd = 0.95;
  player.invuln = Math.max(player.invuln, 0.26); // dodge grace
  spawnRing(player.pos, 0x9df5e8, 2.6, 0.4);
  AudioSys.dash();
}

const _ray = new THREE.Vector3();
function mouseToWorld(out) {
  _ray.set(mouseNdc.x, mouseNdc.y, 0.5).unproject(camera);
  _ray.sub(camera.position).normalize();
  const t = -camera.position.z / _ray.z;
  out.copy(camera.position).addScaledVector(_ray, t);
  return out;
}

// ————— core loop —————
const camTarget = new THREE.Vector3(0, 2, 18);
const lookTarget = new THREE.Vector3();

function update(dt) {
  elapsed += dt;
  const t = elapsed;
  const playing = state === 'gather' || state === 'boss' || state === 'victory';

  // player target
  if (state === 'title') {
    player.target.set(Math.sin(t * 0.13) * 11, 3.5 + Math.sin(t * 0.21 + 1.3) * 4, 0);
  } else {
    mouseToWorld(player.target);
    player.target.x = THREE.MathUtils.clamp(player.target.x, WORLD.minX, WORLD.maxX);
    player.target.y = THREE.MathUtils.clamp(player.target.y, WORLD.reefY + 0.8, WORLD.maxY);
  }

  // player physics
  player.dashT = Math.max(0, player.dashT - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  _v1.subVectors(player.target, player.pos);
  player.vel.addScaledVector(_v1, dt * (combat.charging ? 1.8 : 5.2)); // charging anchors you
  player.vel.multiplyScalar(Math.pow(0.045, dt));
  player.pos.addScaledVector(player.vel, dt);
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, WORLD.minX, WORLD.maxX);
  player.pos.y = THREE.MathUtils.clamp(player.pos.y, WORLD.reefY + 0.6, WORLD.maxY + 1);
  player.pos.z = 0;
  player.group.position.copy(player.pos);

  const chargeGlow = combat.charging ? 1 + (combat.chargeT / CHARGE_FULL) * 0.9 : 1;
  const dashGlow = (player.dashT > 0 ? 1.6 : 1) * chargeGlow;
  const pulse = (1 + Math.sin(t * 3.2) * 0.08 + Math.min(player.vel.length() * 0.02, 0.15)) * dashGlow;
  player.core.scale.setScalar(pulse);
  player.halo.scale.setScalar(2.5 * pulse + Math.min(player.carried, 18) * 0.035);
  if (player.invuln > 0) {
    player.invuln -= dt;
    const blink = Math.sin(t * 26) > 0 ? 1 : 0.25;
    player.core.material.opacity = blink;
    player.halo.material.opacity = 0.85 * blink;
  } else {
    player.core.material.opacity = 1;
    player.halo.material.opacity = Math.min(1, (0.62 + Math.sin(t * 3.2) * 0.08) * dashGlow);
  }

  for (const td of tendrils) td.update(dt, t);

  // spores
  for (let i = 0; i < SPORE_POOL; i++) {
    const s = spores[i];
    if (!s.alive) {
      _s.setScalar(0.0001);
      _m.compose(s.pos, _q, _s);
      sporeMesh.setMatrixAt(i, _m);
      continue;
    }
    s.pos.x += Math.sin(t * 0.4 + s.seed) * 0.15 * dt;
    s.pos.y += Math.cos(t * 0.33 + s.seed * 2) * 0.12 * dt;
    if (playing) {
      const d = s.pos.distanceTo(player.pos);
      if (d < 4.4) {
        _v1.subVectors(player.pos, s.pos).normalize();
        s.vel.addScaledVector(_v1, (1 - d / 4.4) * 34 * dt);
      }
      s.vel.multiplyScalar(Math.pow(0.02, dt));
      s.pos.addScaledVector(s.vel, dt);
      if (d < 1.05) {
        s.alive = false;
        s.respawnAt = t + rand(2.5, 6);
        player.carried++;
        totalCollected++;
        combo = t - lastCollect < 3.5 ? combo + 1 : 0;
        lastCollect = t;
        updateLumenHud();
        spawnBurst(s.pos, s.color, 12, 2.4);
        spawnRing(s.pos, 0xffe9bd, 2.6, 0.55);
        AudioSys.chime(combo);
      }
    }
    const sc = 1 + Math.sin(t * 2.1 + s.seed) * 0.22;
    _s.setScalar(sc);
    _m.compose(s.pos, _q, _s);
    sporeMesh.setMatrixAt(i, _m);
  }
  let aliveCount = 0;
  for (const s of spores) if (s.alive) aliveCount++;
  for (const s of spores) {
    if (aliveCount >= SPORE_ACTIVE) break;
    if (!s.alive && t > s.respawnAt) { spawnSpore(s); aliveCount++; }
  }
  sporeMesh.instanceMatrix.needsUpdate = true;

  // urchins
  urchinMat.uniforms.uTime.value = t;
  for (const u of urchins) {
    if (!u.active) continue;
    if (u.dead) {
      if (t > u.respawnAt) placeUrchin(u);
      continue;
    }
    u.vel.x += Math.sin(t * 0.21 + u.seed) * 0.35 * dt;
    u.vel.y += Math.cos(t * 0.17 + u.seed * 3) * 0.3 * dt;
    if (playing) {
      const d = u.pos.distanceTo(player.pos);
      if (d < 11 && d > 0.01) {
        _v1.subVectors(player.pos, u.pos).normalize();
        u.vel.addScaledVector(_v1, 0.9 * dt);
      }
    }
    u.vel.multiplyScalar(Math.pow(0.3, dt));
    u.pos.addScaledVector(u.vel, dt);
    u.pos.x = THREE.MathUtils.clamp(u.pos.x, WORLD.minX + 2, WORLD.maxX - 2);
    u.pos.y = THREE.MathUtils.clamp(u.pos.y, WORLD.reefY + 3, WORLD.maxY - 1);
    u.pos.z = THREE.MathUtils.clamp(u.pos.z, -1.5, 1.5);
    u.mesh.position.copy(u.pos);
    u.mesh.rotation.x += u.spin.x * dt;
    u.mesh.rotation.y += u.spin.y * dt;
    u.mesh.rotation.z += u.spin.z * dt;
    u.halo.material.opacity = 0.12 + 0.07 * Math.sin(t * 2.6 + u.seed);

    if (playing && u.pos.distanceTo(player.pos) < 1.35) {
      if (player.dashT > 0) {
        u.dead = true;
        u.mesh.visible = false;
        u.respawnAt = t + rand(6, 10);
        spawnBurst(u.pos, COL.red, 18, 4);
        spawnRing(u.pos, 0xff4d6b, 4.5, 0.55);
        AudioSys.chime(6);
        shake = Math.max(shake, 0.25);
      } else if (player.invuln <= 0) {
        _v1.subVectors(player.pos, u.pos).normalize();
        hurtPlayer(4, _v1, 1);
        u.vel.addScaledVector(_v1, -6);
      }
    }
  }

  // clusters
  for (const c of clusters) c.update(t, dt);

  // ————— level flow —————
  // a breath of calm before each terror — the summon needs both light and time
  if (state === 'gather') {
    stateTimer += dt;
    if (stateTimer > 3 && player.carried >= cfg.summonCost) summonBoss();
  }

  // bosses fight back; the player fights with abilities, not collision
  if (state === 'boss' && boss) boss.update(dt, t);
  updateAbilities(dt, t);
  updateTelegraphs(dt);
  updateHazards(dt);
  updateShocks(dt);

  if (state === 'victory') {
    stateTimer += dt;
    if (stateTimer > 2.6) {
      if (level >= LEVELS) {
        state = 'won';
        const dur = Math.round(t - startTime);
        document.getElementById('statTime').textContent =
          `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}`;
        document.getElementById('statMotes').textContent = totalCollected;
        document.getElementById('statBosses').textContent = bossesFelled;
        document.getElementById('statHits').textContent = hits;
        const ws = document.getElementById('winScreen');
        ws.classList.remove('hidden');
        requestAnimationFrame(() => ws.classList.add('visible'));
        hud.classList.remove('visible');
        try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
      } else {
        state = 'transition';
        stateTimer = 0;
        setupLevel(level + 1);
      }
    }
  }

  if (state === 'transition') {
    stateTimer += dt;
    if (stateTimer > 2.2) { state = 'gather'; stateTimer = 0; }
  }
  if (state === 'boss' && !boss) { state = 'gather'; stateTimer = 0; } // safety net

  if (state === 'won' && Math.random() < 0.12) {
    const cx = CLUSTER_XS[Math.floor(Math.random() * 7)];
    spawnBurst(
      new THREE.Vector3(cx + rand(-3, 3), WORLD.reefY + rand(1, 4), rand(-1, 1)),
      Math.random() < 0.5 ? COL.cyan : COL.violet, 3, 1.2, new THREE.Vector3(0, 2.8, 0)
    );
  }

  updateBursts(dt);
  updateRings(dt);
  updateBolts(dt, t);
  updatePalette(dt);

  // environment
  domeMat.uniforms.uTime.value = t;
  for (const child of rayGroup.children) {
    child.material.uniforms.uTime.value = t;
    child.rotation.z = child.userData.baseRot + Math.sin(t * child.userData.speed) * 0.02 * child.userData.sway * 10;
  }

  // camera
  shake = Math.max(0, shake - dt * 1.6);
  const followX = THREE.MathUtils.clamp(player.pos.x, WORLD.minX + 11, WORLD.maxX - 11);
  const followY = THREE.MathUtils.clamp(player.pos.y * 0.85 + 0.8, WORLD.reefY + 5.5, 11);
  camTarget.set(
    followX + mouseNdc.x * 0.8,
    followY + mouseNdc.y * 0.5,
    18 + Math.sin(t * 0.23) * 0.5
  );
  const cf = 1 - Math.pow(0.012, dt);
  camera.position.lerp(camTarget, cf);
  if (shake > 0) {
    camera.position.x += rand(-1, 1) * shake * 0.22;
    camera.position.y += rand(-1, 1) * shake * 0.22;
  }
  lookTarget.lerp(_v1.set(followX, followY - 1.2, 0), cf);
  camera.lookAt(lookTarget);
  dome.position.copy(camera.position);
}

function loop() {
  requestAnimationFrame(loop);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (slowmo > 0) { slowmo -= dt; dt *= 0.35; } // hitstop on boss strikes
  update(dt);
  composer.render();
}
loop();

// test/dev hook — only when ?debug is in the URL
if (location.search.includes('debug')) {
  window.__noc = {
    grant(n) { player.carried += n; updateLumenHud(); },
    killBoss() { if (boss) boss.takeDamage(99999, boss.pos); },
    hurtBoss(n) { if (boss) boss.takeDamage(n, boss.weakPos); },
    skipTo(n) { setupLevel(n); state = 'gather'; stateTimer = 0; },
    selectAbility(i) { selectAbility(i); },
    state: () => ({
      state, level, carried: player.carried,
      bossHp: boss ? Math.round(boss.hp * 10) / 10 : null,
      bossMax: boss ? boss.maxHp : null,
      bossMul: boss ? boss.damageMul(player.pos) : null,
      bossMode: boss ? (boss.mode || boss.phase || null) : null,
      felled: bossesFelled,
      playerPos: [player.pos.x, player.pos.y],
      weakPos: boss ? [boss.weakPos.x, boss.weakPos.y] : null,
      selected: selectedAbility,
      unlocked: ABILITIES.map((a) => level >= a.unlock),
      cds: ABILITIES.map((a) => Math.round(a.cd * 100) / 100),
      tether: combat.tetherOn,
      charging: combat.charging,
    }),
  };
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
