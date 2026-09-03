// The AI policy — a utility-scored agent using the exact same action
// functions (and therefore rules) as the human player. Runs Riley's turn in
// the real game; parameterized by PlayerKey (rather than hardcoded to
// 'riley') so scripts/sim.ts can also run it for 'player' in an AI-vs-AI
// balance simulation, with zero behavior change for the real game.
//
// Each turn, a set of candidate actions (the same domain-specific helpers as
// before: ensureFood, pursueCareer, studyOnce, etc.) is scored by how urgent
// the goal it serves is — `weight * (1 - goalProgress)`, recomputed fresh
// every turn — then attempted in ranked order, falling through to the next
// on an EngineError, exactly like the old fixed-order fallthrough did. This
// is what lets Riley trade education/happiness/wealth off against each
// other within a turn instead of always trying one flavor of action before
// the other regardless of which is actually further behind. Career and
// (for Scholar/Gambler) education/gambling sit outside that pure-urgency
// scoring on their own fixed-ish tiers instead — see CAREER_LEVERAGE_BONUS,
// EAGER_STUDY_UTILITY, and GAMBLE_UTILITY's comments for why each needed
// its own carve-out rather than fitting the general urgency formula.
//
// AI_PROFILES layers named presets on top of that shared policy: goalWeights
// and the studyEagerly/gambles flags give each profile its flavor (Scholar
// studies proactively, Hustler leans on wealth, Gambler stakes surplus at
// the casino), while skillLevel is a second, orthogonal axis — how well
// Riley plays at all, independent of style — driven by the difficulty
// setting via DIFFICULTY_SKILL rather than baked into a profile's identity.

import * as act from './actions'
import { EngineError } from './actions'
import {
  CASINO_MAX_BET,
  CASINO_MIN_BET,
  DOCTOR_PRICE,
  HEALTH_SICK_THRESHOLD,
  ITEMS,
  JOBS,
  RENT,
  SKILL_TRAIN_PRICE,
  TUITION,
  itemById,
  jobById,
  travelCost,
} from './data'
import { roll } from './rng'
import { careerScore, goalProgress } from './week'
import type {
  AiProfileName,
  GameState,
  Goals,
  ItemId,
  JobDef,
  LocationId,
  PlayerKey,
  RileyDifficulty,
  RileyMomentum,
  SkillId,
} from './types'

export interface AiProfile {
  name: string
  /** Multiplier on the price half of the cash reserve (RENT.basic × this + 60). */
  reserveMultiplier: number
  /** Extra hours layered onto both work-shift priority caps. */
  extraWorkHours: number
  /** Stakes a cut of spare cash at the casino instead of banking all of it. */
  gambles: boolean
  /** How eagerly a gambling profile stakes wealth-urgency at the casino. */
  gambleFactor: number
  /** Studies proactively whenever cash allows, not just when it's the
   * cheapest blocker on the next job (pursueCareer already does that for
   * everyone) — a separate fixed tier rather than a goalWeights.education
   * bump, since career's own leverage bonus (see CAREER_LEVERAGE_BONUS)
   * would otherwise swamp any education weight high enough to matter. */
  studyEagerly: boolean
  /** How well Riley plays, independent of style — 1 (Normal) and above
   * (Hard) both mean best-first play considering every candidate each turn;
   * below 1 (Easy) means considering only a random subset each turn (see
   * considerForAttempt) — provably no better than Normal in expectation,
   * since it's choosing among strictly fewer options. Set from
   * DIFFICULTY_SKILL by the caller (engine.ts), not fixed per profile. */
  skillLevel: number
  /** How urgently each goal is pursued, relative to the others — the knob
   * that gives each profile its flavor. */
  goalWeights: Record<keyof Goals, number>
}

