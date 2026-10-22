//! AI players. Difficulty tuning mirrors `AI_PERSONAS` in
//! packages/game-core/src/ai/index.ts — keep them in sync.

pub mod connect4_ai;
pub mod minimax;
pub mod snake_ladder_ai;
pub mod tic_tac_toe_ai;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AIDifficulty {
    Easy = 0,
    Medium = 1,
    Hard = 2,
    Impossible = 3,
}

impl AIDifficulty {
    /// Probability of a deliberate random move, as the exact f64 the TS
    /// engine compares against (the f32 on AIPlayer is for display only).
    pub fn mistake_threshold(self) -> f64 {
        match self {
            AIDifficulty::Easy => 0.7,
            AIDifficulty::Medium => 0.4,
            AIDifficulty::Hard => 0.1,
            AIDifficulty::Impossible => 0.0,
        }
    }
}

#[wasm_bindgen]
pub struct AIPlayer {
    difficulty: AIDifficulty,
    /// Fake "thinking" delay for UX.
    think_delay_ms: u32,
    /// Chance of a deliberately suboptimal move.
    mistake_rate: f32,
}

#[wasm_bindgen]
impl AIPlayer {
    #[wasm_bindgen(constructor)]
    pub fn new(difficulty: AIDifficulty) -> AIPlayer {
        // (think delay ms, mistake rate): 70% / 40% / 10% / 0% mistakes.
        let (think_delay_ms, mistake_rate) = match difficulty {
            AIDifficulty::Easy => (500, 0.70),
            AIDifficulty::Medium => (1000, 0.40),
            AIDifficulty::Hard => (1500, 0.10),
            AIDifficulty::Impossible => (2000, 0.00),
        };
        AIPlayer {
            difficulty,
            think_delay_ms,
            mistake_rate,
        }
    }

    pub fn get_think_delay(&self) -> u32 {
        self.think_delay_ms
    }

    pub fn get_mistake_rate(&self) -> f32 {
        self.mistake_rate
    }

    pub fn get_difficulty(&self) -> AIDifficulty {
        self.difficulty
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persona_tuning_matches_spec() {
        let p = AIPlayer::new(AIDifficulty::Hard);
        assert_eq!(p.get_think_delay(), 1500);
        assert!((p.get_mistake_rate() - 0.10).abs() < f32::EPSILON);
        assert_eq!(p.get_difficulty(), AIDifficulty::Hard);
    }
}
