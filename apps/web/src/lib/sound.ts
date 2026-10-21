// Tiny synthesized sound effects via WebAudio — no audio assets to download.

type Sfx = 'dice' | 'move' | 'drop' | 'ladder' | 'snake' | 'win' | 'lose' | 'chat' | 'click';

let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem('ebg:muted') === '1';
} catch {
  /* storage unavailable */
}

export function isMuted() {
  return muted;
}

export function setMuted(value: boolean) {
  muted = value;
  try {
    localStorage.setItem('ebg:muted', value ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}

function tone(freq: number, start: number, duration: number, type: OscillatorType = 'sine', gain = 0.15, slideTo?: number) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + start + duration);
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration + 0.05);
}

export function play(sfx: Sfx) {
  if (muted || typeof window === 'undefined') return;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  switch (sfx) {
    case 'dice':
      for (let i = 0; i < 6; i++) tone(200 + Math.random() * 400, i * 0.07, 0.05, 'square', 0.05);
      break;
    case 'move':
      tone(520, 0, 0.08, 'triangle', 0.12);
      break;
    case 'click':
      tone(880, 0, 0.04, 'sine', 0.08);
      break;
    case 'drop':
      tone(300, 0, 0.18, 'sine', 0.2, 120);
      break;
    case 'ladder':
      [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.08, 0.12, 'triangle', 0.12));
      break;
    case 'snake':
      tone(700, 0, 0.6, 'sawtooth', 0.06, 90);
      break;
    case 'win':
      [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i * 0.12, 0.2, 'triangle', 0.14));
      break;
    case 'lose':
      [392, 349, 311, 262].forEach((f, i) => tone(f, i * 0.18, 0.25, 'sine', 0.12));
      break;
    case 'chat':
      tone(1200, 0, 0.06, 'sine', 0.06);
      break;
  }
}
