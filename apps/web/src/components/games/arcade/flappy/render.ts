// Canvas 2D renderer for Flappy Flyer. Everything is drawn procedurally in the
// 480×720 logical space; the caller sets the transform for DPR and CSS size.
import { BIRD_R, BIRD_X, CAP_H, CAP_LIP, GROUND_Y, H, PIPE_W, W, type Sim } from './sim';

export interface RenderOptions {
  /** No parallax, no screen shake. */
  reducedMotion: boolean;
  /** Skip the softer (more expensive) touches. */
  lowTier: boolean;
}

type RGB = readonly [number, number, number];
interface SkyKey {
  p: number;
  top: RGB;
  bot: RGB;
  /** 0 = full day, 1 = deep night; drives stars, windows and the tint. */
  night: number;
}

/** One full day → dusk → night → dawn cycle, in seconds. */
const CYCLE_S = 120;
const SKY: SkyKey[] = [
  { p: 0, top: [79, 179, 246], bot: [191, 233, 255], night: 0 },
  { p: 0.36, top: [72, 150, 230], bot: [255, 214, 160], night: 0.05 },
  { p: 0.5, top: [94, 60, 140], bot: [255, 140, 90], night: 0.45 },
  { p: 0.62, top: [10, 16, 52], bot: [32, 44, 96], night: 1 },
  { p: 0.84, top: [12, 20, 60], bot: [40, 56, 110], night: 1 },
  { p: 0.94, top: [60, 70, 140], bot: [255, 160, 170], night: 0.4 },
  { p: 1, top: [79, 179, 246], bot: [191, 233, 255], night: 0 },
];

/** Scenery repeats every LEN world units; two copies cover any scroll offset. */
const LEN = W * 2;
const FONT = '"Fredoka Variable", "Inter Variable", ui-rounded, system-ui, sans-serif';

interface Star { x: number; y: number; r: number; tw: number }
interface Cloud { x: number; y: number; s: number }
interface Building { x: number; w: number; h: number; cols: number; rows: number; lit: boolean[]; spire: boolean }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function skyAt(time: number) {
  const p = (time / CYCLE_S) % 1;
  let a = SKY[0]!;
  let b = SKY[SKY.length - 1]!;
  for (let i = 0; i < SKY.length - 1; i++) {
    const k0 = SKY[i]!;
    const k1 = SKY[i + 1]!;
    if (p >= k0.p && p < k1.p) {
      a = k0;
      b = k1;
      break;
    }
  }
  const t = (p - a.p) / (b.p - a.p);
  return { top: mix(a.top, b.top, t), bot: mix(a.bot, b.bot, t), night: lerp(a.night, b.night, t) };
}

export class Renderer {
  private readonly stars: Star[] = [];
  private readonly clouds: Cloud[] = [];
  private readonly buildings: Building[] = [];
  private pipeBody: CanvasGradient | null = null;
  private pipeCap: CanvasGradient | null = null;
  private skyGrad: CanvasGradient | null = null;
  private skyGradKey = -1;

  constructor(rand: () => number = Math.random) {
    for (let i = 0; i < 70; i++) this.stars.push({ x: rand() * W, y: rand() * 380, r: 0.6 + rand() * 1.1, tw: rand() * Math.PI * 2 });
    for (let i = 0; i < 8; i++) this.clouds.push({ x: rand() * LEN, y: 50 + rand() * 220, s: 0.6 + rand() * 0.8 });
    let x = 6;
    while (x < LEN - 70) {
      const w = 26 + rand() * 40;
      const h = 60 + rand() * 130;
      const cols = Math.max(1, Math.floor((w - 8) / 10));
      const rows = Math.max(1, Math.floor((h - 12) / 13));
      const lit: boolean[] = [];
      for (let i = 0; i < cols * rows; i++) lit.push(rand() < 0.55);
      this.buildings.push({ x, w, h, cols, rows, lit, spire: rand() < 0.25 });
      x += w + 4 + rand() * 12;
    }
  }