export const AI_PROFILES: Record<AiProfileName, AiProfile> = {
  balanced: {
    name: 'Balanced',
    reserveMultiplier: 1,
    extraWorkHours: 0,
    gambles: false,
    gambleFactor: 0,
    skillLevel: 1,
    studyEagerly: false,
    goalWeights: { wealth: 1, happiness: 1, education: 1, career: 1 },
  },
  hustler: {
    name: 'Hustler',
    reserveMultiplier: 0.6,
    extraWorkHours: 10,
    gambles: false,
    gambleFactor: 0,
    skillLevel: 1,
    studyEagerly: false,
    goalWeights: { wealth: 1.6, happiness: 0.8, education: 0.8, career: 1 },
  },
  scholar: {
    name: 'Scholar',
    reserveMultiplier: 1,
    extraWorkHours: 0,
    gambles: false,
    gambleFactor: 0,
    skillLevel: 1,
    studyEagerly: true,
    goalWeights: { wealth: 1, happiness: 1, education: 1.8, career: 1 },
  },
  gambler: {
    name: 'Gambler',
    reserveMultiplier: 1,
    extraWorkHours: 0,
    gambles: true,
    gambleFactor: 1.5,
    skillLevel: 1,
    studyEagerly: false,
    goalWeights: { wealth: 1.3, happiness: 1, education: 1, career: 1 },
  },
}

/** StartScreen difficulty control → AiProfile.skillLevel. Orthogonal to
 * which named profile (style) is picked — see AiProfile.skillLevel. A save
 * from before difficulty existed defaults to 'normal' (skillLevel 1), which
 * plays identically to how every profile already behaved. */
export const DIFFICULTY_SKILL: Record<RileyDifficulty, number> = {
  easy: 0.6,
  normal: 1,
  hard: 1.3,
}

function get(state: GameState, key: PlayerKey) {
  return state[key]
}

// A losing streak against the player nudges Riley to play a bit more
// urgently — bounded and small (15%) so it's a catch-up assist, not a
// scripted difficulty spike. Chosen to sit well inside the gap between
// adjacent goalWeights magnitudes (e.g. Hustler's 1.6 vs 0.8) rather than
// swap the ranking outright.
const MOMENTUM_BIAS = 1.15

/** Applies rivalry momentum (src/rivalry.ts) on top of a resolved AiProfile.
 * Only 'cold' (a real player streak) does anything — 'hot'/'even' return the
 * profile unchanged, since winning against Riley should never be punished.
 * Scales goalWeights and gambleFactor uniformly rather than favoring one
 * goal, so it doesn't change *what* Riley prioritizes, just how eagerly. */
export function applyMomentum(profile: AiProfile, momentum: RileyMomentum): AiProfile {
  if (momentum !== 'cold') return profile
  const goalWeights = Object.fromEntries(
    Object.entries(profile.goalWeights).map(([goal, weight]) => [goal, weight * MOMENTUM_BIAS])
  ) as Record<keyof Goals, number>
  return { ...profile, goalWeights, gambleFactor: profile.gambleFactor * MOMENTUM_BIAS }
}

/** Cash the AI tries to keep on hand for rent and food before splurging. */
function reserve(state: GameState, profile: AiProfile): number {
  return act.price(state, RENT.basic) * profile.reserveMultiplier + 60
}

// Above-Normal skill (Hard) intentionally has no extra lever beyond zero
// mistakes/full consideration (see considerForAttempt) — two things were
// tried and both measurably backfired: tightening the cash reserve made the
// guaranteed-work tier fire less often (Easy beat Hard 60.7% to 28.3%), and
// working extra hours per shift pushed weekly totals over OVERWORK_THRESHOLD
// more often, trading wage for health/happiness costs that ate the gain
// (confirmed: Hard overworked 11/30 weeks vs. Normal's 6/30 on the same
// seed, and *lost* to Normal). Best-first play with the full candidate list
// already plays about as well as this policy can without a genuine
// multi-turn lookahead, which is out of scope for this pass — see the plan.

function attempt(fn: () => void): boolean {
  try {
    fn()
    return true
  } catch (e) {
    if (e instanceof EngineError) return false
    throw e
  }
}

