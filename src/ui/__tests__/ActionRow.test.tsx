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
  it('renders label content inside .grow, followed by children as direct siblings, inside .action-row', () => {
    render(
      <ActionRow label={<strong>Label text</strong>}>
        <button>Do it</button>
      </ActionRow>
    )
    const row = document.querySelector('.action-row')!
    expect(row).toBeTruthy()
    // Direct-child order, not just presence anywhere in the document — a
    // button that got hoisted out of .action-row, or reordered ahead of the
    // label, should fail this the same way losing it entirely would.
    expect(row.children).toHaveLength(2)
    expect(row.children[0].className).toBe('grow')
    expect(row.children[0].querySelector('strong')?.textContent).toBe('Label text')
    expect(row.children[1].tagName).toBe('BUTTON')
    expect(row.children[1].textContent).toBe('Do it')
  })

  it('renders just the label with no children, since a future row may have no trailing control', () => {
    render(<ActionRow label="Just a label" />)
    const row = document.querySelector('.action-row')!
    expect(row.children).toHaveLength(1)
    expect(row.children[0].className).toBe('grow')
    expect(row.textContent).toBe('Just a label')
  })
})

describe('NumberField', () => {
  it('resets to floor on a cleared field', () => {
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

  it('floors fractional input the same way the original inline clamps did', () => {
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

  it('CasinoAction: clearing the bet field resets it to $0 and disables Spin', () => {
    // Integration check that the shared field is wired up correctly in a
    // real caller, not a regression test — CASINO_MIN_BET is > 0, so a
    // cleared/zeroed bet has always correctly disabled Spin here, before
    // and after this component moved onto NumberField.
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
