// Three.js rendering layer for Snakes, Dragons & Ladders. Rules live in
// @ebg/game-core (and the Rust/Wasm engine); this file only draws state.
//
// Layout: static scenery is created once by the `build*` methods; one `loop`
// drives creature bodies (vertices rewritten in place, never rebuilt), creature
// behaviour (looking, blinking, biting), pawn move segments, two particle pools,
// the jungle sway, the day/dusk/night cycle and the camera director. Everything
// is parented to `this.scene` so `dispose()` can release it in a single walk.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { JUMPS, squareToGrid, type Jump } from '@ebg/game-core';
import type { GraphicsSettings } from './performance-tier';

const SEAT_HEX = [0xf43f5e, 0x38bdf8, 0xfacc15, 0x4ade80];
const TILE_COLORS = ['#fde68a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#ddd6fe'];
const CONFETTI_HEX = [0xf43f5e, 0x38bdf8, 0xfacc15, 0x4ade80, 0xa78bfa, 0xffffff];

export type BiteKind = 'snake' | 'croc' | 'dragon';

interface CreatureSpec {
  body: readonly [number, number];
  radius: number;
  emoji: string;
  /** Vertical squash of the body and skull (crocs are flat). */
  flat: number;
}

const CREATURE: Record<BiteKind, CreatureSpec> = {
  snake: { body: [0x22c55e, 0x14532d], radius: 0.16, emoji: '🐍', flat: 1 },
  croc: { body: [0x65a30d, 0x365314], radius: 0.2, emoji: '🐊', flat: 0.55 },
  dragon: { body: [0xef4444, 0xf59e0b], radius: 0.24, emoji: '🐉', flat: 1 },
};

// Durations in seconds: the loop runs on THREE.Timer's elapsed clock.
const HOP_S = 0.26;
const PAUSE_S = 0.4;
const SLIDE_S = 1.1;
const BITE_S = 0.9;
const SPIN_S = 1.4;
const RESET_S = 0.6;
const DAY_CYCLE_S = 120;

// Body tube resolution: 65 rings x 11 verts, rewritten in place on update.
const RINGS = 64;
const RADIAL = 10;
const RING_VERTS = RADIAL + 1;
const RING_COS = Array.from({ length: RING_VERTS }, (_, s) => Math.cos((s / RADIAL) * Math.PI * 2));
const RING_SIN = Array.from({ length: RING_VERTS }, (_, s) => Math.sin((s / RADIAL) * Math.PI * 2));

const UP = new THREE.Vector3(0, 1, 0);
const BOARD_CENTRE = new THREE.Vector3(0, 0, 0.3);
const HOME_DIR = new THREE.Vector3(0, 12, 6.2).normalize();

/** World-space centre of a square. Square 0 is the start area left of square 1. */
export function squareToWorld(square: number, y = 0): THREE.Vector3 {
  if (square <= 0) return new THREE.Vector3(-5.9, y, 4.5);
  const { row, col } = squareToGrid(square);
  return new THREE.Vector3(col - 4.5, y, 4.5 - row);
}

/** Deterministic PRNG so the jungle layout is identical across detail toggles. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- day cycle

interface SkyFrame {
  at: number;
  sky: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  ambient: number;
  torch: number;
  firefly: number;
}

type SkyTuple = readonly [sky: number, sun: number, sunIntensity: number, hemiSky: number, hemiGround: number, ambient: number, torch: number, firefly: number];

function skyFrame(at: number, [sky, sun, sunIntensity, hemiSky, hemiGround, ambient, torch, firefly]: SkyTuple): SkyFrame {
  return { at, sky: new THREE.Color(sky), sun: new THREE.Color(sun), sunIntensity, hemiSky: new THREE.Color(hemiSky), hemiGround: new THREE.Color(hemiGround), ambient, torch, firefly };
}

// Ambient / hemisphere never drop far so the tile numbers stay readable at night.
const DAY: SkyTuple = [0x8ec5e8, 0xfff4d6, 1.6, 0xbfdcff, 0x3b5a2a, 0.75, 0.25, 0.15];
const DUSK: SkyTuple = [0xe8905a, 0xffa057, 1.1, 0xffb27d, 0x2b3a22, 0.65, 0.8, 0.6];
const NIGHT: SkyTuple = [0x101a33, 0x7f9cf5, 0.6, 0x3b4a8a, 0x0b1a10, 0.6, 1.3, 1];
const DAWN: SkyTuple = [0xe9b4bf, 0xffd1a3, 1.2, 0xf6c7d0, 0x2f4a24, 0.7, 0.6, 0.4];
const SKY_FRAMES: SkyFrame[] = [skyFrame(0, DAY), skyFrame(0.34, DAY), skyFrame(0.48, DUSK), skyFrame(0.6, NIGHT), skyFrame(0.84, NIGHT), skyFrame(0.93, DAWN), skyFrame(1, DAY)];

// ---------------------------------------------------------- particle pool

interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  color: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
  /** Size multiplier gained over the lifetime (negative shrinks). */
  grow?: number;
}

/**
 * Fixed-capacity point sprites with per-particle size, colour and alpha. One
 * draw call, no allocation after construction; dead slots are recycled in a ring.
 */
class ParticlePool {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly grow: Float32Array;
  private readonly size0: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly attrs: THREE.BufferAttribute[];
  private readonly uScale = { value: 300 };
  private readonly tint = new THREE.Color();
  private cursor = 0;
  private live = 0;
  private dirty = false;