/** Travel if needed; false if they can't afford the time. */
function goTo(state: GameState, key: PlayerKey, to: LocationId): boolean {
  const p = get(state, key)
  if (p.location === to) return true
  if (travelCost(p.location, to, act.hasItem(p, 'bike')) > p.timeLeft) return false
  return attempt(() => act.travel(state, key, to))
}

function ensureFood(state: GameState, key: PlayerKey): boolean {
  const p = get(state, key)
  const needed = act.foodShortfall(p)
  if (needed === 0) return false
  const unitCost = act.price(state, 4)
  if (p.cash < unitCost * needed + 10) return false
  if (!goTo(state, key, 'megamart')) return false
  const stockUp = act.hasItem(p, 'fridge') ? needed + 6 : needed
  const affordable = Math.floor((p.cash - 10) / unitCost)
  const cap = act.groceryCap(p) - p.groceries
  const units = Math.min(stockUp, affordable, cap)
  if (units < 1) return false
  return attempt(() => act.buyGroceries(state, key, units))
}

function ensureHousing(state: GameState, key: PlayerKey): boolean {
  const p = get(state, key)
  if (p.apartment === 'none') {
    if (p.cash < act.price(state, RENT.basic) * 1.5) return false
    if (!goTo(state, key, 'rentoffice')) return false
    return attempt(() => act.rentApartment(state, key, 'basic'))
  }
  if (p.rentDue > 0 && p.cash >= p.rentDue) {
    if (!act.hasItem(p, 'phone') && !goTo(state, key, 'rentoffice')) return false
    return attempt(() => act.payRent(state, key))
  }
  return false
}

function ensureHealth(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  if (p.health >= HEALTH_SICK_THRESHOLD) return false
  if (p.cash < act.price(state, DOCTOR_PRICE) + reserve(state, profile)) return false
  if (!goTo(state, key, 'clinic')) return false
  return attempt(() => act.seeDoctor(state, key))
}

function bestQualifiedJob(state: GameState, key: PlayerKey): JobDef | null {
  const p = get(state, key)
  const current = careerScore(p)
  const candidates = JOBS.filter((j) => j.prestige > current && act.qualifiesFor(p, j.id).ok).sort(
    (a, b) => b.prestige - a.prestige
  )
  return candidates[0] ?? null
}

/** The job this AI is working toward: lowest-prestige job above their current one. */
function nextTargetJob(state: GameState, key: PlayerKey): JobDef | null {
  const p = get(state, key)
  const current = careerScore(p)
  const candidates = JOBS.filter((j) => j.prestige > current).sort(
    (a, b) => a.prestige - b.prestige
  )
  return candidates[0] ?? null
}

function pursueCareer(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  const better = bestQualifiedJob(state, key)
  if (better) {
    // Already qualified — free to take (a couple hours, no cash), so grab
    // it regardless of whether the career goal is already met.
    if (!act.hasItem(p, 'phone') && !goTo(state, key, 'employment')) return false
    return attempt(() => act.applyJob(state, key, better.id))
  }
  // Past this point, climbing further means *spending* cash/time (an
  // outfit, a computer, tuition) to chase a job Riley doesn't yet qualify
  // for. JOBS' ladder runs well past any realistic goal (Professor is
  // prestige 88), and this function has no notion of "enough" on its own —
  // without this check Riley keeps pouring cash into prestige long after
  // the actual career goal is satisfied, starving the wealth goal for no
  // in-game reason. Confirmed by measurement: this was the main reason a
  // worse-playing (mistake-prone) Riley was *beating* a mistake-free one —
  // the mistakes accidentally skipped this waste.
  if (careerScore(p) >= state.goals.career) return false
  const target = nextTargetJob(state, key)
  if (!target) return false
  // Clear the cheapest blocker: dress first (one purchase), then education.
  if (p.dress < target.minDress) {
    const outfit = ITEMS.filter((i) => (i.dress ?? 0) >= target.minDress).sort(
      (a, b) => a.price - b.price
    )[0]
    if (outfit && p.cash >= act.price(state, outfit.price) + reserve(state, profile)) {
      if (!goTo(state, key, 'clothing')) return false
      return attempt(() => act.buyItem(state, key, outfit.id))
    }
  }
  if (target.requiresComputer && !act.hasItem(p, 'computer')) {
    const computer = itemById('computer')
    if (p.cash >= act.price(state, computer.price) + reserve(state, profile)) {
      if (!goTo(state, key, 'gadgets')) return false
      return attempt(() => act.buyItem(state, key, 'computer'))
    }
  }
  if (p.education < target.minEducation) {
    return studyOnce(state, key, profile)
  }
  if (target.minSkills) {
    for (const [skillId, needed] of Object.entries(target.minSkills) as Array<[SkillId, number]>) {
      if (p.skills[skillId] < needed) {
        return trainSkillOnce(state, key, profile, skillId)
      }
    }
  }
  return false
}

