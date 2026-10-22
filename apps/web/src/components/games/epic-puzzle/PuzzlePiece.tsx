import type { CSSProperties } from 'react';
import { pieceStyle, type PuzzleGeometry } from './geometry';

interface Props {
  src: string;
  geometry: PuzzleGeometry;
  piece: number;
  scale?: number;
  placed?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** A rounded, bevelled rectangle showing one crop of the artwork. */
export function PuzzlePiece({ src, geometry, piece, scale = 1, placed = false, className = '', style }: Props) {
  return <div className={`ep-piece ${placed ? 'ep-placed' : ''} ${className}`} style={{ ...pieceStyle(src, geometry, piece, scale), ...style }} aria-hidden="true" />;
}
