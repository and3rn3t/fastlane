// Deterministic PRNG (mulberry32). The current seed lives in GameState so
// a saved game replays identically.

export function nextSeed(seed: number): number {
  return (seed + 0x6d2b79f5) | 0
}

export function seedToFloat(seed: number): number {
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export interface RngState {
  rngSeed: number
}

/** Advance the state's seed and return a float in [0, 1). */
export function roll(state: RngState): number {
  state.rngSeed = nextSeed(state.rngSeed)
  return seedToFloat(state.rngSeed)
}

/** Advance the state's seed and return an integer in [0, max). */
export function rollInt(state: RngState, max: number): number {
  return Math.floor(roll(state) * max)
}