/** Once there's something worth protecting and cash to spare, insure it —
 * cheaper than risking a burglary replay every uninsured week. */
function protectValuables(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  if (p.items.length === 0 || act.hasItem(p, 'insurance')) return false
  const insurance = itemById('insurance')
  if (p.cash < act.price(state, insurance.price) + reserve(state, profile) * 2) return false
  if (!goTo(state, key, 'bank')) return false
  return attempt(() => act.buyItem(state, key, 'insurance'))
}

function studyOnce(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  if (p.cash < act.price(state, TUITION) + reserve(state, profile)) return false
  if (!goTo(state, key, 'university')) return false
  return attempt(() => act.takeClass(state, key))
}

/** Mirrors studyOnce — used by pursueCareer to clear a target job's
 * minSkills blocker directly, instead of waiting on the slower passive
 * gain from working a trainsSkill job. */
function trainSkillOnce(
  state: GameState,
  key: PlayerKey,
  profile: AiProfile,
  skillId: SkillId
): boolean {
  const p = get(state, key)
  if (p.cash < act.price(state, SKILL_TRAIN_PRICE) + reserve(state, profile)) return false
  if (!goTo(state, key, 'university')) return false
  return attempt(() => act.trainSkill(state, key, skillId))
}

function workShift(state: GameState, key: PlayerKey, maxHours: number): boolean {
  const p = get(state, key)
  if (!p.jobId) return false
  const job = jobById(p.jobId)
  if (!goTo(state, key, job.workplace)) return false
  const hours = Math.min(maxHours, p.timeLeft)
  if (hours < 1) return false
  return attempt(() => act.work(state, key, hours))
}

function pursueHappiness(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  const fun: ItemId[] = ['tv', 'stereo', 'console']
  const toBuy = fun.find((id) => !act.hasItem(p, id))
  if (toBuy) {
    const item = ITEMS.find((i) => i.id === toBuy)!
    if (p.cash >= act.price(state, item.price) + reserve(state, profile) * 2) {
      if (!goTo(state, key, 'gadgets')) return false
      return attempt(() => act.buyItem(state, key, toBuy))
    }
  }
  if (p.apartment !== 'none' && p.relaxedThisWeek < 10) {
    if (!goTo(state, key, 'home')) return false
    return attempt(() => act.relax(state, key, Math.min(4, p.timeLeft)))
  }
  return false
}

function bankSurplus(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  const surplus = p.cash - reserve(state, profile) * 3
  if (surplus < 200) return false
  if (!goTo(state, key, 'bank')) return false
  return attempt(() => act.deposit(state, key, Math.round(surplus)))
}

/** Same surplus definition as bankSurplus, competing on utility (see
 * INVEST_UTILITY) rather than gated behind a profile flag — investing has
 * real risk (marketIndex can fall), but unlike gambling it's not
 * negative-EV by design, so every profile is free to use it, just slightly
 * preferred over the guaranteed-flat-rate alternative when both are live. */
