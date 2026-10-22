import { useEffect, useState } from 'react';

// Rotation that brings each face to the front.
const FACE_ROTATION: Record<number, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(-90deg) rotateY(0deg)',
  3: 'rotateY(-90deg)',
  4: 'rotateY(90deg)',
  5: 'rotateX(90deg)',
  6: 'rotateY(180deg)',
};

const FACE_TRANSFORM: Record<number, string> = {
  1: 'translateZ(var(--half))',
  2: 'rotateX(90deg) translateZ(var(--half))',
  3: 'rotateY(90deg) translateZ(var(--half))',
  4: 'rotateY(-90deg) translateZ(var(--half))',
  5: 'rotateX(-90deg) translateZ(var(--half))',
  6: 'rotateY(180deg) translateZ(var(--half))',
};

// Pip positions in a 3x3 grid (1..9, reading order).
const PIPS: Record<number, number[]> = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};

interface Props {
  value: number | null;
  /** Bumps on every roll so the same value re-animates. */
  rollKey: number;
  canRoll: boolean;
  onRoll(): void;
  size?: number;
  color?: string;
}

export function Dice({ value, rollKey, canRoll, onRoll, size = 72, color }: Props) {
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    if (rollKey === 0) return;
    setRolling(true);
    const t = window.setTimeout(() => setRolling(false), 900);
    return () => window.clearTimeout(t);
  }, [rollKey]);

  return (
    <button
      type="button"
      onClick={onRoll}
      disabled={!canRoll}
      className={`dice-scene relative rounded-2xl p-2 transition ${canRoll ? 'cursor-pointer hover:scale-105' : 'cursor-default opacity-80'}`}
      style={{ width: size + 16, height: size + 16 }}
      aria-label={canRoll ? 'Roll the dice' : value ? `Dice shows ${value}` : 'Dice'}
    >
      {canRoll && (
        <span className="absolute inset-0 animate-pulse rounded-2xl ring-4" style={{ ['--tw-ring-color' as string]: color ?? '#a78bfa' }} aria-hidden="true" />
      )}
      <div className={rolling ? 'dice-rolling size-full' : 'size-full'}>
        <div className="dice-cube" style={{ transform: FACE_ROTATION[value ?? 1], ['--half' as string]: `${size / 2}px` }}>
          {[1, 2, 3, 4, 5, 6].map((face) => (
            <div key={face} className="dice-face" style={{ transform: FACE_TRANSFORM[face] }}>
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i}>{PIPS[face]!.includes(i + 1) && <span className="dice-pip block" />}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}
