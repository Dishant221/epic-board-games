// Flappy Flyer physics and rules. Plain data + functions with no DOM access so the
// fixed-timestep loop, the renderer and the React shell stay independent.
// All coordinates are in a fixed 480×720 logical space; the renderer scales to fit.

export const W = 480;
export const H = 720;
export const GROUND_Y = 632;
export const BIRD_X = 140;
export const BIRD_R = 16;
export const PIPE_W = 74;
export const CAP_H = 28;
/** Pipe caps overhang the body by this much on each side. */
export const CAP_LIP = 5;
/** Physics tick (120 Hz). */
export const DT = 1 / 120;

/** Collision radius is a touch smaller than the drawn body so near-misses feel fair. */
const HIT_R = BIRD_R - 3;
const GRAVITY = 1950;
const FLAP_VY = -570;
const MAX_FALL = 980;
const READY_Y = 330;
const PIPE_SPACING = 262;
/** Keep gaps away from the ceiling and ground. */
const GAP_MARGIN = 60;
/** Consecutive gaps never jump further than this vertically. */
const MAX_GAP_SHIFT = 230;

// Difficulty ramps gently and is floored so late game stays humanly possible.
export function speedFor(score: number) {
  return Math.min(285, 178 + score * 3.2);
}
export function gapFor(score: number) {
  return Math.max(130, 178 - score * 1.4);
}

export type Medal = 'bronze' | 'silver' | 'gold' | 'platinum';
/** Highest first, so the first match wins. */
export const MEDAL_THRESHOLDS: ReadonlyArray<readonly [Medal, number]> = [
  ['platinum', 40],
  ['gold', 30],
  ['silver', 20],
  ['bronze', 10],
];
export function medalFor(score: number): Medal | null {
  for (const [medal, min] of MEDAL_THRESHOLDS) if (score >= min) return medal;
  return null;
}
/** The next medal above `score`, or null once platinum is reached. */
export function nextMedal(score: number): readonly [Medal, number] | null {
  let next: readonly [Medal, number] | null = null;
  for (const entry of MEDAL_THRESHOLDS) if (score < entry[1]) next = entry;
  return next;
}

export type Phase = 'ready' | 'playing' | 'dying' | 'over';
export type SimEvent = 'score' | 'crash' | 'over';

export interface Bird {
  y: number;
  prevY: number;
  vy: number;
  rot: number;
  prevRot: number;
  /** Wing animation phase; the renderer maps it to 3 frames. */
  wing: number;
  /** Seconds of fast wing beating left after a flap. */
  flapT: number;
}
export interface Pipe {
  /** World x (screen x = x - dist). */
  x: number;
  gapY: number;
  gap: number;
  scored: boolean;
}
export interface Particle {
  kind: 'feather' | 'puff';
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  size: number;
  life: number;
  ttl: number;
}
export interface Floater {
  x: number;
  y: number;
  life: number;
  ttl: number;
  text: string;
}

export interface Sim {
  phase: Phase;
  /** Total elapsed seconds; drives the day/night cycle. Survives restarts. */
  time: number;
  /** World scroll distance (ground + pipes). */
  dist: number;
  prevDist: number;
  bird: Bird;
  pipes: Pipe[];
  nextPipeX: number;
  score: number;
  /** 1 right after scoring, decays to 0; scales the HUD number. */
  scorePop: number;
  /** 1 right after a crash, decays to 0; drives screen shake. */
  shake: number;
  particles: Particle[];
  floaters: Floater[];
  /** 0.5 on low-end devices halves particle counts. */
  fxScale: number;
  rand(): number;
  /** Drained by the game loop after each batch of steps. */
  events: SimEvent[];
}

function freshBird(): Bird {
  return { y: READY_Y, prevY: READY_Y, vy: 0, rot: 0, prevRot: 0, wing: 0, flapT: 0 };
}

export function createSim(rand: () => number = Math.random): Sim {
  return {
    phase: 'ready',
    time: 0,
    dist: 0,
    prevDist: 0,
    bird: freshBird(),
    pipes: [],
    nextPipeX: 0,
    score: 0,
    scorePop: 0,
    shake: 0,
    particles: [],
    floaters: [],
    fxScale: 1,
    rand,
    events: [],
  };
}