function investSurplus(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  const surplus = p.cash - reserve(state, profile) * 3
  if (surplus < 200) return false
  if (!goTo(state, key, 'bank')) return false
  return attempt(() => act.invest(state, key, Math.round(surplus)))
}

/** Gambler only: stakes a cut of genuine surplus at the casino instead of
 * banking all of it. Doesn't decide *whether* to gamble via an extra RNG
 * roll — only the spin's outcome consumes one, via the normal playCasino
 * action — so this stays deterministic given the profile and state. */
function gambleAtCasino(state: GameState, key: PlayerKey, profile: AiProfile): boolean {
  const p = get(state, key)
  const surplus = p.cash - reserve(state, profile) * 3
  if (surplus < CASINO_MIN_BET) return false
  const bet = Math.min(CASINO_MAX_BET, Math.round(surplus * 0.2))
  if (!goTo(state, key, 'casino')) return false
  return attempt(() => act.playCasino(state, key, bet))
}

/** What each candidate is "about," independent of utility scoring — lets
 * `previewNextAction` report a human-readable category for the UI's hint bar
 * without duplicating any of the urgency/precondition logic above. */
export type CandidateTag =
  | 'food'
  | 'housing'
  | 'health'
  | 'education'
  | 'career'
  | 'happiness'
  | 'wealth'
  | 'valuables'
  | 'invest'
  | 'bank'
  | 'gamble'

interface Candidate {
  utility: number
  tag: CandidateTag
  attempt: () => boolean
}

// Fixed-tier utilities, well above anything goal-urgency scoring can
// produce (urgency tops out around goalWeights' magnitude, ~2) — these
// three keep the old guarantee of never starving, sleeping rough, or
// ignoring a sickness regardless of how the goal-weighted tiers below rank.
const SURVIVAL_UTILITY = 1000
// Keeping a working float takes priority over any single goal, but not over
// literal survival — matches "keep a working float before anything else"
// from the original fixed order.
const RESERVE_WORK_UTILITY = 500
// Climbing the career ladder (the next outfit, then the next job) is a
// compounding investment, not a one-shot goal contribution: a wage jump
// pays off on every future work hour, not just this turn's. A pure
// same-turn goalProgress score can't see that leverage — early on, career
// progress moves in big discrete jumps (one hire) while wealth/education
// progress creep, so career's *urgency* looks unremarkable even though
// it's almost always the best use of a turn. A flat bonus added on top of
// urgency('career') (not a standalone tier miles above everything else —
// that made every other goal-weighted candidate moot, since ~2 can never
// beat ~50, defeating the whole point of comparable-scale scoring) gives
// career a first-among-equals edge on ties without hard-locking it in.
// Confirmed by measurement: without any bonus, Riley gets its first job
// and then never job-hops again, since wealth/education urgency out-ranks
// it every turn once career's own urgency dips below theirs.
const CAREER_LEVERAGE_BONUS = 3
// Scholar-only: ranked below career (so job-hopping still wins whenever
// pursueCareer has something to do) but above every other goal-weighted
// candidate's realistic range, so a Scholar profile studies proactively on
// the turns career doesn't need — matches the StartScreen's "studies
// whenever there is cash to spare."
const EAGER_STUDY_UTILITY = 2
const PROTECT_VALUABLES_UTILITY = 0.3
// Between protectValuables and bankSurplus — see the GAMBLE_UTILITY usage
// site below for why this has to be a small fixed tier rather than scored
// off wealth-urgency.
const GAMBLE_UTILITY = 0.2
// Slightly above BANK_SURPLUS_UTILITY — a mild, universal preference for
// investing over flat-rate savings when both are viable, not a dominant one
// (see investSurplus's comment).
const INVEST_UTILITY = 0.12
const BANK_SURPLUS_UTILITY = 0.1
// Absolute last resort: idle time has no value, so grinding out the clock
// beats doing nothing once every goal-directed and housekeeping candidate
// above has failed or is inapplicable.
const LAST_RESORT_WORK_UTILITY = 0.05

