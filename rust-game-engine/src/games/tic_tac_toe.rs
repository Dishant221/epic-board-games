//! Tic Tac Toe rules. Seat 0 = X (moves first), seat 1 = O.

use super::{DRAW, EMPTY};

#[rustfmt::skip]
pub const LINES: [[usize; 3]; 8] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TicTacToe {
    /// EMPTY, 0 or 1 per cell.
    pub board: [i8; 9],
    pub turn: u8,
    /// Seat index, DRAW, or None while running.
    pub winner: Option<i8>,
    pub moves: u8,
}

impl Default for TicTacToe {
    fn default() -> Self {
        TicTacToe::new()
    }
}

impl TicTacToe {
    pub fn new() -> TicTacToe {
        TicTacToe {
            board: [EMPTY; 9],
            turn: 0,
            winner: None,
            moves: 0,
        }
    }

    /// Builds a state from a JS-style flat board (`-1` empty, `0`/`1` seats).
    /// Returns None for impossible positions.
    pub fn from_cells(cells: &[i8]) -> Option<TicTacToe> {
        if cells.len() != 9 {
            return None;
        }
        let mut board = [EMPTY; 9];
        let (mut x, mut o) = (0u8, 0u8);
        for (i, &c) in cells.iter().enumerate() {
            match c {
                EMPTY => {}
                0 => x += 1,
                1 => o += 1,
                _ => return None,
            }
            board[i] = c;
        }
        if x != o && x != o + 1 {
            return None;
        }
        let moves = x + o;
        let winner = match find_win(&board) {
            Some(w) => Some(w),
            None if moves == 9 => Some(DRAW),
            None => None,
        };
        Some(TicTacToe {
            board,
            turn: u8::from(x > o),
            winner,
            moves,
        })
    }

    pub fn legal_moves(&self) -> Vec<usize> {
        if self.winner.is_some() {
            return Vec::new();
        }
        (0..9).filter(|&i| self.board[i] == EMPTY).collect()
    }

    pub fn play(&self, cell: usize) -> Result<TicTacToe, &'static str> {
        if self.winner.is_some() || cell > 8 || self.board[cell] != EMPTY {
            return Err("Illegal move");
        }
        let mut board = self.board;
        board[cell] = self.turn as i8;
        let moves = self.moves + 1;
        let winner = match find_win(&board) {
            Some(w) => Some(w),
            None if moves == 9 => Some(DRAW),
            None => None,
        };
        Ok(TicTacToe {
            board,
            turn: 1 - self.turn,
            winner,
            moves,
        })
    }

    pub fn is_terminal(&self) -> bool {
        self.winner.is_some()
    }
}

fn find_win(board: &[i8; 9]) -> Option<i8> {
    LINES.iter().find_map(|&[a, b, c]| {
        let v = board[a];
        (v != EMPTY && v == board[b] && v == board[c]).then_some(v)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_row_win() {
        let mut s = TicTacToe::new();
        for cell in [0, 3, 1, 4, 2] {
            s = s.play(cell).unwrap();
        }
        assert_eq!(s.winner, Some(0));
        assert!(s.legal_moves().is_empty());
    }

    #[test]
    fn detects_draw() {
        let mut s = TicTacToe::new();
        for cell in [0, 1, 2, 4, 3, 5, 7, 6, 8] {
            s = s.play(cell).unwrap();
        }
        assert_eq!(s.winner, Some(DRAW));
    }

    #[test]
    fn rejects_occupied_cell() {
        let s = TicTacToe::new().play(4).unwrap();
        assert!(s.play(4).is_err());
    }

    #[test]
    fn from_cells_derives_turn() {
        let s = TicTacToe::from_cells(&[0, -1, -1, -1, -1, -1, -1, -1, -1]).unwrap();
        assert_eq!(s.turn, 1);
        assert!(TicTacToe::from_cells(&[1, -1, -1, -1, -1, -1, -1, -1, -1]).is_none());
        assert!(TicTacToe::from_cells(&[0; 3]).is_none());
    }
}
