//! Pure game rules. Each module mirrors its TypeScript twin in
//! `packages/game-core/src/games/` — keep them in sync.

pub mod connect4;
pub mod snake_ladder;
pub mod tic_tac_toe;

/// Winner value for a drawn game (matches `DRAW` in TS).
pub const DRAW: i8 = -1;

/// Sentinel for an empty cell in board arrays passed from JavaScript.
pub const EMPTY: i8 = -1;
