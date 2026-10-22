//! Connect 4 AI: alpha-beta over `connect4::evaluate`, centre-first ordering.

use wasm_bindgen::prelude::*;

use super::minimax::{choose_move, negamax, TwoPlayerGame, INF};
use super::AIDifficulty;
use crate::games::connect4::{evaluate, Connect4};
use crate::utils::Rng;

impl TwoPlayerGame for Connect4 {
    type Move = usize;

    fn current_player(&self) -> u8 {
        self.turn
    }

    fn legal_moves(&self) -> Vec<usize> {
        Connect4::legal_moves(self)
    }

    fn apply(&self, mv: usize) -> Connect4 {
        self.play(mv).expect("negamax only plays legal moves")
    }

    fn is_terminal(&self) -> bool {
        Connect4::is_terminal(self)
    }
}

pub fn depth_for(difficulty: AIDifficulty) -> u32 {
    match difficulty {
        AIDifficulty::Easy => 1,
        AIDifficulty::Medium => 3,
        AIDifficulty::Hard => 6,
        AIDifficulty::Impossible => 8,
    }
}

/// Stable sort by distance from the centre column (matches `centreFirst`).
pub fn centre_first(moves: &mut [usize]) {
    moves.sort_by_key(|&c| (c as i32 - 3).abs());
}

pub fn choose(state: &Connect4, difficulty: AIDifficulty, rng: &mut Rng) -> Option<usize> {
    choose_move(
        state,
        difficulty,
        depth_for(difficulty),
        rng,
        &evaluate,
        &centre_first,
    )
}

/// Pure search with no mistake roll; handy for tests and analysis tools.
pub fn search(state: &Connect4, depth: u32) -> Option<usize> {
    negamax(state, depth, &evaluate, -INF, INF, &centre_first).1
}

#[wasm_bindgen]
pub struct Connect4AI {
    difficulty: AIDifficulty,
}

#[wasm_bindgen]
impl Connect4AI {
    #[wasm_bindgen(constructor)]
    pub fn new(difficulty: AIDifficulty) -> Connect4AI {
        Connect4AI { difficulty }
    }

    /// `board`: 42 cells indexed `col * 6 + row` (row 0 = bottom), `-1`
    /// empty, `0`/`1` seats. Returns the column, or -1 if invalid / over.
    #[wasm_bindgen(js_name = bestMove)]
    pub fn best_move(&self, board: &[i8], seed: u32) -> i32 {
        let Some(state) = Connect4::from_cells(board) else {
            return -1;
        };
        let mut rng = Rng::new(seed);
        let mv = choose(&state, self.difficulty, &mut rng);
        mv.map_or(-1, |m| m as i32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn centre_first_is_stable() {
        let mut moves: Vec<usize> = (0..7).collect();
        centre_first(&mut moves);
        assert_eq!(moves, [3, 2, 4, 1, 5, 0, 6]);
    }

    #[test]
    fn opening_move_is_centre() {
        assert_eq!(search(&Connect4::new(), 4), Some(3));
    }
}
