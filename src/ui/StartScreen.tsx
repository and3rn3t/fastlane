import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  CAREER_TARGETS,
  EDUCATION_TARGETS,
  HAPPINESS_TARGETS,
  RULE_PRESETS,
  WEALTH_TARGETS,
  type AiProfileName,
  type Goals,
  type RileyDifficulty,
  type RulePresetName,
} from '@/engine'
import { useGame } from '@/state/GameContext'
import { dailyChallengeNumber, dailyChallengeOptions } from '@/daily'
import { LEGACY_PERKS, legacyCashBonus } from '@/legacy'
import { loadRivalry, rivalryLine, rivalryMomentum } from '@/rivalry'
import { ACHIEVEMENTS, loadStats, type IncidentKind } from '@/stats'
import {
  BoltIcon,
  BriefcaseIcon,
  ChevronDownIcon,
  DiceIcon,
  DollarIcon,
  GradCapIcon,
  HeartIcon,
  LockIcon,
  ScaleIcon,
  type IconProps,
} from './Icon'

const RILEY_PROFILES: Array<{
  id: AiProfileName
  label: string
  blurb: string
  Icon: (props: IconProps) => React.JSX.Element
}> = [
  {
    id: 'balanced',
    label: 'Balanced',
    blurb: 'Plays every goal evenly — the toughest opponent.',
    Icon: ScaleIcon,
  },
  {
    id: 'hustler',
    label: 'Hustler',
    blurb: 'Works every spare hour, chases money above all.',
    Icon: BoltIcon,
  },
  {
    id: 'scholar',
    label: 'Scholar',
    blurb: 'Studies whenever there is cash to spare.',
    Icon: GradCapIcon,
  },
  {
    id: 'gambler',
    label: 'Gambler',
    blurb: 'Bets surplus cash at the casino instead of banking it.',
    Icon: DiceIcon,
  },
]

const RULE_OPTIONS: Array<{ id: RulePresetName; label: string; blurb: string }> = [
  { id: 'classic', label: 'Classic', blurb: 'The standard rules — a fair, unmodified economy.' },
  {
    id: 'brutal',
    label: 'Brutal',
    blurb: 'Less starting cash, more frequent events, bigger economic swings.',
  },
  { id: 'zen', label: 'Zen', blurb: 'More starting cash, calmer events, a gentler economy.' },
]

// 'hard' is a real, save-compatible RileyDifficulty (see ai.ts's
// DIFFICULTY_SKILL) but isn't offered here yet — it currently plays
// identically to Normal (see ai.ts's note on why a genuine "plays better
// than best-first" edge needs real lookahead, out of scope for now), and
// offering a selectable option with no actual effect would just be
// confusing. Add it here once ai.ts gives it a real edge.
const DIFFICULTY_OPTIONS: Array<{ id: RileyDifficulty; label: string; blurb: string }> = [
  { id: 'easy', label: 'Easy', blurb: 'Riley overlooks good moves more often — a gentler race.' },
  { id: 'normal', label: 'Normal', blurb: 'Riley plays every turn as well as it can.' },
]

interface SliderRow {
  key: keyof Goals
  label: string
  Icon: (props: IconProps) => React.JSX.Element
  category: 'wealth' | 'happy' | 'edu' | 'career'
  targets: readonly number[]
  format: (v: number) => string
}

const ROWS: SliderRow[] = [
  {
    key: 'wealth',
    label: 'Wealth',
    Icon: DollarIcon,
    category: 'wealth',
    targets: WEALTH_TARGETS,
    format: (v) => `$${v.toLocaleString()}`,
  },
  {
    key: 'happiness',
    label: 'Happiness',
    Icon: HeartIcon,
    category: 'happy',
    targets: HAPPINESS_TARGETS,
    format: (v) => `${v}/100`,
  },
  {
    key: 'education',
    label: 'Education',
    Icon: GradCapIcon,
    category: 'edu',
    targets: EDUCATION_TARGETS,
    format: (v) => `${v} classes`,
  },
  {
    key: 'career',
    label: 'Career',
    Icon: BriefcaseIcon,
    category: 'career',
    targets: CAREER_TARGETS,
    format: (v) => `${v} prestige`,
  },
]

