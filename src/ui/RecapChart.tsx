import { useId, useState } from 'react'

interface ChartPoint {
  week: number
  you: number
  riley: number
}

const VIEW_W = 340
const VIEW_H = 176
const MARGIN = { top: 14, right: 56, bottom: 24, left: 44 }
const PLOT_W = VIEW_W - MARGIN.left - MARGIN.right
const PLOT_H = VIEW_H - MARGIN.top - MARGIN.bottom

/** Rounds up to a "clean" axis max: 1/2/5/10 × a power of ten. */
function niceMax(raw: number): number {
  if (raw <= 0) return 10
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normalized = raw / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function pickIndices(count: number): number[] {
  if (count <= 6) return Array.from({ length: count }, (_, i) => i)
  const fractions = [0, 0.25, 0.5, 0.75, 1]
  return Array.from(new Set(fractions.map((f) => Math.round((count - 1) * f))))
}

export function RecapChart({
  title,
  data,
  format,
}: {
  title: string
  data: ChartPoint[]
  format: (n: number) => string
}) {
  const id = useId()
  const [showTable, setShowTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)

  if (data.length === 0) return null

  const maxY = niceMax(Math.max(1, ...data.map((d) => Math.max(d.you, d.riley))) * 1.05)
  const xAt = (i: number) =>
    MARGIN.left + (data.length > 1 ? (i / (data.length - 1)) * PLOT_W : PLOT_W / 2)
  const yAt = (v: number) => MARGIN.top + (1 - v / maxY) * PLOT_H

  const youPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(d.you)}`).join(' ')
  const rileyPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(d.riley)}`).join(' ')
  // A safe overestimate of the polyline's real length (getTotalLength isn't
  // available before layout), so the stroke-dashoffset draw-in animation
  // always reveals the whole line regardless of how jagged it is.
  const maxPathLen = PLOT_W + data.length * PLOT_H
  const last = data[data.length - 1]
  const xTicks = pickIndices(data.length)
  const yTicks = [0, maxY * 0.5, maxY]

  // Nudge end-labels apart when the lines converge — the dots stay at their
  // true positions, only the text moves, so it never misrepresents the data.
  const MIN_LABEL_GAP = 11
  const youDotY = yAt(last.you)
  const rileyDotY = yAt(last.riley)
  let youLabelY = youDotY
  let rileyLabelY = rileyDotY
  if (Math.abs(rileyDotY - youDotY) < MIN_LABEL_GAP) {
    const mid = (youDotY + rileyDotY) / 2
    const half = MIN_LABEL_GAP / 2
    youLabelY = youDotY <= rileyDotY ? mid - half : mid + half
    rileyLabelY = youDotY <= rileyDotY ? mid + half : mid - half
  }

  function handlePointer(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W
    const fraction = data.length > 1 ? (relX - MARGIN.left) / PLOT_W : 0
    const idx = Math.max(0, Math.min(data.length - 1, Math.round(fraction * (data.length - 1))))
    setHover(idx)
  }

  return (
    <div className="recap-chart">
      <div className="recap-chart-head">
        <h4>{title}</h4>
        <div className="recap-legend">
          <span className="recap-legend-item">
            <span className="recap-swatch you" /> You
          </span>
          <span className="recap-legend-item">
            <span className="recap-swatch riley" /> Riley
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`${title}: you ended at ${format(last.you)}, Riley at ${format(last.riley)}`}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              className="recap-grid"
              x1={MARGIN.left}
              x2={VIEW_W - MARGIN.right}
              y1={yAt(t)}
              y2={yAt(t)}
            />
            <text
              className="recap-tick"
              x={MARGIN.left - 6}
              y={yAt(t)}
              textAnchor="end"
              dy="0.32em"
            >
              {format(Math.round(t))}
            </text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text
            key={i}
            className="recap-tick"
            x={xAt(i)}
            y={VIEW_H - MARGIN.bottom + 14}
            textAnchor="middle"
          >
            W{data[i].week}
          </text>
        ))}
        <path
          className="recap-line you recap-line-draw"
          d={youPath}
          strokeDasharray={maxPathLen}
          style={
            {
              '--chart-path-len': maxPathLen,
              animationDelay: '0.1s',
            } as React.CSSProperties
          }
        />
        <path
          className="recap-line riley recap-line-draw"
          d={rileyPath}
          strokeDasharray={maxPathLen}
          style={
            {
              '--chart-path-len': maxPathLen,
              animationDelay: '0.3s',
            } as React.CSSProperties
          }
        />
        <circle className="recap-dot you" cx={xAt(data.length - 1)} cy={youDotY} r={4} />
        <circle className="recap-dot riley" cx={xAt(data.length - 1)} cy={rileyDotY} r={4} />
        <text className="recap-endlabel" x={xAt(data.length - 1) + 8} y={youLabelY} dy="0.32em">
          {format(last.you)}
        </text>
        <text className="recap-endlabel" x={xAt(data.length - 1) + 8} y={rileyLabelY} dy="0.32em">
          {format(last.riley)}
        </text>
        {hover !== null && (
          <>
            <line
              className="recap-crosshair"
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={MARGIN.top}
              y2={VIEW_H - MARGIN.bottom}
            />
            <circle className="recap-dot you" cx={xAt(hover)} cy={yAt(data[hover].you)} r={4} />
            <circle className="recap-dot riley" cx={xAt(hover)} cy={yAt(data[hover].riley)} r={4} />
          </>
        )}
        <rect
          x={MARGIN.left}
          y={MARGIN.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="transparent"
          onPointerMove={handlePointer}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div
          className="recap-tooltip"
          style={{ left: `${(xAt(hover) / VIEW_W) * 100}%` }}
          role="status"
        >
          <strong>Week {data[hover].week}</strong>
          <span>
            <span className="recap-swatch you" /> {format(data[hover].you)}
          </span>
          <span>
            <span className="recap-swatch riley" /> {format(data[hover].riley)}
          </span>
        </div>
      )}
      <button
        className="recap-table-toggle"
        onClick={() => setShowTable((s) => !s)}
        aria-expanded={showTable}
        aria-controls={id}
      >
        {showTable ? 'Hide table' : 'Show as table'}
      </button>
      {showTable && (
        <table id={id} className="recap-table">
          <caption className="sr-only">{title} by week</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">You</th>
              <th scope="col">Riley</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.week}>
                <td>{d.week}</td>
                <td>{format(d.you)}</td>
                <td>{format(d.riley)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
