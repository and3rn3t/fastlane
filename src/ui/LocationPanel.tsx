import { useState } from 'react'
import {
  FOOD_NEEDED,
  GROCERY_PRICE_MARKET,
  GROCERY_PRICE_MEGAMART,
  JOBS,
  LOCATIONS,
  LOTTERY_TICKET_PRICE,
  MEAL_PRICE,
  RELAX_CAP,
  RENT,
  TUITION,
  groceryCap,
  hasItem,
  itemById,
  jobById,
  price,
  qualifiesFor,
  wagePerHour,
  type GameState,
  type ItemId,
} from '@/engine'
import { useGame } from '@/state/GameContext'
import { LOCATION_ICONS } from './icons'

function WorkAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const [hours, setHours] = useState(8)
  if (!p.jobId) return null
  const job = jobById(p.jobId)
  if (job.workplace !== p.location) return null
  const max = p.timeLeft
  const clamped = Math.min(hours, max)
  const rate = wagePerHour(game, job.id)
  return (
    <div className="action-row">
      <span className="grow">
        Work as <strong>{job.title}</strong> (${rate.toFixed(2)}/h)
      </span>
      <input
        type="range"
        min={1}
        max={Math.max(1, max)}
        value={clamped}
        aria-label="Hours to work"
        onChange={(e) => setHours(Number(e.target.value))}
      />
      <button
        className="primary"
        disabled={max < 1}
        onClick={() => dispatchGame({ type: 'work', hours: clamped })}
      >
        Work {clamped}h (+${Math.round(clamped * rate)})
      </button>
    </div>
  )
}

function JobBoard({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  return (
    <>
      {JOBS.map((job) => {
        const qual = qualifiesFor(p, job.id)
        const isCurrent = p.jobId === job.id
        return (
          <div className="job-listing" key={job.id}>
            <div className="grow">
              <div className="title">
                {job.title} · {LOCATIONS[job.workplace].name}
              </div>
              <div className="meta">
                ${wagePerHour(game, job.id).toFixed(2)}/h · prestige {job.prestige}
                {job.minEducation > 0 && ` · ${job.minEducation} classes`}
                {job.minDress > 0 && ` · dress ${job.minDress}`}
                {job.minExperience > 0 && ` · ${job.minExperience}h exp`}
              </div>
              {!qual.ok && <div className="locked">🔒 {qual.reasons.join(', ')}</div>}
            </div>
            <button
              disabled={!qual.ok || isCurrent}
              onClick={() => dispatchGame({ type: 'applyJob', jobId: job.id })}
            >
              {isCurrent ? 'Current job' : 'Apply (2h)'}
            </button>
          </div>
        )
      })}
    </>
  )
}

function GroceryAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const unitBase = p.location === 'megamart' ? GROCERY_PRICE_MEGAMART : GROCERY_PRICE_MARKET
  const unitPrice = price(game, unitBase)
  const cap = groceryCap(p)
  const room = cap - p.groceries
  const [units, setUnits] = useState(FOOD_NEEDED)
  const clamped = Math.max(1, Math.min(units, room))
  return (
    <div className="action-row">
      <span className="grow">
        Groceries ${unitPrice}/unit — you eat {FOOD_NEEDED}/week.
        <br />
        <span className="desc">
          Stored: {p.groceries}/{cap} {hasItem(p, 'fridge') ? '(fridge)' : '(no fridge)'}
        </span>
      </span>
      <input
        type="range"
        min={1}
        max={Math.max(1, room)}
        value={clamped}
        aria-label="Grocery units"
        onChange={(e) => setUnits(Number(e.target.value))}
        disabled={room < 1}
      />
      <button
        className="primary"
        disabled={room < 1}
        onClick={() => dispatchGame({ type: 'buyGroceries', units: clamped })}
      >
        Buy {clamped} (${unitPrice * clamped}, 1h)
      </button>
    </div>
  )
}

