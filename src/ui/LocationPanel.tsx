import { useState } from 'react'
import { ActionGroup, ActionRow, CollapsibleActionGroup, NumberField, Stepper } from './ActionRow'
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
  SKILL_TRAIN_TIME,
  SKILL_TRAIN_PRICE,
  TUITION,
  groceryCap,
  hasItem,
  itemById,
  jobById,
  jobRequirements,
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
  CheckIcon,
  DollarIcon,
  GradCapIcon,
  HomeIcon,
  LockIcon,
  ShieldIcon,
} from './Icon'
import { playPayday, playPurchase } from './sound'

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
    <ActionRow
      label={
        <>
          Work as <strong>{job.title}</strong> (${rate.toFixed(2)}/h)
          {p.promotionLevel > 0 && ` · promoted ×${p.promotionLevel}`}
          <br />
          <span className="desc">
            {p.promotionLevel >= MAX_PROMOTIONS
              ? 'Fully promoted here'
              : `Next promotion in ${Math.max(1, weeksToPromotion)} week${weeksToPromotion === 1 ? '' : 's'} of showing up`}
          </span>
        </>
      }
    >
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
    </ActionRow>
  )
}

function JobBoard({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  return (
    <>
      {JOBS.map((job) => {
        const qual = qualifiesFor(p, job.id)
        const reqs = jobRequirements(p, job.id)
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
              </div>
              {reqs.length > 0 && (
                <div className="job-requirements">
                  {reqs.map((r) => (
                    <span key={r.key} className={r.met ? 'req met' : 'req unmet'}>
                      {r.met ? <CheckIcon size={11} /> : <LockIcon size={11} />}{' '}
                      {/* Both icons above already set aria-hidden internally (Icon.tsx),
                          and the Computer row has no numeric progress at all, so
                          without this a screen reader announces nothing but
                          "Computer" — met/unmet would be conveyed by color alone. */}
                      <span className="sr-only">{r.met ? 'Met: ' : 'Not met: '}</span>
                      {r.key === 'computer'
                        ? r.label
                        : `${r.label} ${Math.floor(r.current)}/${r.required}`}
                      {r.waived && ' (waived)'}
                    </span>
                  ))}
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
    <ActionRow
      label={
        <>
          Groceries ${unitPrice}/unit — you eat {FOOD_NEEDED}/week.
          <br />
          <span className="desc">
            Stored: {p.groceries}/{cap} {hasItem(p, 'fridge') ? '(fridge)' : '(no fridge)'}
          </span>
        </>
      }
    >
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
    </ActionRow>
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
          <ActionRow
            key={id}
            label={
              <>
                <strong>{item.name}</strong>
                <br />
                <span className="desc">{item.blurb}</span>
              </>
            }
          >
            <button
              disabled={owned}
              onClick={() => {
                playPurchase()
                dispatchGame({ type: 'buyItem', itemId: id })
              }}
            >
              {owned ? 'Owned' : `$${price(game, item.price)} (1h)`}
            </button>
          </ActionRow>
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
    <ActionRow
      label={
        <>
          Savings: <strong>${p.savings.toLocaleString()}</strong>
          <br />
          <span className="desc">
            {(game.economy.interestRate * 100).toFixed(1)}% interest per week
          </span>
        </>
      }
    >
      <NumberField value={amount} onChange={setAmount} ariaLabel="Amount" htmlMin={1} />
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
    </ActionRow>
  )
}

function InvestActions({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const value = Math.round(p.investments * game.economy.marketIndex)
  const [investAmount, setInvestAmount] = useState(100)
  const [sellAmount, setSellAmount] = useState(100)
  return (
    <ActionRow
      label={
        <>
          Invested: <strong>${value.toLocaleString()}</strong>
          <br />
          <span className="desc">
            Market index {game.economy.marketIndex.toFixed(2)}× — real risk, real reward, unlike
            savings
          </span>
        </>
      }
    >
      <NumberField
        value={investAmount}
        onChange={setInvestAmount}
        ariaLabel="Invest amount"
        htmlMin={1}
      />
      <button
        disabled={investAmount < 1 || investAmount > p.cash}
        onClick={() => dispatchGame({ type: 'invest', amount: investAmount })}
      >
        Invest (1h)
      </button>
      <NumberField
        value={sellAmount}
        onChange={setSellAmount}
        ariaLabel="Sell amount"
        htmlMin={1}
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
    </ActionRow>
  )
}

function LoanActions({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const [amount, setAmount] = useState(200)
  const limit = maxLoan(p.creditScore)
  const available = Math.max(0, limit - p.loanBalance)
  return (
    <ActionRow
      label={
        <>
          Credit score: <strong>{p.creditScore}</strong> · limit ${limit.toLocaleString()}
          <br />
          <span className={`desc${p.garnished ? ' locked' : ''}`}>
            {p.loanBalance > 0 ? `Owe $${p.loanBalance.toLocaleString()}` : 'No outstanding loan'}
            {p.garnished && ' — wages are being garnished until it clears'}
          </span>
        </>
      }
    >
      <NumberField value={amount} onChange={setAmount} ariaLabel="Loan amount" htmlMin={1} />
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
    </ActionRow>
  )
}

function RentActions({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  return (
    <>
      {p.rentDue > 0 && (
        <ActionRow
          label={
            <>
              Rent owed: <strong>${p.rentDue}</strong>
              {p.weeksBehindOnRent > 0 && (
                <span className="locked"> — {3 - p.weeksBehindOnRent} week(s) until eviction!</span>
              )}
            </>
          }
        >
          <button
            className="primary"
            onClick={() => {
              playPurchase()
              dispatchGame({ type: 'payRent' })
            }}
          >
            Pay rent (1h)
          </button>
        </ActionRow>
      )}
      {(['basic', 'secure'] as const).map((tier) => (
        <ActionRow
          key={tier}
          label={
            <>
              <strong>{tier === 'basic' ? 'Basic apartment' : 'Secure apartment'}</strong>
              <br />
              <span className="desc">
                ${price(game, RENT[tier])}/week
                {tier === 'secure'
                  ? ' · +2 happiness/week, no street robbery'
                  : ' · a roof over your head'}
              </span>
            </>
          }
        >
          <button
            disabled={p.apartment === tier}
            onClick={() => {
              playPurchase()
              dispatchGame({ type: 'rentApartment', tier })
            }}
          >
            {p.apartment === tier ? 'Current home' : 'Move in (2h, 1st week upfront)'}
          </button>
        </ActionRow>
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
          <ActionRow key={id} label={item.name}>
            <button onClick={() => dispatchGame({ type: 'sellItem', itemId: id })}>
              Sell for ${Math.round(price(game, item.price) * 0.5)} (1h)
            </button>
          </ActionRow>
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
    <ActionRow
      label={
        <>
          Relax (+1 happiness per hour, {relaxLeft}h left this week)
          <br />
          <span className="desc">Pantry: {p.groceries} food units stored</span>
        </>
      }
    >
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
    </ActionRow>
  )
}

export function MealAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  return (
    <ActionRow
      label={
        <>
          Hot meal (+1 food, +1 happiness)
          <br />
          <span className="desc">
            Eaten this week: {game.player.fed}/{FOOD_NEEDED}
          </span>
        </>
      }
    >
      <button
        className="primary"
        onClick={() => {
          playPurchase()
          dispatchGame({ type: 'buyMeal' })
        }}
      >
        Eat (${price(game, MEAL_PRICE)}, 2h)
      </button>
    </ActionRow>
  )
}

function LotteryAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const [tickets, setTickets] = useState(1)
  return (
    <ActionRow
      label={
        <>
          Lottery — jackpot <strong>${game.economy.lotteryJackpot.toLocaleString()}</strong>
          <br />
          <span className="desc">2% win chance per ticket, drawn at week's end</span>
        </>
      }
    >
      <NumberField
        value={tickets}
        onChange={setTickets}
        ariaLabel="Tickets"
        htmlMin={1}
        htmlMax={20}
        floor={1}
        ceil={20}
      />
      <button
        onClick={() => {
          playPurchase()
          dispatchGame({ type: 'buyLottery', tickets })
        }}
      >
        Buy (${LOTTERY_TICKET_PRICE * tickets}, 1h)
      </button>
    </ActionRow>
  )
}

export function CasinoAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  const [bet, setBet] = useState(CASINO_MIN_BET)
  const clamped = Math.max(0, Math.min(CASINO_MAX_BET, bet, p.cash))
  const potentialWin = Math.round(clamped * CASINO_PAYOUT_MULTIPLIER)
  return (
    <ActionRow
      label={
        <>
          The Wheel — bet ${clamped}, win ${potentialWin} ({Math.round(CASINO_WIN_CHANCE * 100)}%
          chance)
          <br />
          <span className="desc">The house always has the edge. Play for fun, not a plan.</span>
        </>
      }
    >
      <NumberField
        value={bet}
        onChange={setBet}
        ariaLabel="Bet amount"
        htmlMin={CASINO_MIN_BET}
        htmlMax={Math.min(CASINO_MAX_BET, p.cash)}
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
    </ActionRow>
  )
}

export function ClassAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  return (
    <ActionRow
      label={
        <>
          Take a class (+1 education)
          <br />
          <span className="desc">Completed: {game.player.education} classes</span>
        </>
      }
    >
      <button
        className="primary"
        onClick={() => {
          playPurchase()
          dispatchGame({ type: 'takeClass' })
        }}
      >
        Enroll (${price(game, TUITION)}, 8h)
      </button>
    </ActionRow>
  )
}

export function SkillTrainingAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  return (
    <>
      {SKILLS.map((skill) => (
        <ActionRow
          key={skill.id}
          label={
            <>
              <strong>{skill.name}</strong> — {Math.floor(p.skills[skill.id])}/100
              <br />
              <span className="desc">{skill.blurb}</span>
            </>
          }
        >
          <button
            disabled={p.skills[skill.id] >= 100}
            onClick={() => {
              playPurchase()
              dispatchGame({ type: 'trainSkill', skillId: skill.id })
            }}
          >
            {p.skills[skill.id] >= 100
              ? 'Maxed'
              : `Train (${price(game, SKILL_TRAIN_PRICE)}, ${SKILL_TRAIN_TIME}h)`}
          </button>
        </ActionRow>
      ))}
    </>
  )
}

export function DoctorAction({ game }: { game: GameState }) {
  const { dispatchGame } = useGame()
  const p = game.player
  return (
    <ActionRow
      label={
        <>
          Health: <strong className={p.health < 40 ? 'low' : ''}>{p.health}/100</strong>
          <br />
          <span className="desc">Overwork and living on cheap groceries wear it down.</span>
        </>
      }
    >
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
    </ActionRow>
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
