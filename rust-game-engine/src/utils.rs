//! Seedable PRNG, bit-for-bit identical to `packages/game-core/src/rng.ts`
//! (mulberry32). Same seed => same dice rolls and AI "mistakes" in both
//! engines, which is what the parity tests rely on.

#[derive(Clone, Debug)]
pub struct Rng {
    a: u32,
}

impl Rng {
    pub fn new(seed: u32) -> Rng {
        Rng { a: seed }
    }

    /// Seed from the platform CSPRNG (crypto.getRandomValues on wasm).
    pub fn from_entropy() -> Rng {
        Rng::new(random_seed())
    }

    /// Raw 32-bit output; `next_f64` is this divided by 2^32.
    pub fn next_u32(&mut self) -> u32 {
        self.a = self.a.wrapping_add(0x6d2b_79f5);
        let mut t = self.a;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        t ^ (t >> 14)
    }

    /// Float in [0, 1).
    pub fn next_f64(&mut self) -> f64 {
        f64::from(self.next_u32()) / 4_294_967_296.0
    }

    /// Integer in [min, max] inclusive.
    pub fn int(&mut self, min: i32, max: i32) -> i32 {
        min + (self.next_f64() * f64::from(max - min + 1)).floor() as i32
    }

    pub fn pick<'a, T>(&mut self, items: &'a [T]) -> &'a T {
        assert!(!items.is_empty(), "pick() from empty list");
        let idx = (self.next_f64() * items.len() as f64).floor() as usize;
        &items[idx.min(items.len() - 1)]
    }

    pub fn state(&self) -> u32 {
        self.a
    }
}

pub fn random_seed() -> u32 {
    let mut buf = [0u8; 4];
    match getrandom::getrandom(&mut buf) {
        Ok(()) => u32::from_le_bytes(buf),
        // Entropy failure is not a security boundary here (dice for local
        // play); online rooms seed from the Durable Object instead.
        Err(_) => 0x9e37_79b9,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_typescript_mulberry32() {
        // Reference values produced by packages/game-core/src/rng.ts.
        let mut r = Rng::new(42);
        assert_eq!(r.next_u32(), 2_581_720_956);
        assert_eq!(r.next_u32(), 1_925_393_290);
        assert_eq!(r.next_u32(), 3_661_312_704);
    }

    #[test]
    fn dice_match_typescript() {
        let mut r = Rng::new(123_456_789);
        let rolls: Vec<i32> = (0..10).map(|_| r.int(1, 6)).collect();
        assert_eq!(rolls, [2, 6, 5, 2, 2, 5, 5, 2, 1, 1]);
    }

    #[test]
    fn int_stays_in_range() {
        let mut r = Rng::new(1);
        for _ in 0..10_000 {
            let v = r.int(1, 6);
            assert!((1..=6).contains(&v));
        }
    }
}
