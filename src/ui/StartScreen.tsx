import { useState } from 'react'
import {
  CAREER_TARGETS,
  EDUCATION_TARGETS,
  HAPPINESS_TARGETS,
  WEALTH_TARGETS,
  type Goals,
} from '@/engine'
import { useGame } from '@/state/GameContext'

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
  const { startGame } = useGame()
  const [name, setName] = useState('')
  const [levels, setLevels] = useState<Record<keyof Goals, number>>(PRESETS.Standard)

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
          Sixty hours a week. Rent is due, the fridge is empty, and Jones is already at work. Hit
          all four life goals before he does.
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

      <div className="start-actions">
        <button
          className="primary"
          onClick={() => startGame({ playerName: name.trim() || 'You', goals })}
        >
          Start new game
        </button>
      </div>
    </div>
  )
}
