//! Snakes, Dragons & Ladders rules; mirrors snakes-ladders.ts.

pub const BOARD_SIZE: u8 = 100;
pub const MAX_PLAYERS: u8 = 4;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum JumpKind {
    Ladder = 1,
    Snake = 2,
    Croc = 3,
    Dragon = 4,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Jump {
    pub from: u8,
    pub to: u8,
    pub kind: JumpKind,
}

const fn j(from: u8, to: u8, kind: JumpKind) -> Jump {
    Jump { from, to, kind }
}

/// Start -> end lookup. Must match JUMPS in snakes-ladders.ts exactly.
pub const JUMPS: [Jump; 14] = [
    j(4, 25, JumpKind::Ladder),
    j(13, 46, JumpKind::Ladder),
    j(33, 49, JumpKind::Ladder),
    j(42, 63, JumpKind::Ladder),
    j(50, 69, JumpKind::Ladder),
    j(62, 81, JumpKind::Ladder),
    j(74, 92, JumpKind::Ladder),
    j(27, 5, JumpKind::Snake),
    j(40, 3, JumpKind::Snake),
    j(54, 31, JumpKind::Croc),
    j(66, 45, JumpKind::Snake),
    j(76, 58, JumpKind::Croc),
    j(89, 53, JumpKind::Snake),
    j(99, 41, JumpKind::Dragon),
];

pub fn jump_from(square: u8) -> Option<Jump> {
    JUMPS.iter().copied().find(|jump| jump.from == square)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MoveEvent {
    pub seat: u8,
    pub roll: u8,
    pub from: u8,
    /// Square reached by walking, before any jump.
    pub landed: u8,
    /// Final square after the jump (equals `landed` if none).
    pub to: u8,
    pub jump: Option<Jump>,
    pub bounced: bool,
    pub forfeited: bool,
    pub extra_turn: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SnakesLadders {
    /// 0 = waiting at start, 1..=100 on board.
    pub positions: Vec<u8>,
    pub turn: u8,
    pub six_streak: u8,
    pub winner: Option<u8>,
    pub last_event: Option<MoveEvent>,
    pub turn_count: u32,
}

impl SnakesLadders {
    /// `player_count` is clamped to 1..=4.
    pub fn new(player_count: u8) -> SnakesLadders {
        let n = player_count.clamp(1, MAX_PLAYERS);
        SnakesLadders {
            positions: vec![0; usize::from(n)],
            turn: 0,
            six_streak: 0,
            winner: None,
            last_event: None,
            turn_count: 0,
        }
    }

    /// Applies a die roll (1..=6) for the current player. Same semantics as
    /// `applyRoll` in TS; callers must not roll once there is a winner.
    pub fn apply_roll(&self, roll: u8) -> SnakesLadders {
        let seat = self.turn;
        let from = self.positions[usize::from(seat)];
        let six_streak = if roll == 6 { self.six_streak + 1 } else { 0 };
        let next_seat = (seat + 1) % self.positions.len() as u8;

        // Three sixes in a row: the turn is forfeited and play passes on.
        if six_streak == 3 {
            let mut next = self.clone();
            next.turn = next_seat;
            next.six_streak = 0;
            next.turn_count += 1;
            next.last_event = Some(MoveEvent {
                seat,
                roll,
                from,
                landed: from,
                to: from,
                jump: None,
                bounced: false,
                forfeited: true,
                extra_turn: false,
            });
            return next;
        }

        let target = from + roll;
        let bounced = target > BOARD_SIZE;
        let landed = if bounced { from } else { target };
        let jump = if bounced { None } else { jump_from(landed) };
        let to = jump.map_or(landed, |j| j.to);

        let mut positions = self.positions.clone();
        positions[usize::from(seat)] = to;
        let won = to == BOARD_SIZE;
        let extra_turn = roll == 6 && !won;

        SnakesLadders {
            positions,
            turn: if extra_turn || won { seat } else { next_seat },
            six_streak: if extra_turn { six_streak } else { 0 },
            winner: won.then_some(seat),
            turn_count: self.turn_count + 1,
            last_event: Some(MoveEvent {
                seat,
                roll,
                from,
                landed,
                to,
                jump,
                bounced,
                forfeited: false,
                extra_turn,
            }),
        }
    }
}

/// Board square (1..=100) -> (row, col), boustrophedon from bottom-left.
pub fn square_to_grid(square: u8) -> (u8, u8) {
    let idx = square.clamp(1, BOARD_SIZE) - 1;
    let row = idx / 10;
    let offset = idx % 10;
    let col = if row.is_multiple_of(2) { offset } else { 9 - offset };
    (row, col)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_jump_starts_on_a_unique_square() {
        for (i, a) in JUMPS.iter().enumerate() {
            assert!((1..BOARD_SIZE).contains(&a.from));
            assert!(JUMPS[i + 1..].iter().all(|b| b.from != a.from));
            match a.kind {
                JumpKind::Ladder => assert!(a.to > a.from),
                _ => assert!(a.to < a.from),
            }
        }
    }

    #[test]
    fn grid_is_boustrophedon() {
        assert_eq!(square_to_grid(1), (0, 0));
        assert_eq!(square_to_grid(10), (0, 9));
        assert_eq!(square_to_grid(11), (1, 9));
        assert_eq!(square_to_grid(100), (9, 0));
    }

    #[test]
    fn turn_passes_on_normal_roll() {
        let s = SnakesLadders::new(2).apply_roll(3);
        assert_eq!(s.positions, [3, 0]);
        assert_eq!(s.turn, 1);
    }
}
