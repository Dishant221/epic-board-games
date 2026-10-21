//! Snakes & Ladders has no decisions beyond "roll", so the AI only paces
//! itself. Kept as a module so every game has an AI entry point.

use super::AIDifficulty;
use crate::games::snake_ladder::SnakesLadders;
use crate::utils::Rng;

/// The AI always rolls; returns the die value it would throw.
pub fn take_turn(state: &SnakesLadders, _difficulty: AIDifficulty, rng: &mut Rng) -> Option<u8> {
    if state.winner.is_some() {
        return None;
    }
    Some(rng.int(1, 6) as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_roll_after_game_over() {
        let mut s = SnakesLadders::new(2);
        s.winner = Some(0);
        assert_eq!(take_turn(&s, AIDifficulty::Easy, &mut Rng::new(1)), None);
    }

    #[test]
    fn roll_is_a_die_face() {
        let s = SnakesLadders::new(2);
        let roll = take_turn(&s, AIDifficulty::Hard, &mut Rng::new(9)).unwrap();
        assert!((1..=6).contains(&roll));
    }
}
