//! Epic Board Games engine: game rules and AI compiled to WebAssembly.
//!
//! The TypeScript engine in `packages/game-core` is the reference
//! implementation; this crate must produce identical results for the same
//! inputs and RNG seed (see README "Parity contract").

#![allow(clippy::needless_range_loop)]

pub mod ai;
pub mod games;
pub mod utils;

use wasm_bindgen::prelude::*;

use games::snake_ladder::{self, SnakesLadders, BOARD_SIZE, JUMPS};
use utils::Rng;

/// Snakes, Dragons & Ladders board exposed to JavaScript.
#[wasm_bindgen]
pub struct GameBoard {
    game: SnakesLadders,
    rng: Rng,
}

#[wasm_bindgen]
impl GameBoard {
    /// `player_count` is clamped to 1..=4. Pass `seed = 0` for a random seed.
    #[wasm_bindgen(constructor)]
    pub fn new(player_count: u8, seed: u32) -> GameBoard {
        let rng = if seed == 0 {
            Rng::from_entropy()
        } else {
            Rng::new(seed)
        };
        GameBoard {
            game: SnakesLadders::new(player_count),
            rng,
        }
    }

    /// Rolls the die for the current player and applies the move.
    /// Returns the rolled value (1..=6), or 0 if the game is already over.
    pub fn roll(&mut self) -> u8 {
        if self.game.winner.is_some() {
            return 0;
        }
        let roll = self.rng.int(1, 6) as u8;
        self.game = self.game.apply_roll(roll);
        roll
    }

    /// Applies a specific roll (clamped to 1..=6). For replays and tests.
    #[wasm_bindgen(js_name = forceRoll)]
    pub fn force_roll(&mut self, roll: u8) {
        if self.game.winner.is_none() {
            self.game = self.game.apply_roll(roll.clamp(1, 6));
        }
    }

    /// One entry per player: 0 = start, 1..=100 = board square.
    pub fn positions(&self) -> Vec<u8> {
        self.game.positions.clone()
    }

    #[wasm_bindgen(js_name = currentPlayer)]
    pub fn current_player(&self) -> u8 {
        self.game.turn
    }

    /// Winning seat, or -1 while the game is running.
    pub fn winner(&self) -> i32 {
        self.game.winner.map_or(-1, i32::from)
    }

    #[wasm_bindgen(js_name = lastRoll)]
    pub fn last_roll(&self) -> u8 {
        self.game.last_event.map_or(0, |e| e.roll)
    }

    #[wasm_bindgen(js_name = lastFrom)]
    pub fn last_from(&self) -> u8 {
        self.game.last_event.map_or(0, |e| e.from)
    }

    /// Square reached by walking, before any jump (for animation).
    #[wasm_bindgen(js_name = lastLanded)]
    pub fn last_landed(&self) -> u8 {
        self.game.last_event.map_or(0, |e| e.landed)
    }

    #[wasm_bindgen(js_name = lastTo)]
    pub fn last_to(&self) -> u8 {
        self.game.last_event.map_or(0, |e| e.to)
    }

    /// 0 = none, 1 = ladder, 2 = snake, 3 = croc, 4 = dragon.
    #[wasm_bindgen(js_name = lastJumpKind)]
    pub fn last_jump_kind(&self) -> u8 {
        let jump = self.game.last_event.and_then(|e| e.jump);
        jump.map_or(0, |j| j.kind as u8)
    }

    #[wasm_bindgen(js_name = lastBounced)]
    pub fn last_bounced(&self) -> bool {
        self.game.last_event.is_some_and(|e| e.bounced)
    }

    #[wasm_bindgen(js_name = lastForfeited)]
    pub fn last_forfeited(&self) -> bool {
        self.game.last_event.is_some_and(|e| e.forfeited)
    }

    #[wasm_bindgen(js_name = lastExtraTurn)]
    pub fn last_extra_turn(&self) -> bool {
        self.game.last_event.is_some_and(|e| e.extra_turn)
    }

    #[wasm_bindgen(js_name = turnCount)]
    pub fn turn_count(&self) -> u32 {
        self.game.turn_count
    }

    /// Flat `[from, to, kind, from, to, kind, ...]` jump table.
    pub fn jumps() -> Vec<u8> {
        JUMPS
            .iter()
            .flat_map(|j| [j.from, j.to, j.kind as u8])
            .collect()
    }

    #[wasm_bindgen(js_name = boardSize)]
    pub fn board_size() -> u8 {
        BOARD_SIZE
    }

    /// `[row, col]` of a square, boustrophedon from bottom-left.
    #[wasm_bindgen(js_name = squareToGrid)]
    pub fn square_to_grid(square: u8) -> Vec<u8> {
        let (row, col) = snake_ladder::square_to_grid(square);
        vec![row, col]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeded_rolls_match_typescript_dice() {
        // Same seed as utils::tests::dice_match_typescript.
        let mut board = GameBoard::new(2, 123_456_789);
        assert_eq!(board.roll(), 2);
        assert_eq!(board.positions(), [2, 0]);
        assert_eq!(board.current_player(), 1);
    }

    #[test]
    fn jump_table_is_flat_triples() {
        let flat = GameBoard::jumps();
        assert_eq!(flat.len(), JUMPS.len() * 3);
        assert_eq!(&flat[..3], &[4, 25, 1]);
    }

    #[test]
    fn player_count_is_clamped() {
        assert_eq!(GameBoard::new(9, 1).positions().len(), 4);
        assert_eq!(GameBoard::new(0, 1).positions().len(), 1);
    }
}
