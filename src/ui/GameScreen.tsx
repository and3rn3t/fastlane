import { jobById, netWorth, type GameState } from '@/engine'
import { useGame } from '@/state/GameContext'
import { Board } from './Board'
import { LocationPanel } from './LocationPanel'

function TopBar({ game }: { game: GameState }) {
  const { quitToMenu } = useGame()
  const p = game.player
  const job = p.jobId ? jobById(p.jobId) : null
  return (
    <header className="topbar">
      <span className="brand">
        Fast <span>Lane</span>
      </span>
      <div className="stat">
        <span className="label">Cash</span>
        <span className="value">${p.cash.toLocaleString()}</span>
      </div>
      <div className="stat">
        <span className="label">Net worth</span>
        <span className="value">${netWorth(p).toLocaleString()}</span>
      </div>
      <div className="stat">
        <span className="label">Job</span>
        <span className="value">{job ? job.title : '—'}</span>
      </div>
      <div className="stat">
        <span className="label">Dress</span>
        <span className={`value${p.dress < 10 ? ' low' : ''}`}>{p.dress}</span>
      </div>
      <div className="stat">
        <span className="label">Food</span>
        <span className={`value${p.fed + p.groceries < 6 ? ' low' : ''}`}>
          {Math.min(6, p.fed + p.groceries)}/6
        </span>
      </div>
      <div className="stat">
        <span className="label">Rent due</span>
        <span className={`value${p.rentDue > 0 ? ' low' : ''}`}>${p.rentDue}</span>
      </div>
      <span className="headline" title="This week's news">
        📰 {game.headline}
      </span>
      <button
        onClick={() => {
          if (window.confirm('Abandon this game and return to the menu?')) quitToMenu()
        }}
      >
        Menu
      </button>
    </header>
  )
}

function EventLog({ game }: { game: GameState }) {
  const recent = game.log.slice(-30).reverse()
  return (
    <div className="panel">
      <h2>📋 This life so far</h2>
      <div className="log">
        {recent.length === 0 && <span className="desc">Nothing yet — get out there.</span>}
        {recent.map((e, i) => (
          <div className="entry" key={`${game.log.length - i}`}>
            <span className="who">W{e.week}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function GameScreen({ game }: { game: GameState }) {
  return (
    <div className="app">
      <TopBar game={game} />
      <div className="game-layout">
        <Board game={game} />
        <div className="side">
          <LocationPanel game={game} />
          <EventLog game={game} />
        </div>
      </div>
    </div>
  )
}
