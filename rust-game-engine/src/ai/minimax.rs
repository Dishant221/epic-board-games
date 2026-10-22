//! Generic negamax with alpha-beta pruning for two-player, zero-sum,
//! deterministic games. Same algorithm (and tie-breaking: first strictly
//! better move wins) as `negamax` in packages/game-core/src/ai/index.ts.

use super::AIDifficulty;
use crate::utils::Rng;

pub const INF: i32 = 1 << 30;

pub trait TwoPlayerGame: Clone {
    type Move: Copy;
    fn current_player(&self) -> u8;
    fn legal_moves(&self) -> Vec<Self::Move>;
    /// Applies a move known to be legal.
    fn apply(&self, mv: Self::Move) -> Self;
    fn is_terminal(&self) -> bool;
}

/// Returns (score from the side-to-move's perspective, best move).
pub fn negamax<G, E, O>(
    state: &G,
    depth: u32,
    evaluate: &E,
    mut alpha: i32,
    beta: i32,
    order: &O,
) -> (i32, Option<G::Move>)
where
    G: TwoPlayerGame,
    E: Fn(&G, u8) -> i32,
    O: Fn(&mut [G::Move]),
{
    let seat = state.current_player();
    if depth == 0 || state.is_terminal() {
        return (evaluate(state, seat), None);
    }
    let mut moves = state.legal_moves();
    if moves.is_empty() {
        return (evaluate(state, seat), None);
    }
    order(moves.as_mut_slice());

    let mut best_score = i32::MIN;
    let mut best_move = None;
    for mv in moves {
        let child = state.apply(mv);
        let score = -negamax(&child, depth - 1, evaluate, -beta, -alpha, order).0;
        if score > best_score {
            best_score = score;
            best_move = Some(mv);
        }
        alpha = alpha.max(score);
        if alpha >= beta {
            break;
        }
    }
    (best_score, best_move)
}

/// Shared move picker: roll against the mistake rate (random legal move),
/// otherwise search to `depth`. Consumes the RNG exactly like `chooseMove`.
pub fn choose_move<G, E, O>(
    state: &G,
    difficulty: AIDifficulty,
    depth: u32,
    rng: &mut Rng,
    evaluate: &E,
    order: &O,
) -> Option<G::Move>
where
    G: TwoPlayerGame,
    E: Fn(&G, u8) -> i32,
    O: Fn(&mut [G::Move]),
{
    let moves = state.legal_moves();
    match moves.len() {
        0 => return None,
        1 => return Some(moves[0]),
        _ => {}
    }
    if rng.next_f64() < difficulty.mistake_threshold() {
        return Some(*rng.pick(&moves));
    }
    let (_, best) = negamax(state, depth, evaluate, -INF, INF, order);
    best.or_else(|| Some(*rng.pick(&moves)))
}

/// Order function that leaves moves as generated.
pub fn natural_order<M>(_: &mut [M]) {}