  draw(ctx: CanvasRenderingContext2D, sim: Sim, alpha: number, opts: RenderOptions) {
    const distI = lerp(sim.prevDist, sim.dist, alpha);
    const birdY = lerp(sim.bird.prevY, sim.bird.y, alpha);
    const birdRot = lerp(sim.bird.prevRot, sim.bird.rot, alpha);
    const sky = skyAt(sim.time);
    const par = opts.reducedMotion ? 0 : 1;

    ctx.save();
    if (!opts.reducedMotion && sim.shake > 0) {
      const amp = sim.shake * sim.shake * 11;
      ctx.translate((Math.random() * 2 - 1) * amp, (Math.random() * 2 - 1) * amp);
    }

    this.drawSky(ctx, sim.time, sky);
    this.drawStars(ctx, sim.time, sky.night);
    this.drawSunMoon(ctx, sky.night, opts.lowTier);
    this.drawClouds(ctx, distI * 0.12 * par + sim.time * 6, sky.night);
    this.drawHills(ctx, distI * par, sky.night);
    this.drawSkyline(ctx, distI * 0.45 * par, sky.night);
    this.drawPipes(ctx, sim, distI);
    this.drawGround(ctx, distI);
    // Night tint over the world; the bird is drawn after it so it stays readable.
    if (sky.night > 0.02) {
      ctx.fillStyle = rgba([10, 14, 50], sky.night * 0.35);
      ctx.fillRect(-40, -40, W + 80, H + 80);
    }
    this.drawParticles(ctx, sim);
    this.drawBird(ctx, sim, birdY, birdRot);
    this.drawFloaters(ctx, sim);
    this.drawScore(ctx, sim);
    ctx.restore();
  }

  private drawSky(ctx: CanvasRenderingContext2D, time: number, sky: ReturnType<typeof skyAt>) {
    // Rebuild the gradient a few times per second; colour drift is slow enough.
    const key = Math.floor(time * 4);
    if (!this.skyGrad || key !== this.skyGradKey) {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      g.addColorStop(0, rgba(sky.top));
      g.addColorStop(1, rgba(sky.bot));
      this.skyGrad = g;
      this.skyGradKey = key;
    }
    ctx.fillStyle = this.skyGrad;
    ctx.fillRect(-40, -40, W + 80, GROUND_Y + 40);
  }

