// Engine lives in game-core; imported by path until the integrator registers it
// in games/index.ts (after which '@ebg/game-core' also exports these).
import type { EpicPuzzleMove, EpicPuzzleState } from '@ebg/game-core/games/epic-puzzle';
import type { GameSessionView } from '../../../lib/session';
import '../../../styles/games/epic-puzzle.css';
import { PuzzlePicker } from '../epic-puzzle/PuzzlePicker';
import { PuzzlePlay } from '../epic-puzzle/PuzzlePlay';

/**
 * Co-operative jigsaw: pick an image + size, then drag pieces from the tray
 * onto the canvas. Any seated player may place pieces at any time.
 */
export default function EpicPuzzleBoard({ session, size }: { session: GameSessionView<EpicPuzzleState, EpicPuzzleMove>; size: number }) {
  const s = session.state;
  if (!s) return null;
  if (s.phase === 'pick') return <PuzzlePicker session={session} width={size} />;
  // Keying on the puzzle identity resets all drag/selection state for a new puzzle.
  return <PuzzlePlay key={`${s.imageId}:${s.cols}x${s.rows}:${s.startedAt}`} session={session} state={s} width={size} />;
}