const INCIDENT_LABELS: Array<{ id: IncidentKind; emoji: string; label: string }> = [
  { id: 'layoffs', emoji: '🧳', label: 'layoffs' },
  { id: 'thefts', emoji: '🔓', label: 'thefts' },
  { id: 'evictions', emoji: '🏚️', label: 'evictions' },
  { id: 'robberies', emoji: '💸', label: 'robberies' },
  { id: 'garnishments', emoji: '⚖️', label: 'garnishments' },
]

const PRESETS: Record<string, Record<keyof Goals, number>> = {
  Quick: { wealth: 2, happiness: 2, education: 2, career: 2 },
  Standard: { wealth: 4, happiness: 4, education: 4, career: 4 },
  Marathon: { wealth: 7, happiness: 7, education: 7, career: 7 },
}

export function StartScreen() {
  const { startGame, importSave } = useGame()
  const [stats] = useState(loadStats)
  const [rivalry] = useState(loadRivalry)
  const cashBonus = legacyCashBonus(stats)
  const [name, setName] = useState('')
  const [levels, setLevels] = useState<Record<keyof Goals, number>>(PRESETS.Standard)
  const [rileyProfile, setRileyProfile] = useState<AiProfileName>('balanced')
  const [rileyDifficulty, setRileyDifficulty] = useState<RileyDifficulty>('normal')
  const [rulePreset, setRulePreset] = useState<RulePresetName>('classic')
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Backs the manifest's "Daily Challenge" PWA shortcut (long-press the home
  // screen icon → jump straight in) — only fires from a fresh StartScreen
  // (no save in progress; App.tsx renders GameScreen instead once one
  // exists), which is exactly when a deep-link shortcut is useful. Clears
  // the query param via replaceState so a reload/back-navigation doesn't
  // re-trigger it.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('daily') !== '1') return
    window.history.replaceState(null, '', window.location.pathname)
    startGame(dailyChallengeOptions('You'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    const result = importSave(text)
    setImportError(result.ok ? null : (result.error ?? 'Import failed.'))
  }

  const goals: Goals = {
    wealth: WEALTH_TARGETS[levels.wealth - 1],
    happiness: HAPPINESS_TARGETS[levels.happiness - 1],
    education: EDUCATION_TARGETS[levels.education - 1],
    career: CAREER_TARGETS[levels.career - 1],
  }

  return (
    <main className="start">
      <div>
        <h1>
          Fast <span>Lane</span>
        </h1>
        <p className="tagline">
          Sixty hours a week. Rent is due, the fridge is empty, and Riley is already at work. Hit
          all four life goals before they do.
        </p>
        {rivalryLine(rivalry) && <p className="rivalry-line">{rivalryLine(rivalry)}</p>}
      </div>

      <div className="daily-challenge">
        <span className="grow">
          🗓️ Daily Challenge #{dailyChallengeNumber()}
          <br />
          <span className="desc">
            Same seed, same goals, same rules for everyone today — Standard difficulty, Balanced
            Riley.
          </span>
        </span>
        <button
          className="primary"
          onClick={() => startGame(dailyChallengeOptions(name.trim() || 'You'))}
        >
          Play today's challenge
        </button>
      </div>

      <div className="start-actions">
        <button
          type="button"
          className="primary"
          onClick={() =>
            startGame({
              playerName: name.trim() || 'You',
              goals,
              rileyProfile,
              rileyDifficulty,
              rileyMomentum: rivalryMomentum(rivalry),
              rules: RULE_PRESETS[rulePreset],
              playerCashBonus: cashBonus,
            })
          }
        >
          Start new game
        </button>
      </div>

      <details className="action-group">
        <summary className="section-label">
          Customize match
          <ChevronDownIcon size={13} className="disclosure-chevron" />
        </summary>
        <div className="action-group-body">
          <label>
            Your name{' '}
            <input
              type="text"
              value={name}
              placeholder="You"
              maxLength={16}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div>
            <div className="presets">
              {Object.entries(PRESETS).map(([label, preset]) => (
                <button type="button" key={label} onClick={() => setLevels(preset)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {ROWS.map((row) => (
            <div className="goal-row" key={row.key}>
              <span className={`goal-row-label cat-${row.category}`}>
                <row.Icon size={15} /> {row.label}
              </span>
              <input
                type="range"
                className={`cat-${row.category}`}
                min={1}
                max={10}
                value={levels[row.key]}
                aria-label={`${row.label} goal`}
                style={
                  {
                    '--fill-pct': `${((levels[row.key] - 1) / 9) * 100}%`,
                  } as React.CSSProperties
                }
                onChange={(e) => setLevels({ ...levels, [row.key]: Number(e.target.value) })}
              />
              <span className="target">{row.format(row.targets[levels[row.key] - 1])}</span>
            </div>
          ))}

          <div>
            <span>Rules</span>
            <div className="presets">
              {RULE_OPTIONS.map((rule) => (
                <button
                  type="button"
                  key={rule.id}
                  className={rulePreset === rule.id ? 'primary' : ''}
                  aria-pressed={rulePreset === rule.id}
                  onClick={() => setRulePreset(rule.id)}
                >
                  {rule.label}
                </button>
              ))}
            </div>
            <p className="blurb">{RULE_OPTIONS.find((rule) => rule.id === rulePreset)!.blurb}</p>
          </div>

          <div>
            <span>Riley's playstyle</span>
            <div className="presets">
              {RILEY_PROFILES.map((prof) => (
                <button
                  type="button"
                  key={prof.id}
                  className={rileyProfile === prof.id ? 'primary' : ''}
                  aria-pressed={rileyProfile === prof.id}
                  onClick={() => setRileyProfile(prof.id)}
                >
                  <prof.Icon size={14} /> {prof.label}
                </button>
              ))}
            </div>
            <p className="blurb">
              {RILEY_PROFILES.find((prof) => prof.id === rileyProfile)!.blurb}
            </p>
          </div>

          <div>
            <span>Riley's difficulty</span>
            <div className="presets">
              {DIFFICULTY_OPTIONS.map((diff) => (
                <button
                  type="button"
                  key={diff.id}
                  className={rileyDifficulty === diff.id ? 'primary' : ''}
                  aria-pressed={rileyDifficulty === diff.id}
                  onClick={() => setRileyDifficulty(diff.id)}
                >
                  {diff.label}
                </button>
              ))}
            </div>
            <p className="blurb">
              {DIFFICULTY_OPTIONS.find((diff) => diff.id === rileyDifficulty)!.blurb}
            </p>
          </div>
        </div>
      </details>

      <div className="start-actions">
        <button type="button" className="text-action" onClick={() => fileInputRef.current?.click()}>
          Import save
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          hidden
        />
      </div>
      {importError && <p className="locked">{importError}</p>}

      {stats.gamesPlayed > 0 && (
        <div>
          <span>🏆 Your Record</span>
          <p className="stats-summary">
            {stats.gamesWon}/{stats.gamesPlayed} games won
            {stats.fastestWinWeeks !== null && ` · fastest win: ${stats.fastestWinWeeks} weeks`}
          </p>
          {INCIDENT_LABELS.some((i) => stats.incidents[i.id] > 0) && (
            <p className="stats-summary">
              {INCIDENT_LABELS.filter((i) => stats.incidents[i.id] > 0)
                .map((i) => `${i.emoji} ${stats.incidents[i.id]} ${i.label}`)
                .join(' · ')}
            </p>
          )}
          <div className="achievements">
            {ACHIEVEMENTS.map((a) => {
              const unlocked = stats.unlockedAchievements.includes(a.id)
              return (
                <div
                  key={a.id}
                  className={`achievement-badge${unlocked ? ' unlocked' : ''}`}
                  title={a.description}
                >
                  <span className="name">
                    {unlocked ? '🏆' : <LockIcon size={12} />} {a.name}
                  </span>
                  <span className="desc">{a.description}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <span>🎖️ Legacy Perks</span>
        <p className="stats-summary">Play more games to earn permanent bonuses.</p>
        <div className="achievements">
          {LEGACY_PERKS.map((perk) => {
            const unlocked = perk.isUnlocked(stats)
            return (
              <div
                key={perk.id}
                className={`achievement-badge${unlocked ? ' unlocked' : ''}`}
                title={perk.description}
              >
                <span className="name">
                  {unlocked ? '🎖️' : <LockIcon size={12} />} {perk.name}
                </span>
                <span className="desc">{perk.description}</span>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
