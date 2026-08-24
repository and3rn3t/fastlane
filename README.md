# Fast Lane

A modern, single-player life-sim board game where the rat race _is_ the board.

You get **60 hours a week**. Rent is due, the fridge is empty, your outfit is
wearing out, and your rival **Riley** is already at work. Travel the city loop,
take jobs, earn degrees, buy the things that make life bearable, and hit all
four life goals before Riley does:

| Goal         | Measured by                                               |
| ------------ | --------------------------------------------------------- |
| 💵 Wealth    | Net worth (cash + savings)                                |
| 😊 Happiness | 0–100, drifts back toward 50 — comfort must be maintained |
| 🎓 Education | Classes completed at City University                      |
| 💼 Career    | Prestige of your current job                              |

You pick how ambitious each goal is at the start (Quick / Standard / Marathon,
or per-goal sliders). Riley plays by **exactly the same rules** — their AI calls
the same engine actions the buttons do.

## The city

Twelve stops on a loop; walking costs an hour per stop (a bicycle halves it):
Home, Job Center, Burger Barn, MegaMart, City University, Assembly Works,
First Bank, Sharp Threads, Gadget City, Fresh Market, Pawn Shop, Rent Office.

Classic life-sim mechanics: hourly jobs with education/dress/
experience requirements, weekly rent (miss three weeks and you're evicted),
buying food or going hungry, clothes wearing out, savings interest, a drifting
economy with weekly headlines, a lottery, street robbery when you carry too
much cash, and random life events. Modernized: groceries auto-feed you at
week's end, a smartphone lets you apply for jobs and pay rent remotely, and
there's no manual "you forgot to eat" busywork.

## Development

```bash
pnpm install
pnpm dev          # local dev server
pnpm test         # engine + UI tests (Vitest)
pnpm lint         # eslint
pnpm type-check   # tsc --noEmit
pnpm build        # production build to ./dist
pnpm cf:dev       # serve the built app on the Workers runtime
```

The game engine (`src/engine/`) is pure TypeScript with a seeded RNG — no
React, fully deterministic, and covered by tests (`src/engine/__tests__/`),
including a test where Riley plays an entire game solo and wins. The UI
(`src/ui/`) renders state and dispatches engine actions; saves live in
localStorage.

See [AGENTS.md](AGENTS.md) for contributor conventions.

## License

MIT. Fast Lane is an original game inspired by classic 1990s life-sim board
games, with its own names, art, and code.
