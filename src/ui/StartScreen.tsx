import { useRef, useState, type ChangeEvent } from 'react'
import {
  CAREER_TARGETS,
  EDUCATION_TARGETS,
  HAPPINESS_TARGETS,
  RULE_PRESETS,
  WEALTH_TARGETS,
  type AiProfileName,
  type Goals,
  type RulePresetName,
} from '@/engine'
import { useGame } from '@/state/GameContext'

const RILEY_PROFILES: Array<{ id: AiProfileName; label: string; blurb: string }> = [
  { id: 'balanced', label: 'Balanced', blurb: 'Plays every goal evenly — the toughest opponent.' },
  { id: 'hustler', label: 'Hustler', blurb: 'Works every spare hour, chases money above all.' },
  { id: 'scholar', label: 'Scholar', blurb: 'Studies whenever there is cash to spare.' },
  {
    id: 'gambler',
    label: 'Gambler',
    blurb: 'Bets surplus cash at the casino instead of banking it.',
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

interface SliderRow {
  key: keyof Goals
  label: string
  targets: readonly number[]
  format: (v: number) => string
}

const ROWS: SliderRow[] = [
  {
    key: 'wealth',
    label: '💵 Wealth',
    targets: WEALTH_TARGETS,
    format: (v) => `$${v.toLocaleString()}`,
  },
  {
    key: 'happiness',
    label: '😊 Happiness',
    targets: HAPPINESS_TARGETS,
    format: (v) => `${v}/100`,
  },
  {
    key: 'education',
    label: '🎓 Education',
    targets: EDUCATION_TARGETS,
    format: (v) => `${v} classes`,
  },
  { key: 'career', label: '💼 Career', targets: CAREER_TARGETS, format: (v) => `${v} prestige` },
]

const PRESETS: Record<string, Record<keyof Goals, number>> = {
  Quick: { wealth: 2, happiness: 2, education: 2, career: 2 },
  Standard: { wealth: 4, happiness: 4, education: 4, career: 4 },
  Marathon: { wealth: 7, happiness: 7, education: 7, career: 7 },
}

export function StartScreen() {
  const { startGame, importSave } = useGame()
  const [name, setName] = useState('')
  const [levels, setLevels] = useState<Record<keyof Goals, number>>(PRESETS.Standard)
  const [rileyProfile, setRileyProfile] = useState<AiProfileName>('balanced')
  const [rulePreset, setRulePreset] = useState<RulePresetName>('classic')
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    <div className="start">
      <div>
        <h1>
          Fast <span>Lane</span>
        </h1>
        <p className="tagline">
          Sixty hours a week. Rent is due, the fridge is empty, and Riley is already at work. Hit
          all four life goals before they do.
        </p>
      </div>

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
            <button key={label} onClick={() => setLevels(preset)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {ROWS.map((row) => (
        <div className="goal-row" key={row.key}>
          <span>{row.label}</span>
          <input
            type="range"
            min={1}
            max={10}
            value={levels[row.key]}
            aria-label={`${row.label} goal`}
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
              key={prof.id}
              className={rileyProfile === prof.id ? 'primary' : ''}
              aria-pressed={rileyProfile === prof.id}
              onClick={() => setRileyProfile(prof.id)}
            >
              {prof.label}
            </button>
          ))}
        </div>
        <p className="blurb">{RILEY_PROFILES.find((prof) => prof.id === rileyProfile)!.blurb}</p>
      </div>

      <div className="start-actions">
        <button
          className="primary"
          onClick={() =>
            startGame({
              playerName: name.trim() || 'You',
              goals,
              rileyProfile,
              rules: RULE_PRESETS[rulePreset],
            })
          }
        >
          Start new game
        </button>
        <button onClick={() => fileInputRef.current?.click()}>Import save</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleFileChange}
          hidden
        />
      </div>
      {importError && <p className="locked">{importError}</p>}
    </div>
  )
}
