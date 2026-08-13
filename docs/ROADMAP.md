# Roadmap — Fast Lane

> Canonical "what's next" — AI agents and humans both pull work from here (see AGENTS.md).
> Each row is sized to fit one working session. **Size:** S = under an hour, M = one session, L = one long session (consider splitting).

## In Progress / Up Next

> Keep this block tiny: at most 1-2 items in progress, 1-2 up next.

| Status     | Item                              | Notes                    |
| ---------- | --------------------------------- | ------------------------ |
| ⬜ up next | Jones turn playback (Wave 1)      | Biggest game-feel win    |
| ⬜ up next | Onboarding + help screen (Wave 1) | New players are lost now |

## Wave Sequence

### Wave 1 — Game feel & clarity

The engine is done; the game _works_ but doesn't _feel_ alive. Everything here is UI-only — no engine changes.

| Status | Item                | Size | Notes                                                                                                                                                                        |
| ------ | ------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⬜     | Jones turn playback | M    | Jones's week currently resolves instantly. Replay his `WeekReport` as a step-by-step animated sequence (token moves, action toasts). Touch: `GameScreen.tsx`, `Board.tsx`.   |
| ⬜     | Onboarding + help   | M    | First-run coach marks (goals, time budget, locations) + a persistent "?" help modal explaining mechanics (wear, interest, economy drift). New `Help.tsx`; flag in save data. |
| ⬜     | Board animations    | M    | Animate player token along the loop path instead of teleporting; pulse the active location; animate cash/time deltas. CSS transitions in `Board.tsx` + `index.css`.          |
| ⬜     | Sound               | S    | WebAudio synth blips (move, purchase, payday, disaster, win) — no asset files. Mute toggle persisted with settings. New `src/ui/sound.ts`.                                   |
| ⬜     | Mobile layout       | M    | Board + panel currently assume desktop. Stack layout under 768px, bigger touch targets, panel as bottom sheet. `index.css`, `GameScreen.tsx`.                                |
| ⬜     | End-of-game recap   | S    | `GameOver.tsx` shows winner only. Add a week-by-week chart of net worth/career for both players (data already in state history). Read the dataviz skill before charting.     |

### Wave 2 — Gameplay depth

Engine + UI pairs. Keep each mechanic in its own module in `src/engine/` with tests; the deterministic-engine pattern (all randomness via `rng.ts`) must hold.

| Status | Item             | Size | Notes                                                                                                                                                                            |
| ------ | ---------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⬜     | Health & doctor  | M    | Health stat drained by overwork/cheap food; sickness events cost time; new Clinic location. Feeds the Happiness goal. `types.ts`, `week.ts`, `data.ts`, `LocationPanel.tsx`.     |
| ⬜     | Durable goods    | M    | Appliance store: TV/fridge/computer etc. — one-time buys that boost happiness or unlock jobs (computer → office track). Robbery can steal them; insurance counters.              |
| ⬜     | Loans & credit   | M    | Bank loans with credit rating (payment history), interest accrual in `week.ts`, garnishment on default. Enables early-game strategies beyond "work at the burger joint."         |
| ⬜     | Casino           | S    | Blackjack or wheel mini-game at a new location — time cost per play, house edge tuned so it's a trap, like the original. Pure engine action + small panel UI.                    |
| ⬜     | AI personalities | M    | Extract Jones's strategy weights in `ai.ts` into named profiles (Balanced / Hustler / Scholar / Gambler); difficulty picker on `StartScreen.tsx`. AI-vs-AI sim test per profile. |
| ⬜     | Rule presets     | S    | StartScreen presets: Classic / Brutal / Zen (event frequency, economy volatility, starting cash). Just a `RulesConfig` threaded through `data.ts` constants.                     |

### Wave 3 — Replayability

| Status | Item                 | Size | Notes                                                                                                                                                          |
| ------ | -------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⬜     | Hot-seat multiplayer | L    | 2–4 human players, turn hand-off screen. Engine already models players as an array; the work is UI flow + save format bump. Split: engine session, UI session. |
| ⬜     | Achievements & stats | M    | Lifetime stats + achievements ("Win without loans", "Evicted twice, still won") in localStorage. New `src/stats.ts`; surface on StartScreen + GameOver.        |
| ⬜     | Daily challenge      | S    | Seed-of-the-day (date-derived seed, fixed rules), shareable emoji result grid à la Wordle. Deterministic engine makes this nearly free.                        |

### Wave 4 — Cloudflare-native online

Each depends on the previous. Uses the existing Pages project; Functions live in `functions/`.

| Status | Item              | Size | Notes                                                                                                                                                      |
| ------ | ----------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ⬜     | Leaderboard       | M    | Pages Function + KV: submit daily-challenge score (seed replay-validated server-side — engine runs in the Worker too), top-100 board. Turnstile on submit. |
| ⬜     | Cloud saves       | M    | D1 table keyed by anonymous device ID; sync/restore saves across devices. Needs a wrangler.toml D1 binding + migration.                                    |
| ⬜     | Async multiplayer | L    | Play-by-turn vs a friend via Durable Objects + invite links. Big; plan its own mini-roadmap first (see AGENTS.md architecture step).                       |

### Wave 5 — Platform & quality

Anytime fillers; good for short sessions.

| Status | Item            | Size | Notes                                                                                                                  |
| ------ | --------------- | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| ⬜     | PWA             | S    | Manifest + service worker (vite-plugin-pwa), installable, offline play. Pairs naturally with cloud saves.              |
| ⬜     | Playwright E2E  | M    | Smoke: start game → work a shift → end week → save/reload. Wire into CI after the vitest job.                          |
| ⬜     | Accessibility   | M    | Keyboard-only play, focus management in modals, aria-live for week events, contrast pass. Use the a11y review skill.   |
| ⬜     | Perf/Lighthouse | S    | Repo already has `lighthouse.yml` — point it at the Pages URL, fix what it flags (code-split the report modal, fonts). |

## How To Pull Work

1. Check **In Progress / Up Next**. Finish 🟡 items before pulling new work.
2. Otherwise pull the topmost ⬜ from the active wave.
3. Mark it 🟡 in the same commit as the first code change.
4. When shipped: mark ✅ YYYY-MM-DD, promote the next ⬜, update CHANGELOG.md — same commit.
5. Every item lands with tests passing (`pnpm lint && pnpm type-check && pnpm test`) and deploys via push to `main`.

## Done

<!-- Move ✅ rows here periodically to keep the active tables short. -->

- ✅ 2026-08-13 — Core game: engine, Jones AI, React UI, saves, dark mode
- ✅ 2026-08-13 — Cloudflare Pages deploy + CI + jones.andernet.dev
