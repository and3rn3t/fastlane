export function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-label="How to play Fast Lane"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>❓ How to play</h2>
        <div className="help-sections">
          <section>
            <h3>🎯 Your goals</h3>
            <p className="blurb">
              Hit all four life goals before Riley does: 💵 Wealth (net worth), 😊 Happiness, 🎓
              Education (classes completed), and 💼 Career (job prestige). Track progress on the
              board's center panel.
            </p>
          </section>
          <section>
            <h3>⏱ Time & the board</h3>
            <p className="blurb">
              You get 60 hours a week. Tap a location tile to travel there — the cost in hours
              depends on how far around the loop it is (a bike halves it). Working, shopping, and
              most actions cost time too.
            </p>
          </section>
          <section>
            <h3>👔 Dress & jobs</h3>
            <p className="blurb">
              Clothes wear out — your Dress score drops 3 every week. Better jobs require a minimum
              Dress, Education, and Experience. Buy outfits at Sharp Threads to stay qualified.
              Staying at a job and showing up earns promotions over time — Career can grow without
              switching jobs.
            </p>
          </section>
          <section>
            <h3>🏦 Savings & the economy</h3>
            <p className="blurb">
              First Bank pays weekly interest on savings — and keeps cash safe from street robbery
              (carrying over $400 without a secure apartment is risky). Without a secure apartment
              or Home Insurance, a burglar can take a durable good too. Prices and wages drift every
              week; watch the headline for hints. Rent unpaid for 3 weeks means eviction.
            </p>
          </section>
          <section>
            <h3>⚕️ Health</h3>
            <p className="blurb">
              Working over 40h in a week, or living on cheap groceries instead of hot meals, wears
              your Health down — and low Health can make you sick, costing time the following week.
              Visit the Clinic to see a doctor and recover.
            </p>
          </section>
          <section>
            <h3>🎩 Riley</h3>
            <p className="blurb">
              Riley plays by exactly the same rules as you — same actions, same economy, no
              cheating. Watch their turn play out after you end each week.
            </p>
          </section>
        </div>
        <button className="primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}
