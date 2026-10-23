import { pieceSlot, PUZZLE_IMAGE_HEIGHT, PUZZLE_IMAGE_WIDTH } from '@ebg/game-core/games/epic-puzzle';
import type { CSSProperties } from 'react';

/** Pixel layout of the canvas grid for a given board width. */
export interface PuzzleGeometry {
  canvasW: number;
  canvasH: number;
  cols: number;
  rows: number;
  pieceW: number;
  pieceH: number;
}

export function puzzleGeometry(width: number, cols: number, rows: number): PuzzleGeometry {
  // Whole-pixel pieces avoid hairline seams between placed pieces; the image
  // is stretched by well under 1 % to fit, which is invisible.
  const pieceW = Math.max(1, Math.floor(width / cols));
  const canvasW = pieceW * cols;
  const pieceH = Math.max(1, Math.round((canvasW * PUZZLE_IMAGE_HEIGHT) / PUZZLE_IMAGE_WIDTH / rows));
  return { canvasW, canvasH: pieceH * rows, cols, rows, pieceW, pieceH };
}

/**
 * Crops the full image to one piece with background-position, so every piece
 * shares a single cached raster of the SVG. `scale` shrinks it for the tray.
 */
export function pieceStyle(src: string, g: PuzzleGeometry, piece: number, scale = 1): CSSProperties {
  const { col, row } = pieceSlot(piece, g.cols);
  return {
    width: g.pieceW * scale,
    height: g.pieceH * scale,
    backgroundImage: `url("${src}")`,
    backgroundSize: `${g.canvasW * scale}px ${g.canvasH * scale}px`,
    backgroundPosition: `${-col * g.pieceW * scale}px ${-row * g.pieceH * scale}px`,
  };
}

/** Top-left corner of a slot on the canvas. */
export function slotOrigin(g: PuzzleGeometry, piece: number): { x: number; y: number } {
  const { col, row } = pieceSlot(piece, g.cols);
  return { x: col * g.pieceW, y: row * g.pieceH };
}

/** Which slot a canvas-relative point falls in, or null when outside. */
export function slotAt(g: PuzzleGeometry, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x >= g.canvasW || y >= g.canvasH) return null;
  return Math.floor(y / g.pieceH) * g.cols + Math.floor(x / g.pieceW);
}

/**
 * How far (px) a dropped piece's centre may be from its slot centre and still
 * snap: ~12 % of the canvas width, but never so much that a drop on a
 * neighbouring slot snaps on small grids.
 */
export function snapDistance(g: PuzzleGeometry): number {
  return Math.min(0.12 * g.canvasW, 0.75 * Math.min(g.pieceW, g.pieceH));
}

/** Tray pieces stay finger-sized regardless of the grid. */
export function trayScale(g: PuzzleGeometry): number {
  const target = Math.min(104, Math.max(56, g.pieceH * 0.7));
  return target / g.pieceH;
}
