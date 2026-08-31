// Legacy perks — small, permanent bonuses that unlock as lifetime stats
// (src/stats.ts) build up across playthroughs, auto-applying to every future
// game once earned. Deliberately has no storage of its own: every perk's
// unlock condition and effect is a pure function of the LifetimeStats that
// already exist, so there's nothing new to persist, migrate, or dedupe —
// just two small read-only helpers layered on data src/stats.ts already
// owns. Kept to perks that don't touch board topology or week.ts's economy
// logic (see the Wave 6 roadmap entry for why those were ruled out for v1).

import type { LifetimeStats } from '@/stats'

export interface LegacyPerk {
  id: string
  name: string
  description: string
  isUnlocked: (stats: LifetimeStats) => boolean
}

/** Extra starting cash the "Head Start" perk grants the player once unlocked. */
export const HEAD_START_BONUS = 50

export const LEGACY_PERKS: LegacyPerk[] = [
  {
    id: 'head-start',
    name: 'Head Start',
    description: `Start every game with $${HEAD_START_BONUS} extra cash.`,
    isUnlocked: (stats) => stats.gamesPlayed >= 3,
  },
  {
    id: 'new-look',
    name: 'New Look',
    description: 'Unlocks an alternate pawn on the board.',
    isUnlocked: (stats) => stats.gamesWon >= 1,
  },
]

/** Head Start's cash effect if unlocked, else 0. Passed as
 * NewGameOptions.playerCashBonus (engine/engine.ts). A second cash-bonus
 * perk would need its own lookup added here — nothing generic stacks yet. */
export function legacyCashBonus(stats: LifetimeStats): number {
  const headStart = LEGACY_PERKS.find((p) => p.id === 'head-start')!
  return headStart.isUnlocked(stats) ? HEAD_START_BONUS : 0
}

/** The player's board pawn glyph — purely cosmetic, read at game-screen
 * render time (see ui/GameScreen.tsx), never touches GameState/the engine. */
export function legacyPawnGlyph(stats: LifetimeStats): string {
  const newLook = LEGACY_PERKS.find((p) => p.id === 'new-look')!
  return newLook.isUnlocked(stats) ? '😎' : '🙂'
}