/** Builds this turn's ranked candidates. Recomputed every iteration since
 * each attempted action changes the state the next one scores against. */
function buildCandidates(state: GameState, key: PlayerKey, profile: AiProfile): Candidate[] {
  const p = get(state, key)
  const progress = goalProgress(p, state.goals, state.economy.marketIndex)
  const urgency = (goal: keyof Goals) => Math.max(0, 1 - progress[goal]) * profile.goalWeights[goal]

  const candidates: Candidate[] = [
    { utility: SURVIVAL_UTILITY, tag: 'food', attempt: () => ensureFood(state, key) },
    { utility: SURVIVAL_UTILITY, tag: 'housing', attempt: () => ensureHousing(state, key) },
    {
      utility: SURVIVAL_UTILITY,
      tag: 'health',
      attempt: () => ensureHealth(state, key, profile),
    },
    {
      utility: urgency('education'),
      tag: 'education',
      attempt: () => studyOnce(state, key, profile),
    },
    {
      utility: urgency('career') + CAREER_LEVERAGE_BONUS,
      tag: 'career',
      attempt: () => pursueCareer(state, key, profile),
    },
    {
      utility: urgency('happiness'),
      tag: 'happiness',
      attempt: () => pursueHappiness(state, key, profile),
    },
    {
      utility: urgency('wealth'),
      tag: 'wealth',
      attempt: () => workShift(state, key, 25 + profile.extraWorkHours),
    },
    {
      utility: PROTECT_VALUABLES_UTILITY,
      tag: 'valuables',
      attempt: () => protectValuables(state, key, profile),
    },
    { utility: INVEST_UTILITY, tag: 'invest', attempt: () => investSurplus(state, key, profile) },
    { utility: BANK_SURPLUS_UTILITY, tag: 'bank', attempt: () => bankSurplus(state, key, profile) },
    {
      utility: LAST_RESORT_WORK_UTILITY,
      tag: 'wealth',
      attempt: () => workShift(state, key, p.timeLeft),
    },
  ]

  if (p.cash < reserve(state, profile)) {
    candidates.push({
      utility: RESERVE_WORK_UTILITY,
      tag: 'wealth',
      attempt: () => workShift(state, key, 20 + profile.extraWorkHours),
    })
  }
  // Same "wealth goal already met" gate as gambling below, and for the same
  // reason: eager study has no natural stopping point (studyOnce keeps
  // adding classes forever once affordable, long past any job's actual
  // requirement — confirmed at career=88/Professor, education=35 against a
  // goal of 12). Ungated, it competes with wealth-work on every turn cash
  // allows, not just once wealth is secured, so Scholar never accumulates
  // net worth and never wins. The old fixed order avoided this by accident:
  // its wealth-push-work check came first and stayed true almost the whole
  // game, so eager study rarely got a turn before wealth was already done.
  if (profile.studyEagerly && progress.wealth >= 1) {
    candidates.push({
      utility: EAGER_STUDY_UTILITY,
      tag: 'education',
      attempt: () => studyOnce(state, key, profile),
    })
  }
  // Gated on the wealth goal being fully met (progress === 1, i.e.
  // netWorth >= goals.wealth) rather than merely "high" — a fixed utility
  // competing against *shrinking* wealth-urgency would start outranking
  // work well before the goal was actually reached (measured: progress
  // >77%), and unlike a one-shot purchase, gambling has no natural brake:
  // a loss barely dents progress when the goal is in the thousands, so it
  // kept winning the ranking turn after turn — measured at ~25 spins/game
  // instead of the old code's ~1.4, cratering Gambler's win rate to ~1%.
  // Tying it to the exact same "goal already met" condition the old
  // behindOnMoney flag used restores that natural brake: a loss can drop
  // net worth back under the goal, which zeroes wealth-work's urgency gap
  // and sends Riley back to work instead of spinning again.
  if (profile.gambles && progress.wealth >= 1) {
    candidates.push({
      utility: GAMBLE_UTILITY * profile.gambleFactor,
      tag: 'gamble',
      attempt: () => gambleAtCasino(state, key, profile),
    })
  }

  return candidates
}