/** Back to the title state; keeps time and scroll so the sky and ground do not jump. */
export function resetRun(sim: Sim) {
  sim.phase = 'ready';
  sim.bird = freshBird();
  sim.pipes = [];
  sim.particles = [];
  sim.floaters = [];
  sim.score = 0;
  sim.scorePop = 0;
  sim.shake = 0;
  sim.events = [];
}

export function startRun(sim: Sim) {
  if (sim.phase !== 'ready') return;
  sim.phase = 'playing';
  sim.score = 0;
  sim.bird.vy = 0;
  sim.bird.prevY = sim.bird.y;
  // First pipe arrives after a short breather.
  sim.nextPipeX = sim.dist + W + 150;
}

export function flap(sim: Sim) {
  if (sim.phase !== 'playing') return;
  const b = sim.bird;
  b.vy = FLAP_VY;
  b.flapT = 0.28;
  b.wing = 0;
  const n = Math.round(5 * sim.fxScale);
  for (let i = 0; i < n; i++) {
    const r = sim.rand;
    sim.particles.push({
      kind: 'feather',
      x: BIRD_X - 8 + (r() - 0.5) * 10,
      y: b.y + 4 + (r() - 0.5) * 10,
      vx: -(70 + r() * 130),
      vy: (r() - 0.35) * 180,
      rot: r() * Math.PI * 2,
      vr: (r() - 0.5) * 12,
      size: 3 + r() * 2.5,
      life: 0,
      ttl: 0.5 + r() * 0.35,
    });
  }
}

function spawnPuff(sim: Sim) {
  const b = sim.bird;
  const n = Math.round(14 * sim.fxScale);
  for (let i = 0; i < n; i++) {
    const r = sim.rand;
    const a = r() * Math.PI * 2;
    const sp = 60 + r() * 150;
    sim.particles.push({
      kind: 'puff',
      x: BIRD_X + (r() - 0.5) * 16,
      y: b.y + (r() - 0.5) * 16,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 40,
      rot: 0,
      vr: 0,
      size: 6 + r() * 7,
      life: 0,
      ttl: 0.5 + r() * 0.4,
    });
  }
}

