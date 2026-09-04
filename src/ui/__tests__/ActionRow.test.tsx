import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CasinoAction } from '@/ui/LocationPanel'
import { ActionRow, NumberField } from '@/ui/ActionRow'
import { newGame, type GameState } from '@/engine'
import { GameProvider } from '@/state/GameContext'

function freshGame(): GameState {
  const goals = { wealth: 4000, happiness: 70, education: 12, career: 30 }
  return newGame({ playerName: 'Tester', goals, seed: 1 })
}

afterEach(cleanup)

describe('ActionRow', () => {
  it('renders label content inside .grow and children after it, both inside .action-row', () => {
    render(
      <ActionRow label={<strong>Label text</strong>}>
        <button>Do it</button>
      </ActionRow>
    )
    const row = document.querySelector('.action-row')!
    expect(row).toBeTruthy()
    expect(row.querySelector('.grow strong')?.textContent).toBe('Label text')
    expect(screen.getByRole('button', { name: 'Do it' })).toBeTruthy()
  })
})

describe('NumberField', () => {
  it('clamps a cleared/invalid field to floor instead of going NaN', () => {
    let value = 5
    const { rerender } = render(
      <NumberField value={value} onChange={(n) => (value = n)} ariaLabel="Amount" floor={0} />
    )
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '' } })
    expect(value).toBe(0)
    rerender(
      <NumberField value={value} onChange={(n) => (value = n)} ariaLabel="Amount" floor={0} />
    )
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('0')
  })

  it('respects a non-default floor (Lottery: never below 1 ticket)', () => {
    let value = 5
    render(
      <NumberField
        value={value}
        onChange={(n) => (value = n)}
        ariaLabel="Tickets"
        floor={1}
        ceil={20}
      />
    )
    fireEvent.change(screen.getByLabelText('Tickets'), { target: { value: '' } })
    expect(value).toBe(1)
  })

  it('respects ceil (Lottery: caps at 20 tickets)', () => {
    let value = 5
    render(
      <NumberField
        value={value}
        onChange={(n) => (value = n)}
        ariaLabel="Tickets"
        floor={1}
        ceil={20}
      />
    )
    fireEvent.change(screen.getByLabelText('Tickets'), { target: { value: '999' } })
    expect(value).toBe(20)
  })

  it('floors fractional/typo input the same way the original inline clamps did', () => {
    let value = 5
    render(<NumberField value={value} onChange={(n) => (value = n)} ariaLabel="Amount" floor={0} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '12.9' } })
    expect(value).toBe(12)
  })

  it('never goes negative on a negative typed value', () => {
    let value = 5
    render(<NumberField value={value} onChange={(n) => (value = n)} ariaLabel="Amount" floor={0} />)
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '-40' } })
    expect(value).toBe(0)
  })

  it('regression: clearing the Casino bet field no longer leaves Spin enabled with a NaN bet', () => {
    // Real bug this fixes: the original inline clamp (`Math.max(0,
    // Math.floor(Number(e.target.value)))`) returns NaN, not 0, once the
    // field is cleared — and CasinoAction's own downstream
    // `Math.min(CASINO_MAX_BET, bet, p.cash)` propagates that NaN, so
    // `disabled={clamped < CASINO_MIN_BET}` (NaN < x is always false) left
    // the Spin button enabled while displaying "bet $NaN, win $NaN".
    render(
      <GameProvider>
        <CasinoAction game={freshGame()} />
      </GameProvider>
    )
    const spin = screen.getByRole('button', { name: /^Spin/ })
    expect((spin as HTMLButtonElement).disabled).toBe(false)

    fireEvent.change(screen.getByLabelText('Bet amount'), { target: { value: '' } })

    expect(screen.getByText(/bet \$0/)).toBeTruthy()
    expect((screen.getByRole('button', { name: /^Spin/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