/** Below-Normal skill considers a random subset of this turn's candidates
 * instead of all of them — survival (food/housing/health) is always kept,
 * so a worse Riley still never starves, but everything else has a per-turn
 * chance of being overlooked. Tried and reverted a version that instead
 * *reordered* the ranked list (swap the top two on a "mistake"): almost
 * every candidate action in this game is a real, beneficial move — a work
 * shift, a class, a purchase — so demoting the "best" one to try the
 * second-best often wasn't actually worse, and could even come out ahead
 * when the ranking itself over- or under-weighted something (confirmed by
 * measurement: reordering made Easy *beat* Hard). Dropping options instead
 * is provably monotonic: a Riley choosing among fewer options can never do
 * better in expectation than one choosing among all of them, regardless of
 * how well-tuned the ranking is. */
function considerForAttempt(
  ranked: Candidate[],
  state: GameState,
  profile: AiProfile
): Candidate[] {
  const dropChance = Math.max(0, Math.min(0.6, 1 - profile.skillLevel))
  if (dropChance === 0) return ranked
  return ranked.filter((c) => c.utility >= SURVIVAL_UTILITY || roll(state) >= dropChance)
}

/** Plays out one player's week using the AI policy. Called by the reducer
 * for 'riley' before end-of-week upkeep in the real game; scripts/sim.ts
 * also calls it for 'player' to run AI-vs-AI balance simulations. Defaults
 * to the Balanced profile at Normal skill, which plays best-first with no
 * injected mistakes. */
export function runAIWeek(
  state: GameState,
  key: PlayerKey,
  profile: AiProfile = AI_PROFILES.balanced
) {
  const p = get(state, key)
  let guard = 0
  while (p.timeLeft > 0 && guard < 80) {
    guard += 1
    const candidates = considerForAttempt(buildCandidates(state, key, profile), state, profile)
    const ranked = [...candidates].sort((a, b) => b.utility - a.utility)
    let advanced = false
    for (const candidate of ranked) {
      if (candidate.attempt()) {
        advanced = true
        break
      }
    }
    if (!advanced) break
  }
}

/** Read-only preview of what the Balanced policy would do next for this
 * player right now — powers the UI's "what should I do next" hint bar.
 * Reuses Riley's own scored-candidate logic instead of a second heuristic,
 * so the hint can never drift from what the AI itself considers best. Runs
 * against a throwaway shallow clone (the same technique `engine.ts`'s
 * `applyAction` uses for its own per-action clone), so `.attempt()` calls
 * mutate only the clone — the real state passed in is never touched, even
 * though this consumes RNG rolls and pushes log entries on that clone.
 * Always previews with Balanced's neutral goal weights, regardless of
 * `key` or any actual profile in play, since this is advice for a human,
 * not Riley's real policy.
 *
 * Only clones `state[key]` — every candidate's `attempt()` only ever reads/
 * mutates `get(state, key)`, never the other player, same as `applyAction`'s
 * own "only clone what's actually mutated" rule for its non-`endWeek` cases. */
export function previewNextAction(state: GameState, key: PlayerKey): CandidateTag | null {
  const clone: GameState = {
    ...state,
    goals: { ...state.goals },
    economy: { ...state.economy },
    rules: { ...state.rules },
    player: key === 'player' ? act.clonePlayer(state.player) : state.player,
    riley: key === 'riley' ? act.clonePlayer(state.riley) : state.riley,
    log: state.log.slice(),
    history: state.history.slice(),
  }
  if (get(clone, key).timeLeft <= 0) return null
  const ranked = [...buildCandidates(clone, key, AI_PROFILES.balanced)].sort(
    (a, b) => b.utility - a.utility
  )
  for (const candidate of ranked) {
    if (candidate.attempt()) return candidate.tag
  }
  return null
}
