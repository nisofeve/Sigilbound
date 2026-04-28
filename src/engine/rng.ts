// Mulberry32: tiny seeded PRNG. Same seed → same sequence on client and cloud.
// Keep this implementation byte-identical between platforms — anti-cheat depends on it.
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number) {
  const rand = mulberry32(seed);
  return {
    next: rand,
    int(maxExclusive: number): number {
      return Math.floor(rand() * maxExclusive);
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(rand() * arr.length)];
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;