function ShopItems({ game, ids }: { game: GameState; ids: ItemId[] }) {
  const { dispatchGame } = useGame()
  const p = game.player
  return (
    <>
      {ids.map((id) => {
        const item = itemById(id)
        const owned = hasItem(p, id) || (item.dress !== undefined && p.dress >= (item.dress ?? 0))
        return (
          <div className="action-row" key={id}>
            <span className="grow">
              <strong>{item.name}</strong>
              <br />
              <span className="desc">{item.blurb}</span>
            </span>
            <button disabled={owned} onClick={() => dispatchGame({ type: 'buyItem', itemId: id })}>
              {owned ? 'Owned' : `$${price(game, item.price)} (1h)`}
            </button>
          </div>
        )
      })}
    </>
  )
}

function BankActions({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const [amount, setAmount] = useState(100)
  return (
    <div className="action-row">
      <span className="grow">
        Savings: <strong>${p.savings.toLocaleString()}</strong>
        <br />
        <span className="desc">
          {(game.economy.interestRate * 100).toFixed(1)}% interest per week
        </span>
      </span>
      <input
        type="number"
        min={1}
        value={amount}
        aria-label="Amount"
        onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))}
      />
      <button
        disabled={amount < 1 || amount > p.cash}
        onClick={() => dispatchGame({ type: 'deposit', amount })}
      >
        Deposit (1h)
      </button>
      <button
        disabled={amount < 1 || amount > p.savings}
        onClick={() => dispatchGame({ type: 'withdraw', amount })}
      >
        Withdraw (1h)
      </button>
    </div>
  )
}

