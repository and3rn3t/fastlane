import { useState } from 'react'
import {
  CASINO_MAX_BET,
  CASINO_MIN_BET,
  CASINO_PAYOUT_MULTIPLIER,
  CASINO_WIN_CHANCE,
  DOCTOR_PRICE,
  FOOD_NEEDED,
  GROCERY_PRICE_MARKET,
  GROCERY_PRICE_MEGAMART,
  JOBS,
  LOCATIONS,
  LOTTERY_TICKET_PRICE,
  MAX_PROMOTIONS,
  MEAL_PRICE,
  PROMOTION_PRESTIGE_BONUS,
  PROMOTION_TENURE_WEEKS,
  RELAX_CAP,
  RENT,
  SKILLS,
  SKILL_TRAIN_PRICE,
  TUITION,
  groceryCap,
  hasItem,
  itemById,
  jobById,
  maxLoan,
  price,
  qualifiesFor,
  wagePerHour,
  type GameState,
  type ItemId,
} from '@/engine'
import { useGame } from '@/state/GameContext'
import {
  BankIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  DollarIcon,
  GradCapIcon,
  HomeIcon,
  LockIcon,
  ShieldIcon,
} from './Icon'
import { playPayday, playPurchase } from './sound'

/** A tap-friendly −/+ control replacing a raw range slider for small bounded
 * quantities (hours, units) — the underlying state/dispatch is untouched,
 * only the input control changes. */
function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  suffix,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (next: number) => void
  label: string
  suffix?: string
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
      >
        −
      </button>
      <span className="stepper-val">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
      >
        +
      </button>
    </div>
  )
}