function crash(sim: Sim, onGround: boolean) {
  sim.shake = 1;
  spawnPuff(sim);
  sim.events.push('crash');
  if (onGround) {
    sim.bird.y = GROUND_Y - BIRD_R;
    sim.phase = 'over';
    sim.events.push('over');
  } else {
    // Small bounce off the pipe, then gravity brings the bird down.
    sim.phase = 'dying';
    sim.bird.vy = -230;
  }
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function hitsRect(cx: number, cy: number, r: number, x: number, y: number, w: number, h: number) {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function spawnPipes(sim: Sim) {
  while (sim.nextPipeX - sim.dist < W + 120) {
    const gap = gapFor(sim.score);
    const lo = gap / 2 + GAP_MARGIN;
    const hi = GROUND_Y - gap / 2 - GAP_MARGIN;
    const last = sim.pipes[sim.pipes.length - 1];
    let gapY = lo + sim.rand() * (hi - lo);
    if (last) gapY = clamp(gapY, last.gapY - MAX_GAP_SHIFT, last.gapY + MAX_GAP_SHIFT);
    sim.pipes.push({ x: sim.nextPipeX, gapY: clamp(gapY, lo, hi), gap, scored: false });
    sim.nextPipeX += PIPE_SPACING;
  }
  while (sim.pipes.length && sim.pipes[0]!.x - sim.dist < -PIPE_W - CAP_LIP - 20) sim.pipes.shift();
}

function scoreAndCollide(sim: Sim) {
  const b = sim.bird;
  if (b.y + BIRD_R - 1 >= GROUND_Y) return crash(sim, true);
  for (const p of sim.pipes) {
    const sx = p.x - sim.dist;
    if (!p.scored && sx + PIPE_W < BIRD_X) {
      p.scored = true;
      sim.score++;
      sim.scorePop = 1;
      sim.floaters.push({ x: BIRD_X + 34, y: b.y - 26, life: 0, ttl: 0.8, text: '+1' });
      sim.events.push('score');
    }
    if (sx > BIRD_X + HIT_R || sx + PIPE_W + CAP_LIP < BIRD_X - HIT_R) continue;
    const top = p.gapY - p.gap / 2;
    const bot = p.gapY + p.gap / 2;
    if (
      hitsRect(BIRD_X, b.y, HIT_R, sx, -50, PIPE_W, top + 50) ||
      hitsRect(BIRD_X, b.y, HIT_R, sx - CAP_LIP, top - CAP_H, PIPE_W + CAP_LIP * 2, CAP_H) ||
      hitsRect(BIRD_X, b.y, HIT_R, sx, bot, PIPE_W, GROUND_Y - bot) ||
      hitsRect(BIRD_X, b.y, HIT_R, sx - CAP_LIP, bot, PIPE_W + CAP_LIP * 2, CAP_H)
    ) {
      return crash(sim, false);
    }
  }
}

/** Nose dips as the bird falls, snaps up on a flap. */
function tilt(b: Bird, dt: number) {
  const target = b.vy < 0 ? -0.42 : Math.min(1.35, (b.vy / MAX_FALL) * 1.6);
  const rate = b.vy < 0 ? 18 : 7;
  b.rot += (target - b.rot) * Math.min(1, dt * rate);
}

function updateFx(sim: Sim, dt: number) {
  const scroll = sim.phase === 'ready' || sim.phase === 'playing' ? speedFor(sim.score) : 0;
  let w = 0;
  for (const p of sim.particles) {
    p.life += dt;
    if (p.life >= p.ttl) continue;
    if (p.kind === 'feather') {
      p.vy += 320 * dt;
      p.vx *= 1 - dt * 1.5;
      p.x += (p.vx - scroll * 0.5) * dt;
      p.rot += p.vr * dt;
    } else {
      p.vx *= 1 - dt * 3;
      p.vy *= 1 - dt * 3;
      p.x += p.vx * dt;
      p.size += 28 * dt;
    }
    p.y += p.vy * dt;
    sim.particles[w++] = p;
  }
  sim.particles.length = w;

  w = 0;
  for (const f of sim.floaters) {
    f.life += dt;
    if (f.life >= f.ttl) continue;
    f.y -= 70 * dt;
    sim.floaters[w++] = f;
  }
  sim.floaters.length = w;
}

/** Advance one fixed tick. Events are appended to `sim.events`. */
export function step(sim: Sim, dt: number) {
  const b = sim.bird;
  sim.prevDist = sim.dist;
  b.prevY = b.y;
  b.prevRot = b.rot;
  sim.time += dt;
  sim.scorePop = Math.max(0, sim.scorePop - dt * 3.5);
  sim.shake = Math.max(0, sim.shake - dt * 2.2);
  updateFx(sim, dt);

  switch (sim.phase) {
    case 'ready':
      sim.dist += speedFor(0) * dt;
      b.y = READY_Y + Math.sin(sim.time * 3.2) * 9;
      b.rot += (0 - b.rot) * Math.min(1, dt * 8);
      b.wing += dt * 5;
      break;
    case 'playing':
      sim.dist += speedFor(sim.score) * dt;
      b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
      b.y += b.vy * dt;
      if (b.y < BIRD_R) {
        b.y = BIRD_R;
        b.vy = Math.max(0, b.vy);
      }
      tilt(b, dt);
      b.flapT = Math.max(0, b.flapT - dt);
      b.wing += dt * (b.flapT > 0 ? 16 : 4);
      spawnPipes(sim);
      scoreAndCollide(sim);
      break;
    case 'dying':
      b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
      b.y += b.vy * dt;
      b.rot += (1.5 - b.rot) * Math.min(1, dt * 6);
      if (b.y + BIRD_R >= GROUND_Y) {
        b.y = GROUND_Y - BIRD_R;
        sim.phase = 'over';
        sim.events.push('over');
      }
      break;
    case 'over':
      break;
  }
}
