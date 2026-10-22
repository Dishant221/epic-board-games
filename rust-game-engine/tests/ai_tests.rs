use epic_game_engine::ai::minimax::TwoPlayerGame;
use epic_game_engine::ai::{connect4_ai, tic_tac_toe_ai, AIDifficulty};
use epic_game_engine::games::connect4::Connect4;
use epic_game_engine::games::snake_ladder::{JumpKind, SnakesLadders};
use epic_game_engine::games::tic_tac_toe::TicTacToe;
use epic_game_engine::utils::Rng;

/// Walks every possible opponent reply; the AI must never lose.
fn assert_ai_never_loses(state: &TicTacToe, ai_seat: u8) {
    if state.is_terminal() {
        assert_ne!(
            state.winner,
            Some((1 - ai_seat) as i8),
            "AI lost: {:?}",
            state.board
        );
        return;
    }
    if state.turn == ai_seat {
        let mut rng = Rng::new(7);
        let mv = tic_tac_toe_ai::choose(state, AIDifficulty::Impossible, &mut rng);
        assert_ai_never_loses(&state.apply(mv.expect("AI has a move")), ai_seat);
    } else {
        for mv in TwoPlayerGame::legal_moves(state) {
            assert_ai_never_loses(&state.apply(mv), ai_seat);
        }
    }
}

#[test]
fn tic_tac_toe_impossible_never_loses_as_x() {
    assert_ai_never_loses(&TicTacToe::new(), 0);
}

#[test]
fn tic_tac_toe_impossible_never_loses_as_o() {
    assert_ai_never_loses(&TicTacToe::new(), 1);
}

fn connect4_after(cols: &[usize]) -> Connect4 {
    let mut s = Connect4::new();
    for &c in cols {
        s = s.play(c).expect("legal");
    }
    s
}

#[test]
fn connect4_takes_immediate_win() {
    // Seat 0 has the bottom row in cols 0-2 and is to move.
    let s = connect4_after(&[0, 6, 1, 6, 2, 5]);
    assert_eq!(s.turn, 0);
    assert_eq!(connect4_ai::search(&s, 4), Some(3));
}

#[test]
fn connect4_blocks_immediate_loss() {
    // Seat 1 threatens cols 0-2 + 3 on the bottom row; seat 0 must block.
    let s = connect4_after(&[6, 0, 6, 1, 5, 2]);
    assert_eq!(s.turn, 0);
    assert_eq!(connect4_ai::search(&s, 4), Some(3));
}

#[test]
fn connect4_impossible_has_no_mistakes() {
    let s = connect4_after(&[0, 6, 1, 6, 2, 5]);
    let mut rng = Rng::new(99);
    let mv = connect4_ai::choose(&s, AIDifficulty::Impossible, &mut rng);
    assert_eq!(mv, Some(3));
}

fn at(positions: &[u8]) -> SnakesLadders {
    let mut s = SnakesLadders::new(positions.len() as u8);
    s.positions = positions.to_vec();
    s
}

#[test]
fn snakes_ladder_climbs() {
    let s = at(&[0, 0]).apply_roll(4);
    let e = s.last_event.unwrap();
    assert_eq!((e.landed, e.to), (4, 25));
    assert_eq!(e.jump.unwrap().kind, JumpKind::Ladder);
    assert_eq!(s.turn, 1);
}

#[test]
fn snakes_snake_bites() {
    let s = at(&[23, 0]).apply_roll(4);
    assert_eq!(s.positions[0], 5);
    assert_eq!(s.last_event.unwrap().jump.unwrap().kind, JumpKind::Snake);
}

#[test]
fn snakes_dragon_on_99() {
    let s = at(&[97, 0]).apply_roll(2);
    assert_eq!(s.positions[0], 41);
    assert_eq!(s.last_event.unwrap().jump.unwrap().kind, JumpKind::Dragon);
}

#[test]
fn snakes_overshoot_bounces_and_passes_turn() {
    let s = at(&[98, 0]).apply_roll(5);
    let e = s.last_event.unwrap();
    assert!(e.bounced);
    assert_eq!(s.positions[0], 98);
    assert_eq!(s.turn, 1);
}

#[test]
fn snakes_exact_100_wins() {
    let s = at(&[97, 0]).apply_roll(3);
    assert_eq!(s.winner, Some(0));
    assert_eq!(s.turn, 0);
}

#[test]
fn snakes_six_gives_extra_turn() {
    let s = at(&[0, 0]).apply_roll(6);
    assert_eq!(s.turn, 0);
    assert_eq!(s.six_streak, 1);
    assert!(s.last_event.unwrap().extra_turn);
}

#[test]
fn snakes_three_sixes_forfeit() {
    let s = at(&[0, 0]).apply_roll(6).apply_roll(6);
    assert_eq!(s.positions[0], 12);
    let s = s.apply_roll(6);
    let e = s.last_event.unwrap();
    assert!(e.forfeited);
    assert_eq!(s.positions[0], 12);
    assert_eq!(s.turn, 1);
    assert_eq!(s.six_streak, 0);
}