export function WorkAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const [hours, setHours] = useState(8)
  if (!p.jobId) return null
  const job = jobById(p.jobId)
  if (job.workplace !== p.location) return null
  const max = p.timeLeft
  const clamped = Math.min(hours, max)
  const rate = wagePerHour(game, job.id, p.promotionLevel)
  const weeksToPromotion =
    p.promotionLevel < MAX_PROMOTIONS
      ? PROMOTION_TENURE_WEEKS * (p.promotionLevel + 1) - p.jobTenureWeeks
      : 0
  return (
    <div className="action-row">
      <span className="grow">
        Work as <strong>{job.title}</strong> (${rate.toFixed(2)}/h)
        {p.promotionLevel > 0 && ` · promoted ×${p.promotionLevel}`}
        <br />
        <span className="desc">
          {p.promotionLevel >= MAX_PROMOTIONS
            ? 'Fully promoted here'
            : `Next promotion in ${Math.max(1, weeksToPromotion)} week${weeksToPromotion === 1 ? '' : 's'} of showing up`}
        </span>
      </span>
      <Stepper
        value={clamped}
        min={1}
        max={Math.max(1, max)}
        onChange={setHours}
        label="hours to work"
        suffix="h"
      />
      <button
        className="primary"
        disabled={max < 1}
        onClick={() => {
          playPayday()
          dispatchGame({ type: 'work', hours: clamped })
        }}
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
                ${wagePerHour(game, job.id, isCurrent ? p.promotionLevel : 0).toFixed(2)}/h ·
                prestige{' '}
                {job.prestige + (isCurrent ? p.promotionLevel * PROMOTION_PRESTIGE_BONUS : 0)}
                {job.minEducation > 0 && ` · ${job.minEducation} classes`}
                {job.minDress > 0 && ` · dress ${job.minDress}`}
                {job.minExperience > 0 && ` · ${job.minExperience}h exp`}
                {job.minSkills &&
                  Object.entries(job.minSkills).map(([skillId, needed]) => (
                    <span key={skillId}>
                      {' '}
                      · {needed} {skillId} skill
                    </span>
                  ))}
              </div>
              {!qual.ok && (
                <div className="locked">
                  <LockIcon size={12} /> {qual.reasons.join(', ')}
                </div>
              )}
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

export function GroceryAction({ game }: { game: GameState }) {
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
      <Stepper
        value={clamped}
        min={1}
        max={Math.max(1, room)}
        onChange={setUnits}
        label="grocery units"
      />
      <button
        className="primary"
        disabled={room < 1}
        onClick={() => {
          playPurchase()
          dispatchGame({ type: 'buyGroceries', units: clamped })
        }}
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
            <button
              disabled={owned}
              onClick={() => {
                playPurchase()
                dispatchGame({ type: 'buyItem', itemId: id })
              }}
            >
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
        inputMode="numeric"
        enterKeyHint="done"
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

function InvestActions({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const value = Math.round(p.investments * game.economy.marketIndex)
  const [investAmount, setInvestAmount] = useState(100)
  const [sellAmount, setSellAmount] = useState(100)
  return (
    <div className="action-row">
      <span className="grow">
        Invested: <strong>${value.toLocaleString()}</strong>
        <br />
        <span className="desc">
          Market index {game.economy.marketIndex.toFixed(2)}× — real risk, real reward, unlike
          savings
        </span>
      </span>
      <input
        type="number"
        inputMode="numeric"
        enterKeyHint="done"
        min={1}
        value={investAmount}
        aria-label="Invest amount"
        onChange={(e) => setInvestAmount(Math.max(0, Math.floor(Number(e.target.value))))}
      />
      <button
        disabled={investAmount < 1 || investAmount > p.cash}
        onClick={() => dispatchGame({ type: 'invest', amount: investAmount })}
      >
        Invest (1h)
      </button>
      <input
        type="number"
        inputMode="numeric"
        enterKeyHint="done"
        min={1}
        value={sellAmount}
        aria-label="Sell amount"
        onChange={(e) => setSellAmount(Math.max(0, Math.floor(Number(e.target.value))))}
      />
      <button
        disabled={sellAmount < 1 || sellAmount > value}
        onClick={() =>
          dispatchGame({
            type: 'divest',
            units: Math.min(p.investments, sellAmount / game.economy.marketIndex),
          })
        }
      >
        Sell (1h)
      </button>
    </div>
  )
}

function LoanActions({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const [amount, setAmount] = useState(200)
  const limit = maxLoan(p.creditScore)
  const available = Math.max(0, limit - p.loanBalance)
  return (
    <div className="action-row">
      <span className="grow">
        Credit score: <strong>{p.creditScore}</strong> · limit ${limit.toLocaleString()}
        <br />
        <span className={`desc${p.garnished ? ' locked' : ''}`}>
          {p.loanBalance > 0 ? `Owe $${p.loanBalance.toLocaleString()}` : 'No outstanding loan'}
          {p.garnished && ' — wages are being garnished until it clears'}
        </span>
      </span>
      <input
        type="number"
        inputMode="numeric"
        enterKeyHint="done"
        min={1}
        value={amount}
        aria-label="Loan amount"
        onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))}
      />
      <button
        disabled={amount < 1 || amount > available}
        onClick={() => dispatchGame({ type: 'takeLoan', amount })}
      >
        Borrow (1h)
      </button>
      <button
        disabled={amount < 1 || amount > p.loanBalance || amount > p.cash}
        onClick={() => dispatchGame({ type: 'repayLoan', amount })}
      >
        Repay (1h)
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
          <button
            className="primary"
            onClick={() => {
              playPurchase()
              dispatchGame({ type: 'payRent' })
            }}
          >
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
            onClick={() => {
              playPurchase()
              dispatchGame({ type: 'rentApartment', tier })
            }}
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

export function HomeActions({ game }: { game: GameState }) {
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
      <Stepper
        value={clamped}
        min={1}
        max={Math.max(1, Math.min(relaxLeft, p.timeLeft))}
        onChange={setHours}
        label="hours to relax"
        suffix="h"
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

export function MealAction({ game }: { game: GameState }) {
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
      <button
        className="primary"
        onClick={() => {
          playPurchase()
          dispatchGame({ type: 'buyMeal' })
        }}
      >
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
        inputMode="numeric"
        enterKeyHint="done"
        min={1}
        max={20}
        value={tickets}
        aria-label="Tickets"
        onChange={(e) => setTickets(Math.max(1, Math.min(20, Math.floor(Number(e.target.value)))))}
      />
      <button
        onClick={() => {
          playPurchase()
          dispatchGame({ type: 'buyLottery', tickets })
        }}
      >
        Buy (${LOTTERY_TICKET_PRICE * tickets}, 1h)
      </button>
    </div>
  )
}

export function CasinoAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const [bet, setBet] = useState(CASINO_MIN_BET)
  const clamped = Math.max(0, Math.min(CASINO_MAX_BET, bet, p.cash))
  const potentialWin = Math.round(clamped * CASINO_PAYOUT_MULTIPLIER)
  return (
    <div className="action-row">
      <span className="grow">
        The Wheel — bet ${clamped}, win ${potentialWin} ({Math.round(CASINO_WIN_CHANCE * 100)}%
        chance)
        <br />
        <span className="desc">The house always has the edge. Play for fun, not a plan.</span>
      </span>
      <input
        type="number"
        inputMode="numeric"
        enterKeyHint="done"
        min={CASINO_MIN_BET}
        max={Math.min(CASINO_MAX_BET, p.cash)}
        value={bet}
        aria-label="Bet amount"
        onChange={(e) => setBet(Math.max(0, Math.floor(Number(e.target.value))))}
      />
      <button
        className="primary"
        disabled={clamped < CASINO_MIN_BET}
        onClick={() => {
          playPurchase()
          dispatchGame({ type: 'playCasino', bet: clamped })
        }}
      >
        Spin (1h)
      </button>
    </div>
  )
}

export function ClassAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  return (
    <div className="action-row">
      <span className="grow">
        Take a class (+1 education)
        <br />
        <span className="desc">Completed: {game.player.education} classes</span>
      </span>
      <button
        className="primary"
        onClick={() => {
          playPurchase()
          dispatchGame({ type: 'takeClass' })
        }}
      >
        Enroll (${price(game, TUITION)}, 8h)
      </button>
    </div>
  )
}

export function SkillTrainingAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  return (
    <>
      {SKILLS.map((skill) => (
        <div className="action-row" key={skill.id}>
          <span className="grow">
            <strong>{skill.name}</strong> — {Math.round(p.skills[skill.id])}/100
            <br />
            <span className="desc">{skill.blurb}</span>
          </span>
          <button
            disabled={p.skills[skill.id] >= 100}
            onClick={() => {
              playPurchase()
              dispatchGame({ type: 'trainSkill', skillId: skill.id })
            }}
          >
            {p.skills[skill.id] >= 100 ? 'Maxed' : `Train (${price(game, SKILL_TRAIN_PRICE)}, 6h)`}
          </button>
        </div>
      ))}
    </>
  )
}