  private drawStars(ctx: CanvasRenderingContext2D, time: number, night: number) {
    if (night < 0.05) return;
    for (const s of this.stars) {
      const a = night * (0.55 + 0.45 * Math.sin(time * 2 + s.tw));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSunMoon(ctx: CanvasRenderingContext2D, night: number, lowTier: boolean) {
    const day = 1 - night;
    if (day > 0.02) {
      if (!lowTier) {
        const glow = ctx.createRadialGradient(W - 96, 118, 20, W - 96, 118, 90);
        glow.addColorStop(0, `rgba(255,240,170,${0.45 * day})`);
        glow.addColorStop(1, 'rgba(255,240,170,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(W - 190, 20, 190, 200);
      }
      ctx.fillStyle = `rgba(255,243,176,${day})`;
      ctx.beginPath();
      ctx.arc(W - 96, 118, 36, 0, Math.PI * 2);
      ctx.fill();
    }
    if (night > 0.02) {
      ctx.fillStyle = `rgba(240,244,255,${night})`;
      ctx.beginPath();
      ctx.arc(W - 120, 130, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(190,200,230,${night * 0.7})`;
      for (const [dx, dy, r] of [[-8, -6, 5], [9, 4, 4], [-2, 12, 3]] as const) {
        ctx.beginPath();
        ctx.arc(W - 120 + dx, 130 + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawClouds(ctx: CanvasRenderingContext2D, scroll: number, night: number) {
    const off = ((scroll % LEN) + LEN) % LEN;
    const bright = 1 - night * 0.6;
    ctx.fillStyle = rgba([255 * bright, 255 * bright, 255 * Math.min(1, bright + 0.1)], 0.92);
    for (const c of this.clouds) {
      for (let i = 0; i < 2; i++) {
        const sx = c.x - off + i * LEN;
        if (sx < -80 * c.s || sx > W + 80 * c.s) continue;
        const s = c.s;
        ctx.beginPath();
        ctx.arc(sx, c.y, 22 * s, 0, Math.PI * 2);
        ctx.arc(sx - 22 * s, c.y + 6 * s, 15 * s, 0, Math.PI * 2);
        ctx.arc(sx + 24 * s, c.y + 4 * s, 17 * s, 0, Math.PI * 2);
        ctx.arc(sx + 4 * s, c.y - 11 * s, 15 * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawHills(ctx: CanvasRenderingContext2D, dist: number, night: number) {
    const layers = [
      { par: 0.18, base: 505, amp: 1, color: mix([128, 196, 170], [26, 34, 72], night) },
      { par: 0.3, base: 548, amp: 0.8, color: mix([96, 170, 120], [20, 28, 60], night) },
    ];
    for (const l of layers) {
      const off = dist * l.par;
      ctx.fillStyle = rgba(l.color);
      ctx.beginPath();
      ctx.moveTo(-40, GROUND_Y + 10);
      for (let x = -40; x <= W + 40; x += 16) {
        const wx = x + off;
        const y = l.base - (Math.sin(wx * 0.009) * 28 + Math.sin(wx * 0.023 + 1.7) * 14 + 40) * l.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W + 40, GROUND_Y + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawSkyline(ctx: CanvasRenderingContext2D, scroll: number, night: number) {
    const off = ((scroll % LEN) + LEN) % LEN;
    const body = rgba(mix([64, 84, 124], [16, 20, 46], night));
    const edge = rgba(mix([48, 64, 100], [10, 12, 32], night));
    const litA = night * 0.9;
    const darkA = 0.18 * (1 - night) + 0.08;
    for (const b of this.buildings) {
      for (let i = 0; i < 2; i++) {
        const sx = b.x - off + i * LEN;
        if (sx > W + 2 || sx + b.w < -2) continue;
        const top = GROUND_Y - b.h;
        ctx.fillStyle = body;
        ctx.fillRect(sx, top, b.w, b.h + 4);
        ctx.fillStyle = edge;
        ctx.fillRect(sx, top, b.w, 3);
        if (b.spire) ctx.fillRect(sx + b.w / 2 - 1.5, top - 18, 3, 18);
        const cw = (b.w - 8) / b.cols;
        const ch = (b.h - 12) / b.rows;
        for (let r = 0; r < b.rows; r++) {
          for (let c = 0; c < b.cols; c++) {
            const on = b.lit[r * b.cols + c] === true;
            ctx.fillStyle = on && night > 0.1 ? `rgba(255,222,120,${litA})` : `rgba(255,255,255,${darkA})`;
            ctx.fillRect(sx + 4 + c * cw + 1.5, top + 6 + r * ch + 1.5, Math.max(2, cw - 3), Math.max(2, ch - 4));
          }
        }
      }
    }
  }

  private pipeGradients(ctx: CanvasRenderingContext2D) {
    if (!this.pipeBody) {
      const g = ctx.createLinearGradient(0, 0, PIPE_W, 0);
      g.addColorStop(0, '#3f8a24');
      g.addColorStop(0.18, '#7fd14a');
      g.addColorStop(0.42, '#9be65c');
      g.addColorStop(0.7, '#5fb534');
      g.addColorStop(1, '#2f6b1c');
      this.pipeBody = g;
    }
    if (!this.pipeCap) {
      const g = ctx.createLinearGradient(-CAP_LIP, 0, PIPE_W + CAP_LIP, 0);
      g.addColorStop(0, '#48962a');
      g.addColorStop(0.2, '#8ddb55');
      g.addColorStop(0.45, '#a9ef68');
      g.addColorStop(0.75, '#66bf3a');
      g.addColorStop(1, '#346f1f');
      this.pipeCap = g;
    }
    return { body: this.pipeBody, cap: this.pipeCap };
  }

  private drawPipes(ctx: CanvasRenderingContext2D, sim: Sim, distI: number) {
    if (!sim.pipes.length) return;
    const { body, cap } = this.pipeGradients(ctx);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1e4a12';
    const box = (x: number, y: number, w: number, h: number) => {
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    };
    for (const p of sim.pipes) {
      const sx = p.x - distI;
      if (sx > W + 10 || sx < -PIPE_W - CAP_LIP - 10) continue;
      const top = p.gapY - p.gap / 2;
      const bot = p.gapY + p.gap / 2;
      ctx.save();
      ctx.translate(sx, 0);
      ctx.fillStyle = body;
      box(0, -10, PIPE_W, top - CAP_H + 10);
      box(0, bot + CAP_H, PIPE_W, GROUND_Y - bot - CAP_H + 10);
      ctx.fillStyle = cap;
      box(-CAP_LIP, top - CAP_H, PIPE_W + CAP_LIP * 2, CAP_H);
      box(-CAP_LIP, bot, PIPE_W + CAP_LIP * 2, CAP_H);
      // Specular stripe.
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(PIPE_W * 0.22, -10, 6, top - CAP_H + 8);
      ctx.fillRect(PIPE_W * 0.22, bot + CAP_H + 2, 6, GROUND_Y - bot - CAP_H + 8);
      ctx.fillRect(PIPE_W * 0.22 - 3, top - CAP_H + 3, 7, CAP_H - 6);
      ctx.fillRect(PIPE_W * 0.22 - 3, bot + 3, 7, CAP_H - 6);
      ctx.restore();
    }
  }

  private drawGround(ctx: CanvasRenderingContext2D, distI: number) {
    ctx.fillStyle = '#d7b56a';
    ctx.fillRect(-40, GROUND_Y, W + 80, H - GROUND_Y + 40);
    ctx.fillStyle = '#b9924e';
    ctx.fillRect(-40, GROUND_Y + 64, W + 80, H - GROUND_Y - 64 + 40);
    // Scrolling dirt stripes give the ground its speed cue.
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    const off = -(distI % 36);
    for (let x = off - 36; x < W + 40; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 20);
      ctx.lineTo(x + 16, GROUND_Y + 20);
      ctx.lineTo(x + 2, H + 40);
      ctx.lineTo(x - 14, H + 40);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#7bd04a';
    ctx.fillRect(-40, GROUND_Y, W + 80, 16);
    ctx.fillStyle = '#4f9a2a';
    ctx.fillRect(-40, GROUND_Y + 16, W + 80, 4);
    ctx.fillStyle = '#5a3a14';
    ctx.fillRect(-40, GROUND_Y - 2, W + 80, 2);
  }

  private drawParticles(ctx: CanvasRenderingContext2D, sim: Sim) {
    for (const p of sim.particles) {
      const t = p.life / p.ttl;
      const a = 1 - t;
      if (p.kind === 'feather') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `rgba(255,214,80,${a})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = `rgba(230,230,235,${a * 0.85})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawBird(ctx: CanvasRenderingContext2D, sim: Sim, y: number, rot: number) {
    const frames = [0, 1, 2, 1] as const;
    const frame = frames[Math.floor(sim.bird.wing) % 4]!;
    const wingDy = frame === 0 ? -9 : frame === 1 ? -2 : 6;
    const wingAng = frame === 0 ? -0.65 : frame === 1 ? -0.1 : 0.5;

    ctx.save();
    ctx.translate(BIRD_X, y);
    ctx.rotate(rot);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#6b3f0a';
    ctx.lineJoin = 'round';

    // Tail feathers.
    ctx.fillStyle = '#e8891c';
    ctx.beginPath();
    ctx.moveTo(-13, -3);
    ctx.lineTo(-27, -11);
    ctx.lineTo(-25, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Body.
    const body = ctx.createLinearGradient(0, -BIRD_R, 0, BIRD_R);
    body.addColorStop(0, '#ffe14d');
    body.addColorStop(1, '#f7b21c');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_R + 3, BIRD_R - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly.
    ctx.fillStyle = 'rgba(255,246,205,0.95)';
    ctx.beginPath();
    ctx.ellipse(2, 6, 11, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing (3-frame flap).
    ctx.save();
    ctx.translate(-5, wingDy);
    ctx.rotate(wingAng);
    ctx.fillStyle = '#f3a51a';
    ctx.beginPath();
    ctx.ellipse(-2, 0, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Eye.
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(9, -6, 6.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1f1407';
    ctx.beginPath();
    ctx.arc(11, -6, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(12.3, -7.3, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Beak.
    ctx.fillStyle = '#ff8c1a';
    ctx.beginPath();
    ctx.moveTo(14, -2);
    ctx.lineTo(29, 2);
    ctx.lineTo(14, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e86f0a';
    ctx.beginPath();
    ctx.moveTo(14, 3);
    ctx.lineTo(26, 5);
    ctx.lineTo(14, 7.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawFloaters(ctx: CanvasRenderingContext2D, sim: Sim) {
    if (!sim.floaters.length) return;
    ctx.font = `700 28px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    for (const f of sim.floaters) {
      const a = 1 - f.life / f.ttl;
      ctx.strokeStyle = `rgba(40,25,5,${a * 0.8})`;
      ctx.fillStyle = `rgba(255,235,120,${a})`;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
    }
  }

  private drawScore(ctx: CanvasRenderingContext2D, sim: Sim) {
    if (sim.phase === 'ready') return;
    const s = 1 + sim.scorePop * 0.45;
    ctx.save();
    ctx.translate(W / 2, 96);
    ctx.scale(s, s);
    ctx.font = `700 60px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(35,22,8,0.75)';
    ctx.strokeText(String(sim.score), 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(sim.score), 0, 0);
    ctx.restore();
  }
}