function RentActions({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  return (
    <>
      {p.rentDue > 0 && (
        <div className="action-row">
          <span className="grow">
            Rent owed: <strong>${p.rentDue}</strong>
            {p.weeksBehindOnRent > 0 && (
              <span className="locked"> — {3 - p.weeksBehindOnRent} week(s) until eviction!</span>
            )}
          </span>
          <button className="primary" onClick={() => dispatchGame({ type: 'payRent' })}>
            Pay rent (1h)
          </button>
        </div>
      )}
      {(['basic', 'secure'] as const).map((tier) => (
        <div className="action-row" key={tier}>
          <span className="grow">
            <strong>{tier === 'basic' ? 'Basic apartment' : 'Secure apartment'}</strong>
            <br />
            <span className="desc">
              ${price(game, RENT[tier])}/week
              {tier === 'secure'
                ? ' · +2 happiness/week, no street robbery'
                : ' · a roof over your head'}
            </span>
          </span>
          <button
            disabled={p.apartment === tier}
            onClick={() => dispatchGame({ type: 'rentApartment', tier })}
          >
            {p.apartment === tier ? 'Current home' : 'Move in (2h, 1st week upfront)'}
          </button>
        </div>
      ))}
    </>
  )
}

function PawnActions({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  if (p.items.length === 0) {
    return <p className="blurb">Nothing to pawn — buy some possessions first.</p>
  }
  return (
    <>
      {p.items.map((id) => {
        const item = itemById(id)
        return (
          <div className="action-row" key={id}>
            <span className="grow">{item.name}</span>
            <button onClick={() => dispatchGame({ type: 'sellItem', itemId: id })}>
              Sell for ${Math.round(price(game, item.price) * 0.5)} (1h)
            </button>
          </div>
        )
      })}
    </>
  )
}

function HomeActions({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const relaxLeft = RELAX_CAP - p.relaxedThisWeek
  const [hours, setHours] = useState(4)
  const clamped = Math.max(1, Math.min(hours, relaxLeft, p.timeLeft))
  if (p.apartment === 'none') {
    return (
      <p className="blurb">
        You don't have a place to live. Sleeping rough costs happiness every week — visit the Rent
        Office soon.
      </p>
    )
  }
  return (
    <div className="action-row">
      <span className="grow">
        Relax (+1 happiness per hour, {relaxLeft}h left this week)
        <br />
        <span className="desc">Pantry: {p.groceries} food units stored</span>
      </span>
      <input
        type="range"
        min={1}
        max={Math.max(1, Math.min(relaxLeft, p.timeLeft))}
        value={clamped}
        aria-label="Hours to relax"
        onChange={(e) => setHours(Number(e.target.value))}
        disabled={relaxLeft < 1}
      />
      <button
        disabled={relaxLeft < 1 || p.timeLeft < 1}
        onClick={() => dispatchGame({ type: 'relax', hours: clamped })}
      >
        Relax {clamped}h
      </button>
    </div>
  )
}

function MealAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  return (
    <div className="action-row">
      <span className="grow">
        Hot meal (+1 food, +1 happiness)
        <br />
        <span className="desc">
          Eaten this week: {game.player.fed}/{FOOD_NEEDED}
        </span>
      </span>
      <button className="primary" onClick={() => dispatchGame({ type: 'buyMeal' })}>
        Eat (${price(game, MEAL_PRICE)}, 2h)
      </button>
    </div>
  )
}

function LotteryAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const [tickets, setTickets] = useState(1)
  return (
    <div className="action-row">
      <span className="grow">
        Lottery — jackpot <strong>${game.economy.lotteryJackpot.toLocaleString()}</strong>
        <br />
        <span className="desc">2% win chance per ticket, drawn at week's end</span>
      </span>
      <input
        type="number"
        min={1}
        max={20}
        value={tickets}
        aria-label="Tickets"
        onChange={(e) => setTickets(Math.max(1, Math.min(20, Math.floor(Number(e.target.value)))))}
      />
      <button onClick={() => dispatchGame({ type: 'buyLottery', tickets })}>
        Buy (${LOTTERY_TICKET_PRICE * tickets}, 1h)
      </button>
    </div>
  )
}

function ClassAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  return (
    <div className="action-row">
      <span className="grow">
        Take a class (+1 education)
        <br />
        <span className="desc">Completed: {game.player.education} classes</span>
      </span>
      <button className="primary" onClick={() => dispatchGame({ type: 'takeClass' })}>
        Enroll (${price(game, TUITION)}, 8h)
      </button>
    </div>
  )
}

export function LocationPanel({ game }: { game: GameState }) {
  const loc = LOCATIONS[game.player.location]
  return (
    <div className="panel sheet">
      <h2>
        <span aria-hidden>{LOCATION_ICONS[loc.id]}</span> {loc.name}
      </h2>
      <p className="blurb">{loc.blurb}</p>
      <WorkAction game={game} />
      {loc.id === 'home' && <HomeActions game={game} />}
      {loc.id === 'home' && hasItem(game.player, 'phone') && (
        <>
          <p className="blurb">📱 Browsing job listings on your phone:</p>
          <JobBoard game={game} />
        </>
      )}
      {loc.id === 'employment' && <JobBoard game={game} />}
      {loc.id === 'burgers' && <MealAction game={game} />}
      {loc.id === 'megamart' && (
        <>
          <GroceryAction game={game} />
          <LotteryAction game={game} />
        </>
      )}
      {loc.id === 'market' && <GroceryAction game={game} />}
      {loc.id === 'university' && <ClassAction game={game} />}
      {loc.id === 'bank' && <BankActions game={game} />}
      {loc.id === 'clothing' && (
        <ShopItems game={game} ids={['outfit-casual', 'outfit-business', 'outfit-pro']} />
      )}
      {loc.id === 'gadgets' && (
        <ShopItems game={game} ids={['fridge', 'tv', 'stereo', 'console', 'bike', 'phone']} />
      )}
      {loc.id === 'pawn' && <PawnActions game={game} />}
      {loc.id === 'rentoffice' && <RentActions game={game} />}
    </div>
  )
}