  constructor(
    readonly capacity: number,
    additive: boolean,
  ) {
    const n = Math.max(1, capacity);
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.alpha0 = new Float32Array(n);

    const geo = new THREE.BufferGeometry();
    this.attrs = [
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
      new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage),
      new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage),
      new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage),
    ];
    geo.setAttribute('position', this.attrs[0]!);
    geo.setAttribute('aColor', this.attrs[1]!);
    geo.setAttribute('aAlpha', this.attrs[2]!);
    geo.setAttribute('aSize', this.attrs[3]!);

    const material = new THREE.ShaderMaterial({
      uniforms: { uScale: this.uScale },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        uniform float uScale;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          if (vAlpha <= 0.01) discard;
          vec2 d = gl_PointCoord - 0.5;
          float r2 = dot(d, d) * 4.0;
          if (r2 > 1.0) discard;
          gl_FragColor = vec4(vColor, vAlpha * (1.0 - r2));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, material);
    // Bounds change every frame and the pool is tiny; skip culling entirely.
    this.points.frustumCulled = false;
  }

  /** World-units → pixels factor for point sizes (viewport height / 2·tan(fov/2)). */
  setScale(pxPerUnit: number) {
    this.uScale.value = pxPerUnit;
  }

  emit(p: ParticleSpec) {
    if (this.capacity === 0) return;
    const i = this.cursor;
    this.cursor = (i + 1) % this.capacity;
    if (this.age[i]! >= this.life[i]!) this.live++;
    const i3 = i * 3;
    this.pos[i3] = p.x;
    this.pos[i3 + 1] = p.y;
    this.pos[i3 + 2] = p.z;
    this.vel[i3] = p.vx;
    this.vel[i3 + 1] = p.vy;
    this.vel[i3 + 2] = p.vz;
    this.age[i] = 0;
    this.life[i] = Math.max(0.01, p.life);
    this.grav[i] = p.gravity ?? 0;
    this.drag[i] = p.drag ?? 0;
    this.grow[i] = p.grow ?? 0;
    this.size0[i] = p.size;
    this.size[i] = p.size;
    this.alpha0[i] = p.alpha ?? 1;
    this.alpha[i] = this.alpha0[i]!;
    this.tint.setHex(p.color);
    this.col[i3] = this.tint.r;
    this.col[i3 + 1] = this.tint.g;
    this.col[i3 + 2] = this.tint.b;
    this.dirty = true;
  }

  update(dt: number) {
    if (!this.live && !this.dirty) return;
    let live = 0;
    for (let i = 0; i < this.capacity; i++) {
      const l = this.life[i]!;
      const prev = this.age[i]!;
      if (prev >= l) continue;
      const a = prev + dt;
      this.age[i] = a;
      if (a >= l) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      live++;
      const i3 = i * 3;
      const damp = Math.max(0, 1 - this.drag[i]! * dt);
      this.vel[i3 + 1]! += this.grav[i]! * dt;
      this.vel[i3]! *= damp;
      this.vel[i3 + 1]! *= damp;
      this.vel[i3 + 2]! *= damp;
      this.pos[i3]! += this.vel[i3]! * dt;
      this.pos[i3 + 1]! += this.vel[i3 + 1]! * dt;
      this.pos[i3 + 2]! += this.vel[i3 + 2]! * dt;
      const k = a / l;
      this.alpha[i] = this.alpha0[i]! * (1 - k);
      this.size[i] = this.size0[i]! * Math.max(0, 1 + k * this.grow[i]!);
    }
    this.live = live;
    this.dirty = false;
    for (const attr of this.attrs) attr.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- types

interface Creature {
  jump: Jump;
  kind: BiteKind;
  spec: CreatureSpec;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  positions: THREE.BufferAttribute;
  normals: THREE.BufferAttribute;
  controlBase: THREE.Vector3[];
  curve: THREE.CatmullRomCurve3;
  perp: THREE.Vector3;
  phase: number;
  /** Placed at the head square, facing away from the body. */
  head: THREE.Group;
  /** Child of `head`; carries look / lunge animation. Local +z is forward. */
  pivot: THREE.Group;
  yaw: number;
  pitch: number;
  eyes: THREE.Group[];
  blinks: boolean;
  nextBlink: number;
  blinkStart: number;
  tongue: THREE.Group | null;
  nextFlick: number;
  flickStart: number;
  jaw: THREE.Group | null;
  wings: { root: THREE.Group; left: THREE.Group; right: THREE.Group } | null;
  glowMats: THREE.MeshStandardMaterial[];
  fireLight: THREE.PointLight | null;
  smokeAt: number;
  /** Elapsed time when the current bite started, or -1 when idle. */
  biteStart: number;
  biteFired: boolean;
}

interface Ladder {
  jump: Jump;
  rungMat: THREE.MeshStandardMaterial;
  glow: number;
  target: number;
}

interface Segment {
  points: THREE.Vector3[];
  duration: number;
  hop: boolean;
  /** Cinematic zoom while this segment plays (creature slides). */
  zoom?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

interface Pawn {
  group: THREE.Group;
  queue: Segment[];
  current: (Segment & { start: number }) | null;
  square: number;
  landAt: number;
  spinUntil: number;
}

interface Tree {
  x: number;
  z: number;
  height: number;
  palm: boolean;
  phase: number;
  lean: THREE.Quaternion;
  trunkIndex: number;
  canopyIndex: number;
}

interface Jungle {
  trees: Tree[];
  trunks: THREE.InstancedMesh;
  pineCanopy: THREE.InstancedMesh;
  palmCanopy: THREE.InstancedMesh;
  vines: { group: THREE.Group; phase: number }[];
  torches: { light: THREE.PointLight; flame: THREE.Mesh; phase: number }[];
  fireflies: { points: THREE.Points; material: THREE.PointsMaterial; base: Float32Array; seeds: Float32Array } | null;
}

export interface SceneCallbacks {
  onHop?: () => void;
  /** A ride on a ladder / creature begins. */
  onJump?: (kind: Jump['kind']) => void;
  /** A creature attacks the pawn on its head (snake lunge, croc snap, dragon fire). */
  onBite?: (kind: BiteKind) => void;
  /** A pawn reaches 100 and the celebration burst starts. */
  onWin?: () => void;
}

// ---------------------------------------------------------------- scene

export class SnakesScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private creatures: Creature[] = [];
  private ladders: Ladder[] = [];
  private pawns: Pawn[] = [];
  private jungle: Jungle | null = null;
  private fx: ParticlePool;
  private soft: ParticlePool;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private ambient!: THREE.AmbientLight;
  private skyColor = new THREE.Color();
  private fog: THREE.Fog;
  private raf = 0;
  private frame = 0;
  private resizeObserver: ResizeObserver;
  private timer = new THREE.Timer();
  /** False when the user prefers reduced motion: no camera moves, idle sway or squash. */
  private motion: boolean;
  private cam = {
    zoom: 1,
    baseDist: 12,
    homeDist: 12,
    shake: 0,
    dragging: false,
    reset: null as { start: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3 } | null,
  };
  // Scratch objects for the hot loop (never allocate per frame).
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpM = new THREE.Matrix4();

  constructor(
    private container: HTMLElement,
    playerCount: number,
    private settings: GraphicsSettings,
    private callbacks: SceneCallbacks = {},
  ) {
    this.motion = !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.renderer = new THREE.WebGLRenderer({ antialias: settings.antialiasing, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(settings.pixelRatio);
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.copy(BOARD_CENTRE).addScaledVector(HOME_DIR, 12);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.42;
    this.controls.target.copy(BOARD_CENTRE);
    // Hands off the camera while the player is orbiting / zooming.
    this.controls.addEventListener('start', () => (this.cam.dragging = true));
    this.controls.addEventListener('end', () => (this.cam.dragging = false));

    // Starts beyond the far board edge at max zoom-out so tiles never get hazy.
    this.fog = new THREE.Fog(0x8ec5e8, 24, 48);
    this.scene.fog = this.fog;
    this.scene.background = this.skyColor;
    this.fx = new ParticlePool(settings.particleCount, true);
    this.soft = new ParticlePool(settings.particleCount, false);
    this.scene.add(this.fx.points, this.soft.points);

    this.buildLights();
    this.buildBoard();
    this.buildJungle();
    this.buildLadders();
    this.buildCreatures();
    for (let seat = 0; seat < playerCount; seat++) this.pawns.push(this.buildPawn(seat));
    this.updateSky(0);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  // ---------------------------------------------------------------- build

  private buildLights() {
    this.ambient = new THREE.AmbientLight(0xffffff, 0.75);
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x3b5a2a, 0.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(6, 14, 8);
    this.sun.castShadow = this.settings.shadows;
    const mapSize = this.settings.shadows ? Math.min(2048, this.settings.textureSize) : 512;
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -8;
    cam.right = cam.top = 8;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.ambient, this.hemi, this.sun, this.sun.target);
  }

  private buildBoard() {
    const size = this.settings.textureSize;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const tile = size / 10;
    const jumpFrom = new Map(JUMPS.map((j) => [j.from, j]));

    for (let sq = 1; sq <= 100; sq++) {
      const { row, col } = squareToGrid(sq);
      const x = col * tile;
      const y = (9 - row) * tile;
      const jump = jumpFrom.get(sq);
      ctx.fillStyle = jump ? (jump.kind === 'ladder' ? '#86efac' : jump.kind === 'dragon' ? '#fca5a5' : '#fdba74') : TILE_COLORS[(row + col) % TILE_COLORS.length]!;
      ctx.fillRect(x, y, tile, tile);
      ctx.strokeStyle = 'rgba(15,23,42,0.15)';
      ctx.lineWidth = size / 512;
      ctx.strokeRect(x, y, tile, tile);
      ctx.fillStyle = 'rgba(15,23,42,0.75)';
      ctx.font = `600 ${tile * 0.28}px Fredoka Variable, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(sq), x + tile * 0.08, y + tile * 0.06);
    }
    ctx.font = `${tile * 0.55}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const crown = squareToGrid(100);
    ctx.fillText('👑', crown.col * tile + tile / 2, (9 - crown.row) * tile + tile * 0.58);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    const board = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 10), [
      new THREE.MeshStandardMaterial({ color: 0x7c3aed }),
      new THREE.MeshStandardMaterial({ color: 0x7c3aed }),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x4c1d95 }),
      new THREE.MeshStandardMaterial({ color: 0x6d28d9 }),
      new THREE.MeshStandardMaterial({ color: 0x6d28d9 }),
    ]);
    board.position.y = -0.15;
    board.receiveShadow = true;
    this.scene.add(board);

    const start = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 0.2, 32), new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.6 }));
    start.position.copy(squareToWorld(0, -0.1));
    start.receiveShadow = true;
    this.scene.add(start);

    // Stone pedestal and jungle floor so the board sits in a clearing.
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.7, 10.8), new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.95 }));
    pedestal.position.y = -0.65;
    pedestal.receiveShadow = this.settings.shadows;
    this.scene.add(pedestal);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(18, 40), new THREE.MeshStandardMaterial({ color: 0x2d4a22, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = this.settings.shadows;
    this.scene.add(ground);
  }

  private buildJungle() {
    const high = this.settings.environment === 'high';
    const shadows = this.settings.shadows;
    const rnd = seeded(20251023);

    // Trees: trunks and canopies are instanced (one draw call per geometry);
    // per-instance matrices are refreshed in updateJungle for sway and fade.
    const treeCount = high ? 26 : 9;
    const trees: Tree[] = [];
    let pines = 0;
    let palms = 0;
    for (let i = 0; i < treeCount; i++) {
      // Thin out the arc the default camera sits in so the board stays framed.
      let angle = (i / treeCount) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
      const front = Math.cos(angle) < -0.7; // z = -cos(angle)·r, so this is the +z arc facing the camera
      if (front && i % 2 === 0) angle += Math.PI;
      const radius = 7.8 + rnd() * 3.2;
      const palm = rnd() < 0.45;
      const tree: Tree = {
        x: Math.sin(angle) * radius,
        z: -Math.cos(angle) * radius,
        height: palm ? 3 + rnd() * 1.4 : 2.2 + rnd() * 1.2,
        palm,
        phase: rnd() * Math.PI * 2,
        lean: new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * (palm ? 0.24 : 0.06), rnd() * Math.PI * 2, (rnd() - 0.5) * (palm ? 0.24 : 0.06))),
        trunkIndex: i,
        canopyIndex: palm ? palms++ : pines++,
      };
      trees.push(tree);
    }
    const bark = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.95 });
    const pineLeaf = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 0.9, flatShading: true });
    const palmLeaf = new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.85, flatShading: true });
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.2, 1, 6), bark, treeCount);
    const pineCanopy = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), pineLeaf, Math.max(1, pines * 2));
    const palmCanopy = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), palmLeaf, Math.max(1, palms * 2));
    for (const m of [trunks, pineCanopy, palmCanopy]) {
      m.castShadow = shadows;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.scene.add(m);
    }
    if (!pines) pineCanopy.count = 0;
    if (!palms) palmCanopy.count = 0;

    // Rocks and grass tufts: static instances around the pedestal.
    const rockCount = high ? 16 : 6;
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.9, flatShading: true }), rockCount);
    for (let i = 0; i < rockCount; i++) {
      const angle = rnd() * Math.PI * 2;
      const radius = 6.3 + rnd() * 3;
      const s = 0.5 + rnd() * 0.9;
      this.tmpM.compose(
        this.tmpA.set(Math.sin(angle) * radius, -1 + s * 0.25, -Math.cos(angle) * radius),
        this.tmpQ.setFromEuler(this.tmpE.set(rnd() * 0.6, rnd() * Math.PI * 2, rnd() * 0.6)),
        this.tmpB.set(s, s * (0.5 + rnd() * 0.4), s * (0.8 + rnd() * 0.5)),
      );
      rocks.setMatrixAt(i, this.tmpM);
    }
    rocks.castShadow = shadows;
    this.scene.add(rocks);

    const grassCount = high ? 140 : 40;
    const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.1, 0.55, 4), new THREE.MeshStandardMaterial({ color: 0x5fae3f, roughness: 0.9 }), grassCount);
    for (let i = 0; i < grassCount; i++) {
      const angle = rnd() * Math.PI * 2;
      const radius = 5.9 + rnd() * 6;
      const s = 0.7 + rnd() * 0.8;
      this.tmpM.compose(
        this.tmpA.set(Math.sin(angle) * radius, -1 + 0.27 * s, -Math.cos(angle) * radius),
        this.tmpQ.setFromEuler(this.tmpE.set((rnd() - 0.5) * 0.5, rnd() * Math.PI, (rnd() - 0.5) * 0.5)),
        this.tmpB.set(s, s, s),
      );
      grass.setMatrixAt(i, this.tmpM);
    }
    this.scene.add(grass);

    // Vines draped over the board rim (high only: ~40 small draw calls).
    const vines: Jungle['vines'] = [];
    if (high) {
      const vineMat = new THREE.MeshStandardMaterial({ color: 0x3f7d2a, roughness: 0.8 });
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.8, side: THREE.DoubleSide });
      const leafGeo = new THREE.SphereGeometry(0.11, 6, 4);
      for (let i = 0; i < 12; i++) {
        const edge = i % 3;
        const along = -4.2 + rnd() * 8.4;
        const anchor = edge === 0 ? new THREE.Vector3(-5, 0, along) : edge === 1 ? new THREE.Vector3(5, 0, along) : new THREE.Vector3(along, 0, -5);
        const n = edge === 0 ? new THREE.Vector3(-1, 0, 0) : edge === 1 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, -1);
        const side = new THREE.Vector3(-n.z, 0, n.x);
        const drift = (rnd() - 0.5) * 0.5;
        const drop = 0.7 + rnd() * 0.5;
        const pts = [
          n.clone().multiplyScalar(-0.35).setY(0.03),
          new THREE.Vector3(0, 0.02, 0),
          n.clone().multiplyScalar(0.14).setY(-0.3),
          n.clone().multiplyScalar(0.22).addScaledVector(side, drift * 0.6).setY(-0.65),
          n.clone().multiplyScalar(0.28).addScaledVector(side, drift).setY(-drop - 0.3),
        ];
        const curve = new THREE.CatmullRomCurve3(pts);
        const group = new THREE.Group();
        group.position.copy(anchor);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.035, 5, false), vineMat);
        group.add(tube);
        for (const u of [0.45, 0.72, 0.96]) {
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          leaf.position.copy(curve.getPoint(u));
          leaf.scale.set(1, 0.3, 1.7);
          leaf.rotation.y = rnd() * Math.PI;
          group.add(leaf);
        }
        this.scene.add(group);
        vines.push({ group, phase: rnd() * Math.PI * 2 });
      }
    }

    // Torches at the far corners (point lights: medium / high only).
    const torches: Jungle['torches'] = [];
    if (this.settings.pointLights) {
      const post = new THREE.CylinderGeometry(0.06, 0.08, 1.5, 6);
      const postMat = new THREE.MeshStandardMaterial({ color: 0x3f2a1a, roughness: 0.9 });
      const flameGeo = new THREE.ConeGeometry(0.16, 0.42, 6);
      for (const x of [-5.25, 5.25]) {
        const group = new THREE.Group();
        group.position.set(x, -0.3, -5.25);
        const stick = new THREE.Mesh(post, postMat);
        stick.position.y = 0.75;
        const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffb347 }));
        flame.position.y = 1.7;
        const light = new THREE.PointLight(0xffa040, 1.5, 7, 2);
        light.position.y = 1.8;
        group.add(stick, flame, light);
        this.scene.add(group);
        torches.push({ light, flame, phase: rnd() * 10 });
      }
    }

    // Fireflies / dust motes drifting around the board.
    let fireflies: Jungle['fireflies'] = null;
    if (this.settings.fireflyCount > 0) {
      const count = this.settings.fireflyCount;
      const base = new Float32Array(count * 3);
      const seeds = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const angle = rnd() * Math.PI * 2;
        const radius = 1.5 + rnd() * 8;
        base[i * 3] = Math.sin(angle) * radius;
        base[i * 3 + 1] = 0.3 + rnd() * 2.6;
        base[i * 3 + 2] = -Math.cos(angle) * radius;
        seeds[i] = rnd() * Math.PI * 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3).setUsage(THREE.DynamicDrawUsage));
      const material = new THREE.PointsMaterial({ color: 0xd9f99d, size: 0.14, map: this.softDot(), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
      const points = new THREE.Points(geo, material);
      points.frustumCulled = false;
      this.scene.add(points);
      fireflies = { points, material, base, seeds };
    }

    this.jungle = { trees, trunks, pineCanopy, palmCanopy, vines, torches, fireflies };
    this.updateJungle(0, true);
  }

  /** Small radial-gradient sprite for glowing points. */
  private softDot(): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }

  private buildLadders() {
    const rail = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6 });
    for (const j of JUMPS.filter((x) => x.kind === 'ladder')) {
      // Per-ladder rung material so each can shimmer independently.
      const rung = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5, emissive: 0xfbbf24, emissiveIntensity: 0 });
      const a = squareToWorld(j.from, 0.12);
      const b = squareToWorld(j.to, 0.12);
      const dir = b.clone().sub(a);
      const len = dir.length();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.22);
      const group = new THREE.Group();
      for (const s of [1, -1]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), rail);
        r.position.copy(a.clone().add(b).multiplyScalar(0.5).add(side.clone().multiplyScalar(s)));
        r.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
        r.castShadow = true;
        group.add(r);
      }
      const rungs = Math.max(3, Math.round(len / 0.45));
      for (let i = 1; i < rungs; i++) {
        const p = a.clone().lerp(b, i / rungs);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6), rung);
        m.position.copy(p);
        m.quaternion.setFromUnitVectors(UP, side.clone().normalize());
        m.castShadow = true;
        group.add(m);
      }
      this.scene.add(group);
      this.ladders.push({ jump: j, rungMat: rung, glow: 0, target: 0 });
    }
  }

  private emojiSprite(emoji: string, scale: number): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.font = '96px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 72);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.setScalar(scale);
    return sprite;
  }

  private buildCreatures() {
    for (const j of JUMPS) {
      if (j.kind === 'ladder') continue;
      const kind = j.kind as BiteKind;
      const spec = CREATURE[kind];
      const headPos = squareToWorld(j.from, 0.18);
      const tailPos = squareToWorld(j.to, 0.18);
      const n = 7;
      const axis = tailPos.clone().sub(headPos);
      const perp = new THREE.Vector3(-axis.z, 0, axis.x).normalize();
      const controlBase = Array.from({ length: n }, (_, i) => headPos.clone().lerp(tailPos, i / (n - 1)));
      const curve = new THREE.CatmullRomCurve3(controlBase.map((p) => p.clone()));
      curve.arcLengthDivisions = 60;

      const body = this.buildBody(spec);
      const { head, pivot, eyes, tongue, jaw, glowMats } = this.buildHead(kind, spec);
      // Face away from the body.
      const facing = headPos.clone().sub(curve.getPoint(0.1)).setY(0).normalize();
      head.position.copy(headPos);
      head.lookAt(headPos.clone().add(facing));
      this.scene.add(body.mesh, head);

      const creature: Creature = {
        jump: j,
        kind,
        spec,
        mesh: body.mesh,
        positions: body.positions,
        normals: body.normals,
        controlBase,
        curve,
        perp,
        phase: Math.random() * Math.PI * 2,
        head,
        pivot,
        yaw: 0,
        pitch: 0,
        eyes,
        blinks: kind !== 'snake',
        nextBlink: Math.random() * 4,
        blinkStart: -1,
        tongue,
        nextFlick: Math.random() * 3,
        flickStart: -1,
        jaw,
        wings: null,
        glowMats,
        fireLight: null,
        smokeAt: 0,
        biteStart: -1,
        biteFired: false,
      };
      if (kind === 'dragon') {
        creature.wings = this.buildWings(spec);
        this.scene.add(creature.wings.root);
        if (this.settings.pointLights) {
          creature.fireLight = new THREE.PointLight(0xff7a1a, 0, 7, 2);
          this.scene.add(creature.fireLight);
        }
      }
      this.creatures.push(creature);
      this.updateBody(creature, 0);
    }
  }

  /** Tube body with a fixed topology; vertices are rewritten by `updateBody`. */
  private buildBody(spec: CreatureSpec) {
    const count = (RINGS + 1) * RING_VERTS;
    const positions = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const normals = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const colors = new Float32Array(count * 3);
    const a = new THREE.Color(spec.body[0]);
    const b = new THREE.Color(spec.body[1]);
    for (let r = 0; r <= RINGS; r++) {
      const col = Math.floor((r / RINGS) * 14) % 2 === 0 ? a : b;
      for (let s = 0; s < RING_VERTS; s++) colors.set([col.r, col.g, col.b], (r * RING_VERTS + s) * 3);
    }
    const index: number[] = [];
    for (let r = 0; r < RINGS; r++) {
      for (let s = 0; s < RADIAL; s++) {
        const a0 = r * RING_VERTS + s;
        const b0 = a0 + RING_VERTS;
        // Outward winding for pos = centre + N·cosθ + (T×N)·sinθ.
        index.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setIndex(index);
    geo.setAttribute('position', positions);
    geo.setAttribute('normal', normals);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 }));
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    return { mesh, positions, normals };
  }

  private buildHead(kind: BiteKind, spec: CreatureSpec) {
    const R = spec.radius * 1.7;
    const head = new THREE.Group();
    const pivot = new THREE.Group();
    head.add(pivot);
    const skin = new THREE.MeshStandardMaterial({ color: spec.body[0], roughness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: spec.body[1], roughness: 0.5 });
    const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 16, 12), skin);
    skull.scale.y = spec.flat;
    skull.castShadow = true;
    pivot.add(skull);

    const eyes: THREE.Group[] = [];
    const glowMats: THREE.MeshStandardMaterial[] = [];
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilMat = kind === 'dragon' ? new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xff6a00, emissiveIntensity: 1.2 }) : new THREE.MeshBasicMaterial({ color: 0x020617 });
    if (pupilMat instanceof THREE.MeshStandardMaterial) glowMats.push(pupilMat);
    for (const s of [1, -1]) {
      const eye = new THREE.Group();
      eye.position.set(s * R * 0.55, R * 0.55 * spec.flat, R * 0.45);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(R * 0.3, 10, 8), white);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(R * 0.15, 8, 6), pupilMat);
      pupil.position.z = R * 0.2;
      eye.add(ball, pupil);
      pivot.add(eye);
      eyes.push(eye);
    }

    let tongue: THREE.Group | null = null;
    let jaw: THREE.Group | null = null;
    if (kind === 'snake') {
      tongue = new THREE.Group();
      tongue.position.set(0, -R * 0.1, R * 0.95);
      const forkMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
      const len = R * 0.9;
      const forkGeo = new THREE.CylinderGeometry(spec.radius * 0.05, spec.radius * 0.05, len, 5);
      for (const s of [1, -1]) {
        const fork = new THREE.Group();
        fork.rotation.y = s * 0.22;
        const cyl = new THREE.Mesh(forkGeo, forkMat);
        cyl.rotation.x = Math.PI / 2;
        cyl.position.z = len / 2;
        fork.add(cyl);
        tongue.add(fork);
      }
      tongue.visible = false;
      pivot.add(tongue);
    } else if (kind === 'croc') {
      const snout = new THREE.Mesh(new THREE.BoxGeometry(R * 1.1, R * 0.32, R * 1.5), skin);
      snout.position.set(0, R * 0.05, R * 0.95);
      snout.castShadow = true;
      pivot.add(snout);
      jaw = new THREE.Group();
      jaw.position.set(0, -R * 0.12, R * 0.2);
      const lower = new THREE.Mesh(new THREE.BoxGeometry(R, R * 0.22, R * 1.5), dark);
      lower.position.set(0, -R * 0.11, R * 0.75);
      jaw.add(lower);
      pivot.add(jaw);
      // Teeth: one instanced mesh per jaw.
      const perSide = this.settings.environment === 'high' ? 4 : 2;
      const toothH = R * 0.26;
      const toothGeo = new THREE.ConeGeometry(R * 0.07, toothH, 5);
      const upper = new THREE.InstancedMesh(toothGeo, white, perSide * 2);
      const lowerTeeth = new THREE.InstancedMesh(toothGeo, white, perSide * 2);
      let i = 0;
      for (const s of [1, -1]) {
        for (let k = 0; k < perSide; k++) {
          const z = R * 0.45 + (k / Math.max(1, perSide - 1)) * R * 0.95;
          this.tmpM.compose(this.tmpA.set(s * R * 0.47, -R * 0.11 - toothH * 0.4, z + R * 0.2), this.tmpQ.setFromEuler(this.tmpE.set(Math.PI, 0, 0)), this.tmpB.set(1, 1, 1));
          upper.setMatrixAt(i, this.tmpM);
          this.tmpM.compose(this.tmpA.set(s * R * 0.42, toothH * 0.4, z), this.tmpQ.identity(), this.tmpB.set(1, 1, 1));
          lowerTeeth.setMatrixAt(i, this.tmpM);
          i++;
        }
      }
      pivot.add(upper);
      jaw.add(lowerTeeth);
    } else {
      const snout = new THREE.Mesh(new THREE.BoxGeometry(R * 0.9, R * 0.5, R * 1.1), skin);
      snout.position.set(0, -R * 0.05, R * 0.9);
      snout.castShadow = true;
      pivot.add(snout);
      const hornMat = new THREE.MeshStandardMaterial({ color: 0x7f1d1d, roughness: 0.6 });
      const hornGeo = new THREE.ConeGeometry(R * 0.18, R * 0.9, 6);
      for (const s of [1, -1]) {
        const horn = new THREE.Mesh(hornGeo, hornMat);
        horn.position.set(s * R * 0.5, R * 0.65, -R * 0.25);
        horn.rotation.x = -0.7;
        horn.rotation.z = -s * 0.25;
        horn.castShadow = true;
        pivot.add(horn);
      }
    }

    const sprite = this.emojiSprite(spec.emoji, 0.9);
    sprite.position.y = 0.75;
    head.add(sprite);
    return { head, pivot, eyes, tongue, jaw, glowMats };
  }

  private buildWings(spec: CreatureSpec) {
    // Bat wing in the XY plane; +y is swept backwards after the mesh rotation.
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.5, 0.1);
    shape.lineTo(1, -0.05);
    shape.lineTo(1.5, 0.1);
    shape.lineTo(1.25, 0.5);
    shape.lineTo(0.8, 0.75);
    shape.lineTo(0.3, 0.6);
    shape.lineTo(0, 0.25);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6, side: THREE.DoubleSide });
    const root = new THREE.Group();
    const make = (s: number) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * spec.radius * 0.5, spec.radius * 0.6, 0);
      pivot.scale.x = s;
      const mesh = new THREE.Mesh(geo, mat);
      // Rx(-90°) maps shape +y to -z, i.e. the wing sweeps back along the body.
      mesh.rotation.x = -Math.PI / 2;
      mesh.scale.setScalar(0.95);
      mesh.castShadow = true;
      pivot.add(mesh);
      root.add(pivot);
      return pivot;
    };
    return { root, right: make(1), left: make(-1) };
  }

  private buildPawn(seat: number): Pawn {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: SEAT_HEX[seat], roughness: 0.3, metalness: 0.2 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.12, 24), mat);
    base.position.y = 0.06;
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.45, 24), mat);
    body.position.y = 0.33;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 14), mat);
    head.position.y = 0.6;
    for (const m of [base, body, head]) {
      m.castShadow = true;
      group.add(m);
    }
    group.position.copy(this.pawnSpot(0, seat));
    this.scene.add(group);
    return { group, queue: [], current: null, square: 0, landAt: -10, spinUntil: -1 };
  }

  /** Spread pawns that share a square so they don't overlap. */
  private pawnSpot(square: number, seat: number): THREE.Vector3 {
    const offsets: [number, number][] = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
    const [dx, dz] = offsets[seat] ?? [0, 0];
    return squareToWorld(square).add(new THREE.Vector3(dx, 0, dz));
  }

  // ---------------------------------------------------------------- moves

  /** Animate a pawn: hop square by square, then ride the ladder / creature. */
  animateMove(seat: number, from: number, landed: number, jump: Jump | null) {
    const pawn = this.pawns[seat];
    if (!pawn) return;
    for (let sq = from + 1; sq <= landed; sq++) {
      const a = this.pawnSpot(sq - 1, seat);
      const b = this.pawnSpot(sq, seat);
      pawn.queue.push({ points: [a, b], duration: HOP_S, hop: true, onStart: this.callbacks.onHop });
    }
    if (jump) {
      if (jump.kind === 'ladder') {
        const ladder = this.ladders.find((l) => l.jump.from === jump.from);
        // Shimmer from now until the climb finishes.
        if (ladder) ladder.target = 1;
        pawn.queue.push({
          points: [this.pawnSpot(jump.from, seat), this.pawnSpot(jump.to, seat)],
          duration: SLIDE_S,
          hop: false,
          onStart: () => this.callbacks.onJump?.(jump.kind),
          onEnd: () => {
            if (ladder) ladder.target = 0;
          },
        });
      } else {
        const creature = this.creatures.find((c) => c.jump.from === jump.from);
        const spot = this.pawnSpot(jump.from, seat);
        // A beat on the head so the bite reads before the slide starts.
        pawn.queue.push({
          points: [spot, spot.clone()],
          duration: PAUSE_S,
          hop: false,
          onStart: () => {
            if (creature) this.bite(creature);
          },
        });
        let points: THREE.Vector3[];
        if (creature) {
          creature.curve.updateArcLengths();
          points = creature.curve.getSpacedPoints(30).map((p) => p.setY(0.25));
        } else {
          points = [spot.clone()];
        }
        points.push(this.pawnSpot(jump.to, seat));
        pawn.queue.push({ points, duration: SLIDE_S, hop: false, zoom: true, onStart: () => this.callbacks.onJump?.(jump.kind) });
      }
    }
    const final = jump ? jump.to : landed;
    if (final === 100) {
      const last = pawn.queue.at(-1);
      if (last) {
        const prev = last.onEnd;
        last.onEnd = () => {
          prev?.();
          this.celebrate(pawn);
        };
      }
    }
    pawn.square = final;
  }

  /** Snap without animation (reconnect / rematch). */
  setPositions(positions: number[]) {
    positions.forEach((sq, seat) => {
      const pawn = this.pawns[seat];
      if (!pawn) return;
      pawn.queue = [];
      pawn.current = null;
      pawn.square = sq;
      pawn.spinUntil = -1;
      pawn.group.position.copy(this.pawnSpot(sq, seat));
      pawn.group.rotation.y = 0;
      pawn.group.scale.setScalar(1);
    });
    for (const l of this.ladders) l.target = 0;
  }

  isAnimating(): boolean {
    return this.pawns.some((p) => p.current || p.queue.length > 0);
  }

  /** Ease the camera back to its home framing. */
  resetCamera() {
    const toPos = BOARD_CENTRE.clone().addScaledVector(HOME_DIR, this.cam.homeDist);
    this.cam.zoom = 1;
    if (!this.motion) {
      this.controls.target.copy(BOARD_CENTRE);
      this.camera.position.copy(toPos);
      return;
    }
    this.cam.reset = { start: this.timer.getElapsed(), fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone(), toPos };
  }

  private bite(c: Creature) {
    c.biteStart = this.timer.getElapsed();
    c.biteFired = false;
  }

  private celebrate(pawn: Pawn) {
    const t = this.timer.getElapsed();
    pawn.spinUntil = t + SPIN_S;
    const p = pawn.group.position;
    const high = this.settings.environment === 'high';
    const sparkles = high ? 50 : 20;
    for (let i = 0; i < sparkles; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const v = 1.5 + Math.random() * 1.5;
      this.fx.emit({ x: p.x, y: p.y + 0.5, z: p.z, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.abs(Math.sin(e)) * v + 0.5, vz: Math.sin(a) * Math.cos(e) * v, life: 0.8 + Math.random() * 0.5, size: 0.14 + Math.random() * 0.08, color: Math.random() < 0.6 ? 0xfde047 : 0xffffff, gravity: -1, drag: 1, grow: -0.6 });
    }
    const confetti = high ? 80 : 30;
    for (let i = 0; i < confetti; i++) {
      this.soft.emit({ x: p.x + (Math.random() - 0.5) * 0.3, y: p.y + 0.6, z: p.z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 3, vy: 2.5 + Math.random() * 2.5, vz: (Math.random() - 0.5) * 3, life: 1.4 + Math.random() * 0.7, size: 0.1 + Math.random() * 0.08, color: CONFETTI_HEX[Math.floor(Math.random() * CONFETTI_HEX.length)]!, gravity: -5, drag: 1.2 });
    }
    this.callbacks.onWin?.();
  }

  private dust(at: THREE.Vector3) {
    const n = this.settings.environment === 'high' ? 12 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const v = 0.5 + Math.random() * 0.7;
      this.soft.emit({ x: at.x, y: 0.05, z: at.z, vx: Math.cos(a) * v, vy: 0.2 + Math.random() * 0.4, vz: Math.sin(a) * v, life: 0.4 + Math.random() * 0.2, size: 0.12 + Math.random() * 0.08, color: 0xcbb994, alpha: 0.6, gravity: -2, drag: 2, grow: 1.5 });
    }
  }

  // ----------------------------------------------------------------- loop

  private resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    // Fit the board: wider FOV and closer camera on narrow / portrait screens.
    this.camera.fov = width < 768 ? 60 : width < 1024 ? 52 : 45;
    const portraitBoost = this.camera.aspect < 1 ? 1 / this.camera.aspect : 1;
    const dist = (width < 768 ? 11 : width < 1024 ? 11.5 : 12) * Math.min(portraitBoost, 1.6);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.cam.baseDist = this.cam.homeDist = dist;
    this.camera.updateProjectionMatrix();
    const px = (height * this.renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.fx.setScale(px);
    this.soft.setScale(px);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    const t = this.timer.getElapsed();
    const dt = Math.min(0.1, this.timer.getDelta());
    this.frame++;

    this.updateSky(t);
    this.updatePawns(t, dt);
    const bodyTick = this.settings.animateCreatures && this.motion && this.frame % this.settings.creatureUpdateEvery === 0;
    for (const c of this.creatures) this.updateCreature(c, t, dt, bodyTick);
    this.updateLadders(t, dt);
    this.updateJungle(t, false);
    this.fx.update(dt);
    this.soft.update(dt);
    this.updateCamera(t, dt);
    this.controls.update();
    this.render(dt);
  };

  /** Day → dusk → night → dawn tint over DAY_CYCLE_S seconds. */
  private updateSky(t: number) {
    const p = this.motion ? (t / DAY_CYCLE_S) % 1 : 0.1;
    let i = 0;
    while (i < SKY_FRAMES.length - 2 && SKY_FRAMES[i + 1]!.at <= p) i++;
    const a = SKY_FRAMES[i]!;
    const b = SKY_FRAMES[i + 1]!;
    const k = THREE.MathUtils.smoothstep(p, a.at, b.at);
    this.skyColor.lerpColors(a.sky, b.sky, k);
    this.fog.color.copy(this.skyColor);
    this.sun.color.lerpColors(a.sun, b.sun, k);
    this.sun.intensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, k);
    this.hemi.color.lerpColors(a.hemiSky, b.hemiSky, k);
    this.hemi.groundColor.lerpColors(a.hemiGround, b.hemiGround, k);
    this.ambient.intensity = THREE.MathUtils.lerp(a.ambient, b.ambient, k);
    const torch = THREE.MathUtils.lerp(a.torch, b.torch, k);
    const firefly = THREE.MathUtils.lerp(a.firefly, b.firefly, k);
    // The sun drifts slowly so shadows creep across the board.
    this.sun.position.set(6 + 3 * Math.sin(p * Math.PI * 2), 14, 8 + 2 * Math.cos(p * Math.PI * 2));
    const j = this.jungle;
    if (!j) return;
    for (const torchLight of j.torches) {
      const flicker = this.motion ? Math.sin(t * 17 + torchLight.phase) * 0.18 + Math.sin(t * 31 + torchLight.phase * 3) * 0.12 : 0;
      torchLight.light.intensity = torch * (1.6 + flicker) * 1.4;
      torchLight.flame.scale.set(1 + flicker * 0.6, 1 + flicker, 1 + flicker * 0.6);
    }
    if (j.fireflies) j.fireflies.material.opacity = 0.15 + 0.75 * firefly;
  }

  private updatePawns(t: number, dt: number) {
    for (const pawn of this.pawns) {
      if (!pawn.current && pawn.queue.length) {
        const next = pawn.queue.shift()!;
        next.onStart?.();
        pawn.current = { ...next, start: t };
      }
      let sy = 1;
      let sxz = 1;
      const seg = pawn.current;
      if (seg) {
        const k = Math.min(1, (t - seg.start) / seg.duration);
        const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        const f = eased * (seg.points.length - 1);
        const i = Math.min(seg.points.length - 2, Math.floor(f));
        // Smooth vector interpolation between waypoints.
        pawn.group.position.lerpVectors(seg.points[i]!, seg.points[i + 1]!, f - i);
        if (seg.hop) {
          const arc = Math.sin(k * Math.PI);
          pawn.group.position.y = arc * 0.45;
          if (this.motion) {
            sy = 1 + 0.2 * arc;
            sxz = 1 - 0.1 * arc;
          }
        }
        if (k >= 1) {
          pawn.current = null;
          if (seg.hop) {
            pawn.landAt = t;
            this.dust(pawn.group.position);
          }
          seg.onEnd?.();
        }
      }
      // Landing squash.
      const kk = (t - pawn.landAt) / 0.22;
      if (kk < 1 && this.motion) {
        const s = Math.sin(kk * Math.PI);
        sy *= 1 - 0.25 * s;
        sxz *= 1 + 0.18 * s;
      }
      if (t < pawn.spinUntil) {
        pawn.group.rotation.y += dt * 11;
        const s = 1 + 0.12 * Math.sin((pawn.spinUntil - t) * 9);
        sy *= s;
        sxz *= s;
      } else {
        pawn.group.rotation.y = 0;
      }
      pawn.group.scale.set(sxz, sy, sxz);
    }
  }

  /** Undulate the body in place: control points sway, then each ring is rewritten. */
  private updateBody(c: Creature, t: number) {
    const n = c.controlBase.length;
    const axisLen = c.controlBase[0]!.distanceTo(c.controlBase[n - 1]!);
    const amp = Math.min(0.9, axisLen * 0.12);
    const swish = c.kind === 'croc' ? 0.4 : 0.12;
    for (let i = 0; i < n; i++) {
      const env = Math.sin((Math.PI * i) / (n - 1));
      const wave = Math.sin(i * 1.7 + t * 2.2 + c.phase) * amp * env;
      // Tail swish: the last points drift a little even though the envelope pins them.
      const tail = (i / (n - 1)) ** 3 * swish * Math.sin(t * 1.3 + c.phase);
      c.curve.points[i]!.copy(c.controlBase[i]!).addScaledVector(c.perp, wave + tail);
    }
    const pos = c.positions.array as Float32Array;
    const nor = c.normals.array as Float32Array;
    const centre = this.tmpA;
    const tangent = this.tmpB;
    const side = this.tmpC;
    const flat = c.spec.flat;
    for (let r = 0; r <= RINGS; r++) {
      const u = r / RINGS;
      c.curve.getPoint(u, centre);
      c.curve.getTangent(u, tangent);
      side.crossVectors(tangent, UP);
      if (side.lengthSq() < 1e-6) side.copy(c.perp);
      else side.normalize();
      const radius = (1 - u * 0.75) * c.spec.radius;
      for (let s = 0; s < RING_VERTS; s++) {
        const cs = RING_COS[s]!;
        const sn = RING_SIN[s]!;
        const idx = (r * RING_VERTS + s) * 3;
        pos[idx] = centre.x + side.x * sn * radius;
        pos[idx + 1] = centre.y + cs * radius * flat;
        pos[idx + 2] = centre.z + side.z * sn * radius;
        nor[idx] = side.x * sn;
        nor[idx + 1] = cs;
        nor[idx + 2] = side.z * sn;
      }
    }
    c.positions.needsUpdate = true;
    c.normals.needsUpdate = true;
    c.head.position.y = 0.18 + Math.sin(t * 3 + c.phase) * 0.04;
  }

  private updateCreature(c: Creature, t: number, dt: number, bodyTick: boolean) {
    const R = c.spec.radius * 1.7;
    if (bodyTick) this.updateBody(c, t);

    // Look at the nearest pawn within ~3 squares, otherwise sway idly.
    let targetYaw = this.motion ? Math.sin(t * 0.9 + c.phase) * 0.35 : 0;
    let targetPitch = 0;
    let nearest: Pawn | null = null;
    let best = 3.2;
    for (const p of this.pawns) {
      const d = Math.hypot(p.group.position.x - c.head.position.x, p.group.position.z - c.head.position.z);
      if (d < best) {
        best = d;
        nearest = p;
      }
    }
    if (nearest) {
      if (best < 0.4) {
        targetPitch = 0.45;
      } else {
        const local = c.head.worldToLocal(this.tmpA.copy(nearest.group.position));
        targetYaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.3, 1.3);
        targetPitch = 0.2;
      }
    }
    const ease = 1 - Math.exp(-dt * 6);
    c.yaw += (targetYaw - c.yaw) * ease;
    c.pitch += (targetPitch - c.pitch) * ease;

    // Bite timeline: lunge forward, croc jaw snaps, dragon breathes fire.
    let lunge = 0;
    let bitePitch = 0;
    let jawOpen = 0.12 + (this.motion ? Math.sin(t * 1.7 + c.phase) * 0.05 : 0);
    let fire = 0;
    if (c.biteStart >= 0) {
      const k = (t - c.biteStart) / BITE_S;
      if (k >= 1) {
        c.biteStart = -1;
      } else {
        lunge = Math.sin(Math.min(1, k / 0.6) * Math.PI) * R * 1.1;
        bitePitch = Math.sin(k * Math.PI) * 0.35;
        if (c.kind === 'croc') jawOpen = k < 0.35 ? THREE.MathUtils.smoothstep(k, 0, 0.35) : k < 0.45 ? 1 - (k - 0.35) / 0.1 : 0;
        if (c.kind === 'dragon') fire = k > 0.1 && k < 0.7 ? Math.sin(((k - 0.1) / 0.6) * Math.PI) : 0;
        const soundAt = c.kind === 'croc' ? 0.35 : c.kind === 'dragon' ? 0.1 : 0;
        if (!c.biteFired && k >= soundAt) {
          c.biteFired = true;
          this.callbacks.onBite?.(c.kind);
          if (this.motion) this.cam.shake = c.kind === 'dragon' ? 1.4 : 1;
        }
      }
    }
    c.pivot.position.z = lunge;
    c.pivot.rotation.set(c.pitch + bitePitch, c.yaw, 0);
    if (c.jaw) c.jaw.rotation.x = jawOpen;

    if (c.tongue) {
      let len = 0;
      if (c.biteStart >= 0) {
        len = 1.3;
      } else if (this.motion) {
        if (t >= c.nextFlick) {
          c.flickStart = t;
          c.nextFlick = t + 1.6 + Math.random() * 2.6;
        }
        const k = (t - c.flickStart) / 0.45;
        if (k >= 0 && k < 1) len = Math.sin(k * Math.PI) * (0.9 + 0.3 * Math.sin(k * 25));
      }
      c.tongue.visible = len > 0.02;
      if (c.tongue.visible) c.tongue.scale.z = len;
    }

    if (c.blinks) {
      if (t >= c.nextBlink) {
        c.blinkStart = t;
        c.nextBlink = t + 2.5 + Math.random() * 4;
      }
      const k = (t - c.blinkStart) / 0.22;
      const sy = k >= 0 && k < 1 ? Math.max(0.08, 1 - Math.sin(k * Math.PI)) : 1;
      for (const e of c.eyes) e.scale.y = sy;
    }

    if (c.wings) {
      c.curve.getPoint(0.14, this.tmpA);
      c.curve.getTangent(0.14, this.tmpB);
      c.wings.root.position.copy(this.tmpA);
      c.wings.root.lookAt(this.tmpC.copy(this.tmpA).sub(this.tmpB));
      const flap = (this.motion ? 0.25 + Math.sin(t * 3.4 + c.phase) * 0.55 : 0.3) + fire * 0.4;
      c.wings.right.rotation.z = flap;
      c.wings.left.rotation.z = -flap;
    }
    for (const m of c.glowMats) m.emissiveIntensity = 1.2 + (this.motion ? Math.sin(t * 2.5) * 0.4 : 0) + fire * 3;

    if (c.kind === 'dragon') {
      const mouth = c.pivot.localToWorld(this.tmpA.set(0, -R * 0.1, R * 1.4));
      const dir = c.pivot.localToWorld(this.tmpB.set(0, -R * 0.1, R * 2.4)).sub(mouth).normalize();
      if (fire > 0) {
        const n = Math.max(2, Math.round(this.settings.particleCount / 60));
        for (let i = 0; i < n; i++) {
          const spread = 0.9;
          this.fx.emit({
            x: mouth.x + (Math.random() - 0.5) * 0.1,
            y: mouth.y + (Math.random() - 0.5) * 0.1,
            z: mouth.z + (Math.random() - 0.5) * 0.1,
            vx: dir.x * (3 + Math.random() * 2) + (Math.random() - 0.5) * spread,
            vy: dir.y * 3 + 0.4 + Math.random() * 0.8,
            vz: dir.z * (3 + Math.random() * 2) + (Math.random() - 0.5) * spread,
            life: 0.45 + Math.random() * 0.4,
            size: 0.22 + Math.random() * 0.18,
            color: Math.random() < 0.5 ? 0xffe066 : 0xff5a1f,
            gravity: 1.5,
            drag: 1.5,
            grow: 1.6,
          });
        }
      }
      if (c.fireLight) {
        c.fireLight.intensity = fire * 12;
        c.fireLight.position.copy(mouth).addScaledVector(dir, 0.9);
      }
      if (this.motion && t >= c.smokeAt) {
        c.smokeAt = t + (this.settings.environment === 'high' ? 0.28 : 0.6);
        this.soft.emit({ x: mouth.x, y: mouth.y + 0.05, z: mouth.z, vx: dir.x * 0.3 + (Math.random() - 0.5) * 0.2, vy: 0.5 + Math.random() * 0.3, vz: dir.z * 0.3 + (Math.random() - 0.5) * 0.2, life: 1.8, size: 0.16, color: 0x6b7280, alpha: 0.35, drag: 0.5, grow: 2.5 });
      }
    }
  }

  private updateLadders(t: number, dt: number) {
    const ease = 1 - Math.exp(-dt * 4);
    for (const l of this.ladders) {
      l.glow += (l.target - l.glow) * ease;
      l.rungMat.emissiveIntensity = l.glow * (0.45 + 0.35 * Math.sin(t * 9));
    }
  }

  /** Tree sway plus fading out trees that would block the camera. */
  private updateJungle(t: number, force: boolean) {
    const j = this.jungle;
    if (!j) return;
    const every = this.settings.environment === 'high' ? 1 : 2;
    if (!force && this.frame % every !== 0) return;
    const sway = this.motion ? 1 : 0;
    const cam = this.camera.position;
    for (const tree of j.trees) {
      const d = Math.hypot(cam.x - tree.x, cam.z - tree.z);
      const s = THREE.MathUtils.clamp((d - 3) / 2.5, 0.001, 1);
      const h = tree.height * s;
      this.tmpM.compose(this.tmpA.set(tree.x, -1 + h / 2, tree.z), tree.lean, this.tmpB.set(s, h, s));
      j.trunks.setMatrixAt(tree.trunkIndex, this.tmpM);
      const top = -1 + h;
      this.tmpQ.setFromEuler(this.tmpE.set(Math.sin(t * 0.7 + tree.phase) * 0.05 * sway, 0, Math.sin(t * 0.6 + tree.phase * 1.3) * 0.05 * sway));
      if (tree.palm) {
        this.tmpM.compose(this.tmpA.set(tree.x, top + 0.2 * s, tree.z), this.tmpQ, this.tmpB.set(1.7 * s, 0.7 * s, 1.7 * s));
        j.palmCanopy.setMatrixAt(tree.canopyIndex * 2, this.tmpM);
        this.tmpE.y = 0.4;
        this.tmpQ.setFromEuler(this.tmpE);
        this.tmpM.compose(this.tmpA.set(tree.x, top + 0.45 * s, tree.z), this.tmpQ, this.tmpB.set(1.2 * s, 0.6 * s, 1.2 * s));
        j.palmCanopy.setMatrixAt(tree.canopyIndex * 2 + 1, this.tmpM);
      } else {
        this.tmpM.compose(this.tmpA.set(tree.x, top + 0.6 * s, tree.z), this.tmpQ, this.tmpB.set(1.3 * s, 1.6 * s, 1.3 * s));
        j.pineCanopy.setMatrixAt(tree.canopyIndex * 2, this.tmpM);
        this.tmpM.compose(this.tmpA.set(tree.x, top + 1.4 * s, tree.z), this.tmpQ, this.tmpB.set(0.9 * s, 1.3 * s, 0.9 * s));
        j.pineCanopy.setMatrixAt(tree.canopyIndex * 2 + 1, this.tmpM);
      }
    }
    j.trunks.instanceMatrix.needsUpdate = true;
    j.pineCanopy.instanceMatrix.needsUpdate = true;
    j.palmCanopy.instanceMatrix.needsUpdate = true;

    for (const v of j.vines) {
      v.group.rotation.x = Math.sin(t * 1.1 + v.phase) * 0.04 * sway;
      v.group.rotation.z = Math.cos(t * 0.9 + v.phase) * 0.04 * sway;
    }

    if (j.fireflies && (sway || force)) {
      const f = j.fireflies;
      const attr = f.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < f.seeds.length; i++) {
        const seed = f.seeds[i]!;
        const i3 = i * 3;
        arr[i3] = f.base[i3]! + Math.sin(t * 0.5 + seed) * 0.7;
        arr[i3 + 1] = f.base[i3 + 1]! + Math.sin(t * 0.8 + seed * 2) * 0.35;
        arr[i3 + 2] = f.base[i3 + 2]! + Math.cos(t * 0.45 + seed * 3) * 0.7;
      }
      attr.needsUpdate = true;
    }
  }

  /** Follow the moving pawn, zoom in on creature slides, ease home afterwards. */
  private updateCamera(t: number, dt: number) {
    if (!this.motion) return;
    const cam = this.cam;
    if (cam.reset) {
      const k = Math.min(1, (t - cam.reset.start) / RESET_S);
      const e = 1 - (1 - k) ** 3;
      this.camera.position.lerpVectors(cam.reset.fromPos, cam.reset.toPos, e);
      this.controls.target.lerpVectors(cam.reset.fromTarget, BOARD_CENTRE, e);
      cam.baseDist = cam.homeDist;
      if (k >= 1) cam.reset = null;
      return;
    }
    if (cam.dragging) return;

    const mover = this.pawns.find((p) => p.current) ?? null;
    const desired = this.tmpA.copy(BOARD_CENTRE);
    if (mover) desired.lerp(this.tmpB.set(mover.group.position.x, BOARD_CENTRE.y, mover.group.position.z), 0.55);
    const k = 1 - Math.exp(-dt * (mover ? 3.5 : 2));
    const delta = this.tmpC.subVectors(desired, this.controls.target).multiplyScalar(k);
    this.controls.target.add(delta);
    this.camera.position.add(delta);

    const zoomTarget = mover?.current?.zoom ? 0.78 : 1;
    cam.zoom += (zoomTarget - cam.zoom) * (1 - Math.exp(-dt * 5));
    const dir = this.tmpB.subVectors(this.camera.position, this.controls.target);
    const dist = dir.length();
    if (zoomTarget === 1 && Math.abs(cam.zoom - 1) < 0.002) {
      cam.zoom = 1;
      cam.baseDist = dist; // adopt whatever distance the player chose
    } else {
      this.camera.position.copy(this.controls.target).addScaledVector(dir.normalize(), cam.baseDist * cam.zoom);
    }
  }

  private render(dt: number) {
    const s = this.cam.shake;
    if (s > 0.002) {
      const o = this.tmpA.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(s * 0.3);
      this.camera.position.add(o);
      this.renderer.render(this.scene, this.camera);
      this.camera.position.sub(o);
      this.cam.shake = s * Math.exp(-dt * 7);
    } else {
      this.cam.shake = 0;
      this.renderer.render(this.scene, this.camera);
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
      // Instanced meshes and lights (shadow maps) hold GPU resources of their own.
      const extra = obj as { isInstancedMesh?: boolean; isLight?: boolean; dispose?: () => void };
      if (extra.isInstancedMesh || extra.isLight) extra.dispose?.();
    });
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
