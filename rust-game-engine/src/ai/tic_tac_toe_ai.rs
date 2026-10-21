//! Tic Tac Toe AI: full-depth negamax is perfect play at Hard/Impossible.

use wasm_bindgen::prelude::*;

use super::minimax::{choose_move, natural_order, TwoPlayerGame};
use super::AIDifficulty;
use crate::games::tic_tac_toe::TicTacToe;
use crate::games::DRAW;
use crate::utils::Rng;

impl TwoPlayerGame for TicTacToe {
    type Move = usize;

    fn current_player(&self) -> u8 {
        self.turn
    }

    fn legal_moves(&self) -> Vec<usize> {
        TicTacToe::legal_moves(self)
    }

    fn apply(&self, mv: usize) -> TicTacToe {
        self.play(mv).expect("negamax only plays legal moves")
    }

    fn is_terminal(&self) -> bool {
        TicTacToe::is_terminal(self)
    }
}

pub fn depth_for(difficulty: AIDifficulty) -> u32 {
    match difficulty {
        AIDifficulty::Easy => 1,
        AIDifficulty::Medium => 2,
        AIDifficulty::Hard | AIDifficulty::Impossible => 9,
    }
}

/// Prefers faster wins and slower losses.
pub fn evaluate(s: &TicTacToe, seat: u8) -> i32 {
    let moves = i32::from(s.moves);
    match s.winner {
        None | Some(DRAW) => 0,
        Some(w) if w == seat as i8 => 10 - moves,
        Some(_) => moves - 10,
    }
}

pub fn choose(state: &TicTacToe, difficulty: AIDifficulty, rng: &mut Rng) -> Option<usize> {
    choose_move(
        state,
        difficulty,
        depth_for(difficulty),
        rng,
        &evaluate,
        &natural_order::<usize>,
    )
}

#[wasm_bindgen]
pub struct TicTacToeAI {
    difficulty: AIDifficulty,
}

#[wasm_bindgen]
impl TicTacToeAI {
    #[wasm_bindgen(constructor)]
    pub fn new(difficulty: AIDifficulty) -> TicTacToeAI {
        TicTacToeAI { difficulty }
    }

    /// `board`: 9 cells, `-1` empty, `0` = X, `1` = O. Returns the cell to
    /// play, or -1 if the board is invalid or the game is over.
    #[wasm_bindgen(js_name = bestMove)]
    pub fn best_move(&self, board: &[i8], seed: u32) -> i32 {
        let Some(state) = TicTacToe::from_cells(board) else {
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
    fn takes_winning_cell() {
        // X: 0,1 ; O: 3,4 ; X to move must play 2.
        let board = [0, 0, -1, 1, 1, -1, -1, -1, -1];
        let ai = TicTacToeAI::new(AIDifficulty::Impossible);
        assert_eq!(ai.best_move(&board, 1), 2);
    }

    #[test]
    fn invalid_board_returns_minus_one() {
        let ai = TicTacToeAI::new(AIDifficulty::Easy);
        assert_eq!(ai.best_move(&[5; 9], 1), -1);
        assert_eq!(ai.best_move(&[0, 0, 0, 1, 1, -1, -1, -1, -1], 1), -1);
    }
}
