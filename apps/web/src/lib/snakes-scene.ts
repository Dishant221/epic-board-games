// Three.js rendering layer for Snakes, Dragons & Ladders. Rules live in
// @ebg/game-core (and the Rust/Wasm engine); this file only draws state.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { JUMPS, squareToGrid, type Jump } from '@ebg/game-core';
import type { GraphicsSettings } from './performance-tier';

const SEAT_HEX = [0xf43f5e, 0x38bdf8, 0xfacc15, 0x4ade80];
const TILE_COLORS = ['#fde68a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#ddd6fe'];
const CREATURE = {
  snake: { body: [0x22c55e, 0x14532d], radius: 0.16, emoji: '🐍', flat: 1 },
  croc: { body: [0x65a30d, 0x365314], radius: 0.2, emoji: '🐊', flat: 0.55 },
  dragon: { body: [0xef4444, 0xf59e0b], radius: 0.24, emoji: '🐉', flat: 1 },
} as const;

const HOP_MS = 260;
const SLIDE_MS = 1100;

/** World-space centre of a square. Square 0 is the start area left of square 1. */
export function squareToWorld(square: number, y = 0): THREE.Vector3 {
  if (square <= 0) return new THREE.Vector3(-5.9, y, 4.5);
  const { row, col } = squareToGrid(square);
  return new THREE.Vector3(col - 4.5, y, 4.5 - row);
}

interface Creature {
  jump: Jump;
  mesh: THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial>;
  head: THREE.Group;
  controlBase: THREE.Vector3[];
  curve: THREE.CatmullRomCurve3;
  phase: number;
  fire?: THREE.Points;
}

interface Segment {
  points: THREE.Vector3[];
  duration: number;
  hop: boolean;
  onStart?: () => void;
}

interface Pawn {
  group: THREE.Group;
  queue: Segment[];
  current: (Segment & { start: number }) | null;
  square: number;
}

export interface SceneCallbacks {
  onHop?: () => void;
  onJump?: (kind: Jump['kind']) => void;
}