export function DoctorAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  return (
    <div className="action-row">
      <span className="grow">
        Health: <strong className={p.health < 40 ? 'low' : ''}>{p.health}/100</strong>
        <br />
        <span className="desc">Overwork and living on cheap groceries wear it down.</span>
      </span>
      <button
        className="primary"
        disabled={p.health >= 100}
        onClick={() => {
          playPurchase()
          dispatchGame({ type: 'seeDoctor' })
        }}
      >
        {p.health >= 100 ? 'Feeling great' : `See doctor ($${price(game, DOCTOR_PRICE)}, 3h)`}
      </button>
    </div>
  )
}

/** A titled, icon-headed card grouping related action rows — the
 * grouped-list pattern that replaces a flat stack of action rows at
 * locations with more than one kind of thing to do here. */
function ActionGroup({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="action-group">
      <span className="section-label">
        {icon} {label}
      </span>
      <div className="action-group-body">{children}</div>
    </div>
  )
}

/** Same card, but collapsed behind a <details> disclosure triangle — for
 * the location with the most stacked sub-panels (Bank), so the less-common
 * action isn't competing for space with the common one by default. Native
 * <details>/<summary> gets keyboard/AT support for free. */
function CollapsibleActionGroup({
  label,
  icon,
  children,
}: {
  label: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <details className="action-group">
      <summary className="section-label">
        {icon} {label}
        <ChevronDownIcon size={13} className="disclosure-chevron" />
      </summary>
      <div className="action-group-body">{children}</div>
    </details>
  )
}

export function LocationPanelBody({ game }: { game: GameState }) {
  const loc = LOCATIONS[game.player.location]
  return (
    <>
      <WorkAction game={game} />
      {loc.id === 'home' && (
        <ActionGroup label="Home" icon={<HomeIcon size={15} />}>
          <HomeActions game={game} />
        </ActionGroup>
      )}
      {loc.id === 'home' && hasItem(game.player, 'phone') && (
        <ActionGroup label="Job listings (on your phone)" icon={<BriefcaseIcon size={15} />}>
          <JobBoard game={game} />
        </ActionGroup>
      )}
      {loc.id === 'employment' && <JobBoard game={game} />}
      {loc.id === 'burgers' && <MealAction game={game} />}
      {loc.id === 'megamart' && (
        <>
          <ActionGroup label="Groceries" icon={<DollarIcon size={15} />}>
            <GroceryAction game={game} />
          </ActionGroup>
          <ActionGroup label="Lottery" icon={<DollarIcon size={15} />}>
            <LotteryAction game={game} />
          </ActionGroup>
        </>
      )}
      {loc.id === 'market' && <GroceryAction game={game} />}
      {loc.id === 'university' && (
        <>
          <ActionGroup label="Classes" icon={<GradCapIcon size={15} />}>
            <ClassAction game={game} />
          </ActionGroup>
          <ActionGroup label="Skill training" icon={<BriefcaseIcon size={15} />}>
            <SkillTrainingAction game={game} />
          </ActionGroup>
        </>
      )}
      {loc.id === 'bank' && (
        <>
          <ActionGroup label="Savings" icon={<BankIcon size={15} />}>
            <BankActions game={game} />
          </ActionGroup>
          <ActionGroup label="Investing" icon={<DollarIcon size={15} />}>
            <InvestActions game={game} />
          </ActionGroup>
          <CollapsibleActionGroup label="Loans" icon={<DollarIcon size={15} />}>
            <LoanActions game={game} />
          </CollapsibleActionGroup>
          <ActionGroup label="Protection" icon={<ShieldIcon size={15} />}>
            <ShopItems game={game} ids={['insurance']} />
          </ActionGroup>
        </>
      )}
      {loc.id === 'clothing' && (
        <ShopItems game={game} ids={['outfit-casual', 'outfit-business', 'outfit-pro']} />
      )}
      {loc.id === 'gadgets' && (
        <ShopItems
          game={game}
          ids={['fridge', 'tv', 'stereo', 'console', 'bike', 'phone', 'computer']}
        />
      )}
      {loc.id === 'pawn' && <PawnActions game={game} />}
      {loc.id === 'rentoffice' && <RentActions game={game} />}
      {loc.id === 'clinic' && <DoctorAction game={game} />}
      {loc.id === 'casino' && <CasinoAction game={game} />}
    </>
  )
}
