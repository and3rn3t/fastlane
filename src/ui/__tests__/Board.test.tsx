import { describe, expect, it } from 'vitest'
import { perimeterForSize } from '@/ui/Board'

// The exact 14-tuple array Board.tsx hardcoded before Wave 15's data-driven
// geometry refactor — kept here as the golden reference so `perimeterForSize`
// is proven to render byte-identically at the board's current size.
const LEGACY_PERIMETER_14: Array<[number, number]> = [
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [3, 4],
  [4, 4],
  [5, 4],
  [5, 3],
  [5, 2],
  [5, 1],
  [4, 1],
  [3, 1],
  [2, 1],
  [2, 4],
]

describe('perimeterForSize', () => {
  it('reproduces the legacy 14-location board byte-identically', () => {
    expect(perimeterForSize(14)).toEqual(LEGACY_PERIMETER_14)
  })

  it('uses every cell of the smallest grid exactly once, with no duplicates', () => {
    const cells = perimeterForSize(14)
    expect(cells).toHaveLength(14)
    const unique = new Set(cells.map(([r, c]) => `${r},${c}`))
    expect(unique.size).toBe(14)
  })
})