export class SnakesScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private creatures: Creature[] = [];
  private pawns: Pawn[] = [];
  private raf = 0;
  private resizeObserver: ResizeObserver;
  private timer = new THREE.Timer();

  constructor(
    private container: HTMLElement,
    playerCount: number,
    private settings: GraphicsSettings,
    private callbacks: SceneCallbacks = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: settings.antialiasing, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(settings.pixelRatio);
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 12, 6.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 22;
    this.controls.maxPolarAngle = Math.PI * 0.42;
    this.controls.target.set(0, 0, 0.3);

    this.buildLights();
    this.buildBoard();
    this.buildLadders();
    this.buildCreatures();
    for (let seat = 0; seat < playerCount; seat++) this.pawns.push(this.buildPawn(seat));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  // ---------------------------------------------------------------- build

  private buildLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    this.scene.add(new THREE.HemisphereLight(0xc4b5fd, 0x0e0e2c, 0.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(6, 14, 8);
    sun.castShadow = this.settings.shadows;
    sun.shadow.mapSize.set(2048, 2048);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -8;
    cam.right = cam.top = 8;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
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
  }

  private buildLadders() {
    const rail = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.6 });
    const rung = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
    for (const j of JUMPS.filter((x) => x.kind === 'ladder')) {
      const a = squareToWorld(j.from, 0.12);
      const b = squareToWorld(j.to, 0.12);
      const dir = b.clone().sub(a);
      const len = dir.length();
      const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.22);
      const group = new THREE.Group();
      for (const s of [1, -1]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len, 8), rail);
        r.position.copy(a.clone().add(b).multiplyScalar(0.5).add(side.clone().multiplyScalar(s)));
        r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        r.castShadow = true;
        group.add(r);
      }
      const rungs = Math.max(3, Math.round(len / 0.45));
      for (let i = 1; i < rungs; i++) {
        const p = a.clone().lerp(b, i / rungs);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.44, 6), rung);
        m.position.copy(p);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side.clone().normalize());
        m.castShadow = true;
        group.add(m);
      }
      this.scene.add(group);
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
    for (const j of JUMPS.filter((x) => x.kind !== 'ladder')) {
      const kind = CREATURE[j.kind as keyof typeof CREATURE];
      const head = squareToWorld(j.from, 0.18);
      const tail = squareToWorld(j.to, 0.18);
      const n = 7;
      const dir = tail.clone().sub(head);
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
      const controlBase = Array.from({ length: n }, (_, i) => head.clone().lerp(tail, i / (n - 1)));
      const curve = new THREE.CatmullRomCurve3(controlBase.map((p) => p.clone()));
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.1 });
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, kind.radius, 10), material);
      mesh.castShadow = true;
      mesh.scale.y = 1;
      this.scene.add(mesh);

      const headGroup = new THREE.Group();
      const skull = new THREE.Mesh(new THREE.SphereGeometry(kind.radius * 1.7, 16, 12), new THREE.MeshStandardMaterial({ color: kind.body[0], roughness: 0.4 }));
      skull.scale.y = kind.flat;
      skull.castShadow = true;
      headGroup.add(skull);
      for (const s of [1, -1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(kind.radius * 0.5, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        eye.position.set(perp.x * s * kind.radius * 0.9, kind.radius * 0.9 * kind.flat, perp.z * s * kind.radius * 0.9);
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(kind.radius * 0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0x020617 }));
        pupil.position.copy(eye.position).add(new THREE.Vector3(0, kind.radius * 0.2, 0));
        headGroup.add(eye, pupil);
      }
      const sprite = this.emojiSprite(kind.emoji, 0.9);
      sprite.position.y = 0.75;
      headGroup.add(sprite);
      headGroup.position.copy(head);
      this.scene.add(headGroup);

      const creature: Creature = { jump: j, mesh, head: headGroup, controlBase, curve, phase: Math.random() * Math.PI * 2 };
      if (j.kind === 'dragon') creature.fire = this.buildFire(head);
      this.creatures.push(creature);
      this.updateCreature(creature, 0, perp);
    }
  }

  private buildFire(at: THREE.Vector3): THREE.Points {
    const count = this.settings.particleCount;
    const positions = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xfb923c, size: 0.12, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.position.copy(at);
    pts.userData.seeds = Array.from({ length: count }, () => Math.random());
    this.scene.add(pts);
    return pts;
  }

  /** Undulate the body: offset control points perpendicular to the axis, pinned at both ends. */
  private updateCreature(c: Creature, t: number, perp?: THREE.Vector3) {
    const head = c.controlBase[0]!;
    const tail = c.controlBase.at(-1)!;
    const axis = tail.clone().sub(head);
    const p = perp ?? new THREE.Vector3(-axis.z, 0, axis.x).normalize();
    const n = c.controlBase.length;
    const amp = Math.min(0.9, axis.length() * 0.12);
    c.curve.points.forEach((pt, i) => {
      const env = Math.sin((Math.PI * i) / (n - 1));
      const wave = Math.sin(i * 1.7 + t * 2.2 + c.phase) * amp * env;
      pt.copy(c.controlBase[i]!).addScaledVector(p, wave);
    });
    const kind = CREATURE[c.jump.kind as keyof typeof CREATURE];
    const old = c.mesh.geometry;
    const geo = new THREE.TubeGeometry(c.curve, 64, kind.radius, 10);
    // Taper toward the tail and paint bands via vertex colours.
    const pos = geo.attributes.position!;
    const colors = new Float32Array(pos.count * 3);
    const a = new THREE.Color(kind.body[0]);
    const b = new THREE.Color(kind.body[1]);
    const ringSize = 11;
    for (let v = 0; v < pos.count; v++) {
      const ring = Math.floor(v / ringSize);
      const u = ring / 64;
      const centre = c.curve.getPointAt(Math.min(1, u));
      const taper = 1 - u * 0.75;
      pos.setXYZ(v, centre.x + (pos.getX(v) - centre.x) * taper, centre.y + (pos.getY(v) - centre.y) * taper * kind.flat, centre.z + (pos.getZ(v) - centre.z) * taper);
      const col = Math.floor(u * 14) % 2 === 0 ? a : b;
      colors.set([col.r, col.g, col.b], v * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    c.mesh.geometry = geo;
    old.dispose();
    c.head.position.copy(c.curve.points[0]!);
    c.head.position.y = 0.18 + Math.sin(t * 3 + c.phase) * 0.04;
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
    return { group, queue: [], current: null, square: 0 };
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
      pawn.queue.push({ points: [a, b], duration: HOP_MS, hop: true, onStart: this.callbacks.onHop });
    }
    if (jump) {
      let points: THREE.Vector3[];
      if (jump.kind === 'ladder') {
        points = [this.pawnSpot(jump.from, seat), this.pawnSpot(jump.to, seat)];
      } else {
        const creature = this.creatures.find((c) => c.jump.from === jump.from);
        points = creature ? creature.curve.getSpacedPoints(30).map((p) => p.clone().setY(0.25)) : [this.pawnSpot(jump.from, seat), this.pawnSpot(jump.to, seat)];
        points.push(this.pawnSpot(jump.to, seat));
      }
      pawn.queue.push({ points, duration: SLIDE_MS, hop: false, onStart: () => this.callbacks.onJump?.(jump.kind) });
    }
    pawn.square = jump ? jump.to : landed;
  }

  /** Snap without animation (reconnect / rematch). */
  setPositions(positions: number[]) {
    positions.forEach((sq, seat) => {
      const pawn = this.pawns[seat];
      if (!pawn) return;
      pawn.queue = [];
      pawn.current = null;
      pawn.square = sq;
      pawn.group.position.copy(this.pawnSpot(sq, seat));
    });
  }

  isAnimating(): boolean {
    return this.pawns.some((p) => p.current || p.queue.length > 0);
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
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    const t = this.timer.getElapsed();
    const now = performance.now();

    if (this.settings.animateCreatures) {
      for (const c of this.creatures) this.updateCreature(c, t);
    }
    for (const c of this.creatures) {
      if (!c.fire) continue;
      const pos = c.fire.geometry.attributes.position as THREE.BufferAttribute;
      const seeds = c.fire.userData.seeds as number[];
      for (let i = 0; i < seeds.length; i++) {
        const life = (t * 0.9 + seeds[i]!) % 1;
        pos.setXYZ(i, Math.sin(seeds[i]! * 40) * 0.25 * life, 0.3 + life * 1.2, Math.cos(seeds[i]! * 40) * 0.25 * life);
      }
      pos.needsUpdate = true;
      (c.fire.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 10) * 0.25;
      c.fire.position.copy(c.head.position);
    }

    for (const pawn of this.pawns) {
      if (!pawn.current && pawn.queue.length) {
        const next = pawn.queue.shift()!;
        next.onStart?.();
        pawn.current = { ...next, start: now };
      }
      const seg = pawn.current;
      if (!seg) continue;
      const k = Math.min(1, (now - seg.start) / seg.duration);
      const eased = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const f = eased * (seg.points.length - 1);
      const i = Math.min(seg.points.length - 2, Math.floor(f));
      // Smooth vector interpolation between waypoints.
      pawn.group.position.lerpVectors(seg.points[i]!, seg.points[i + 1]!, f - i);
      if (seg.hop) pawn.group.position.y = Math.sin(k * Math.PI) * 0.45;
      if (k >= 1) pawn.current = null;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((m) => {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      });
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
