//! Connect 4 rules on a 7x6 grid. `board[col][row]`, row 0 is the bottom.

use super::{DRAW, EMPTY};

pub const COLS: usize = 7;
pub const ROWS: usize = 6;

/// Same order as DIRS in connect4.ts (affects nothing but keep it aligned).
const DIRS: [(i32, i32); 4] = [(1, 0), (0, 1), (1, 1), (1, -1)];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Connect4 {
    pub board: [[i8; ROWS]; COLS],
    pub turn: u8,
    pub winner: Option<i8>,
    pub moves: u8,
}

impl Default for Connect4 {
    fn default() -> Self {
        Connect4::new()
    }
}

impl Connect4 {
    pub fn new() -> Connect4 {
        Connect4 {
            board: [[EMPTY; ROWS]; COLS],
            turn: 0,
            winner: None,
            moves: 0,
        }
    }

    /// Builds a state from a flat JS board of 42 cells, index `col * 6 + row`.
    /// Returns None for impossible positions (floating discs, bad counts).
    pub fn from_cells(cells: &[i8]) -> Option<Connect4> {
        if cells.len() != COLS * ROWS {
            return None;
        }
        let mut s = Connect4::new();
        let (mut p0, mut p1) = (0u8, 0u8);
        for col in 0..COLS {
            let mut seen_empty = false;
            for row in 0..ROWS {
                let v = cells[col * ROWS + row];
                match v {
                    EMPTY => seen_empty = true,
                    0 | 1 if seen_empty => return None,
                    0 => p0 += 1,
                    1 => p1 += 1,
                    _ => return None,
                }
                s.board[col][row] = v;
            }
        }
        if p0 != p1 && p0 != p1 + 1 {
            return None;
        }
        s.turn = u8::from(p0 > p1);
        s.moves = p0 + p1;
        s.winner = s.scan_winner();
        if s.winner.is_none() && usize::from(s.moves) == COLS * ROWS {
            s.winner = Some(DRAW);
        }
        Some(s)
    }

    /// Cell value, or None when out of bounds.
    pub fn cell(&self, col: i32, row: i32) -> Option<i8> {
        if !(0..COLS as i32).contains(&col) || !(0..ROWS as i32).contains(&row) {
            return None;
        }
        Some(self.board[col as usize][row as usize])
    }

    pub fn legal_moves(&self) -> Vec<usize> {
        if self.winner.is_some() {
            return Vec::new();
        }
        (0..COLS)
            .filter(|&c| self.board[c][ROWS - 1] == EMPTY)
            .collect()
    }

    pub fn play(&self, col: usize) -> Result<Connect4, &'static str> {
        if self.winner.is_some() || col >= COLS {
            return Err("Illegal move");
        }
        let row = self.board[col]
            .iter()
            .position(|&v| v == EMPTY)
            .ok_or("Column is full")?;
        let mut next = self.clone();
        next.board[col][row] = self.turn as i8;
        next.turn = 1 - self.turn;
        next.moves = self.moves + 1;
        if next.wins_at(col as i32, row as i32) {
            next.winner = Some(self.turn as i8);
        } else if usize::from(next.moves) == COLS * ROWS {
            next.winner = Some(DRAW);
        }
        Ok(next)
    }

    pub fn is_terminal(&self) -> bool {
        self.winner.is_some()
    }

    fn wins_at(&self, col: i32, row: i32) -> bool {
        let me = match self.cell(col, row) {
            Some(v) if v != EMPTY => v,
            _ => return false,
        };
        DIRS.iter().any(|&(dc, dr)| {
            let mut count = 1;
            for sign in [1, -1] {
                let (mut c, mut r) = (col + dc * sign, row + dr * sign);
                while self.cell(c, r) == Some(me) {
                    count += 1;
                    c += dc * sign;
                    r += dr * sign;
                }
            }
            count >= 4
        })
    }

    fn scan_winner(&self) -> Option<i8> {
        for col in 0..COLS as i32 {
            for row in 0..ROWS as i32 {
                if self.wins_at(col, row) {
                    return self.cell(col, row);
                }
            }
        }
        None
    }
}

/// Heuristic score from `seat`'s perspective; identical to
/// `evaluateConnect4` in connect4.ts.
pub fn evaluate(s: &Connect4, seat: u8) -> i32 {
    let moves = i32::from(s.moves);
    match s.winner {
        Some(w) if w == seat as i8 => return 1_000_000 - moves,
        Some(DRAW) => return 0,
        Some(_) => return -1_000_000 + moves,
        None => {}
    }
    let me = seat as i8;
    let mut score = 0;
    // Centre column control is the strongest positional factor.
    for &v in s.board[3].iter() {
        if v == me {
            score += 3;
        } else if v != EMPTY {
            score -= 3;
        }
    }
    for col in 0..COLS as i32 {
        for row in 0..ROWS as i32 {
            for &(dc, dr) in DIRS.iter() {
                let (mut mine, mut theirs) = (0, 0);
                let mut in_bounds = true;
                for k in 0..4 {
                    match s.cell(col + dc * k, row + dr * k) {
                        None => {
                            in_bounds = false;
                            break;
                        }
                        Some(v) if v == me => mine += 1,
                        Some(EMPTY) => {}
                        Some(_) => theirs += 1,
                    }
                }
                if !in_bounds || (mine > 0 && theirs > 0) {
                    continue;
                }
                if mine == 3 {
                    score += 5;
                } else if mine == 2 {
                    score += 2;
                }
                if theirs == 3 {
                    score -= 4;
                } else if theirs == 2 {
                    score -= 1;
                }
            }
        }
    }
    score
}

#[cfg(test)]
mod tests {
    use super::*;

    fn play_all(cols: &[usize]) -> Connect4 {
        let mut s = Connect4::new();
        for &c in cols {
            s = s.play(c).expect("legal");
        }
        s
    }

    #[test]
    fn vertical_win() {
        let s = play_all(&[0, 1, 0, 1, 0, 1, 0]);
        assert_eq!(s.winner, Some(0));
    }

    #[test]
    fn diagonal_win() {
        // 0 builds a / diagonal from (0,0) to (3,3).
        let s = play_all(&[0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
        assert_eq!(s.winner, Some(0));
    }

    #[test]
    fn full_column_is_illegal() {
        let s = play_all(&[0, 0, 0, 0, 0, 0]);
        assert!(s.play(0).is_err());
        assert!(!s.legal_moves().contains(&0));
    }

    #[test]
    fn from_cells_round_trip() {
        let s = play_all(&[3, 3, 4]);
        let mut cells = [EMPTY; COLS * ROWS];
        for col in 0..COLS {
            for row in 0..ROWS {
                cells[col * ROWS + row] = s.board[col][row];
            }
        }
        assert_eq!(Connect4::from_cells(&cells), Some(s));
    }

    #[test]
    fn from_cells_rejects_floating_disc() {
        let mut cells = [EMPTY; COLS * ROWS];
        cells[1] = 0; // col 0, row 1 with row 0 empty
        assert!(Connect4::from_cells(&cells).is_none());
    }

    #[test]
    fn evaluate_prefers_centre() {
        let centre = play_all(&[3]);
        let edge = play_all(&[0]);
        assert!(evaluate(&centre, 0) > evaluate(&edge, 0));
    }
}
