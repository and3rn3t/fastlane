# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Mobile-first responsive layout (Wave 0): scrollable topbar stat strip, shrunk board tiles under 480px, sheet-styled location panel
- `viewport-fit=cover` + `env(safe-area-inset-*)` padding on `.app`/`.modal-backdrop`/`.toast` (Wave 0) so iPhone notch/Dynamic Island/home indicator never cover content
- Touch-target sizing (Wave 0): 44px minimum on buttons/number inputs, `touch-action: manipulation`, explicit 16px input font-size, `inputMode`/`enterKeyHint` on numeric fields
- Scroll polish (Wave 0): `overscroll-behavior` containment on the event log/modal/topbar-stats scroll regions so they don't chain into page-level rubber-band bounce
- Home Screen icon/meta + iOS install nudge (Wave 0): `public/favicon.svg`, `public/apple-touch-icon.png` (placeholder), theme-color/apple-mobile-web-app meta, and `InstallPrompt.tsx` — an iOS-only "Add to Home Screen" banner shown after a player's first completed week
- Open Graph + Twitter Card tags and a rendered `public/og-image.png` share preview (Wave 0)
- Save export/import (Wave 0): `GameContext.tsx` `exportSave`/`importSave`, an Export button in `TopBar`, an Import file picker on `StartScreen` — manual backup for players who never install to Home Screen
- Riley turn playback (Wave 1): step-by-step replay of Riley's real week — the pawn walks their actual path, a bottom bar captions each action, Skip jumps to the report. Small additive engine change: `actions.ts`'s `log()` now attaches location, and 7 previously-silent actions now log
- Onboarding + help (Wave 1): `Help.tsx` — a "?" button in `TopBar` opens a modal covering goals, time/board, dress/jobs, savings/economy, and Riley; auto-opens once per browser on first visit (`localStorage`, not save data, so a fresh game won't re-nag a returning player)
- Board animations (Wave 1): the player now has a board token (🙂, matching Riley's 🎩) that glides between tiles via a measured, CSS-transitioned position instead of teleporting; newly-arrived tiles pulse; cash/time changes flash a floating `+/-N`
- Sound (Wave 1): `src/ui/sound.ts` — synthesized WebAudio blips (move/purchase/payday/disaster/win), no asset files, with a 🔊/🔇 toggle in `TopBar` persisted to `localStorage`
- End-of-game recap (Wave 1): `RecapChart.tsx` — two week-by-week line charts (net worth, career) on `GameOver`, built per the dataviz skill's full procedure (validated `--chart-you`/`--chart-riley` palette per mode, crosshair+tooltip, table-view twin, collision-avoiding end-labels). `GameState.history: WeekSnapshot[]` recorded once per week in `endWeek()` — **Wave 1 is now complete** (5/5 items; 2 needed small additive engine changes beyond the wave's original "UI-only" framing, both explicitly approved first)
- Save schema versioning & migration (Wave 2, first item): `GameState.version` + a `MIGRATIONS` map in `GameContext.tsx`, run on both load and import. Includes an explicit `0 → 1` migration that upgrades every pre-existing save in place (preserving real player progress) rather than discarding it, since that shape is fully known. Truly unknown saves still fall back to a fresh game, now with a visible error toast instead of silent data loss
- Global error boundary & save reset (Wave 2): `ErrorBoundary.tsx` wraps the app in `main.tsx`; a crash now shows a recoverable "Something broke" screen (download the save first, or reset and start over) instead of unmounting to a blank white page
- Baseline balance simulation harness (Wave 2, last prereq): `pnpm sim [gameCount]` (`scripts/sim.ts`) runs headless AI-vs-AI games on the Standard preset, reporting win rate and average weeks-to-win — rerun after each remaining Wave 2 mechanic to catch a balance regression before a player does. Baseline: 65.5% player / 34.5% Riley win rate, 0% hit the 60-week cap, over 200 games
- Health & doctor (Wave 2, first gameplay item): `PlayerState.health` (0–100), drained by overworking past 40h/week or a week fed entirely from cheap groceries instead of hot meals; low health drags happiness down too. A new sickness outcome in `personalEvent()`'s table can cost 4–11h the following week below 50 health. New Clinic location (`seeDoctor` action, +35 health for $45/3h) — required growing the board from a 4×4 to a 4×5 grid to fit a 13th location, which also shifts a few existing wrap-around travel costs (e.g. home↔rentoffice: 1h → 2h). AI gained an `ensureHealth` priority so Riley (and the sim's AI side) manage their own health. Save schema bumped to version 2, migrating `health`/`hoursWorkedThisWeek` onto any older save
- Job promotions & career ladder (Wave 2): `PlayerState.jobTenureWeeks`/`promotionLevel` — showing up (working ≥1h) at the same job for 6 weeks earns the next of up to 3 promotion levels, each worth +15% wage and +4 prestige, without switching jobs. A no-show week resets progress toward the next promotion, not one already earned; switching or quitting resets both fields. Save schema bumped to version 3, migrating the new fields onto any older save
- Durable goods (Wave 2): new Computer item ($380, Gadget City) unlocks the senior "office" jobs (Financial Analyst, Branch Manager, Professor) via a new `JobDef.requiresComputer`; new Home Insurance item ($150, First Bank) protects durable goods from a new independent burglary roll (8%/week, unsecured + uninsured homes only) that can steal one owned item, separate from the existing cash-robbery event. AI buys a computer when it's the blocking qualification for its next job, and insures its belongings once it has some
- Loans & credit (Wave 2): bank loans (`takeLoan`/`repayLoan` at First Bank) against a 0–100 credit score that sets the borrowing limit; 2%/week interest accrues on any balance, a payment raises credit, a missed week lowers it, and 3 consecutive misses trigger wage garnishment (30% of each paycheck auto-diverted to the loan) until it's paid off. `netWorth()` now subtracts loan balance, so borrowing can't be used to fake progress toward the Wealth goal. Save schema bumped to version 4, migrating the new fields onto any older save
- Casino (Wave 2): a wheel bet (`playCasino`) at a new "Lucky Star Casino" location — resolves immediately, ~10% house edge by design, player-only (Riley never gambles, same as the lottery and loans). Board grew to 14 locations, filling the one gap left over from Health & doctor's earlier resize; a few wrap-around travel costs shifted again as a result (home↔rentoffice: 2h → 3h)
- AI personalities (Wave 2): Riley's strategy weights extracted into four named `AI_PROFILES` (Balanced, Hustler, Scholar, Gambler — the latter is the one profile that now uses the casino), picked via a new "Riley's playstyle" selector on the start screen. Balanced reproduces the original policy exactly, byte-identical in `pnpm sim`; Hustler and Gambler are measurably weaker opponents, a real (if coarse) difficulty choice. `GameState.rileyProfile` is a new game-level field; save schema bumped to version 5, defaulting older saves to Balanced. `pnpm sim` gained a `[profile]` CLI arg to test each one against a fixed Balanced opponent
- Rule presets (Wave 2, last item — **Wave 2 is now complete**): new `RulesConfig` (event frequency, economy volatility, starting cash) and a Classic/Brutal/Zen `RULE_PRESETS` record, picked via a new "Rules" selector on the start screen. Classic reproduces today's exact defaults, byte-identical in `pnpm sim`. `GameState.rules` is a new game-level field; save schema bumped to version 6, defaulting older saves to Classic
- Achievements & stats (Wave 3): new `src/stats.ts` — lifetime win/loss record, fastest win, and six achievements (Debt-Free, Down But Not Out, First Win, High Roller, Ivy League, Marathon Winner), computed from a completed game's own log rather than new save fields, so this needed no save migration. Shown as a "🏆 Achievement unlocked" banner on `GameOver` and a "🏆 Your Record" section on `StartScreen`, persisted in `localStorage` independently of any save. Fixed a real bug caught along the way: React StrictMode double-invoking `GameOver`'s recording effect was silently hiding the achievement banner every time
- Daily challenge (Wave 3): new `src/daily.ts` — a same-for-everyone daily game (date-derived seed, Standard goals, Classic rules, Balanced Riley) via a new "🗓️ Daily Challenge #N" card on `StartScreen`. `GameOver` shows a Wordle-style emoji grid (one row per goal, 5 squares filled to that goal's final progress) with a "📋 Copy result" button for either side's finished game. `GameState.isDailyChallenge` is a new field; save schema bumped to version 7, defaulting older saves to `false`
- Working quality CI (`ci.yml`): lint, type-check, format check, tests, build on Node 24 (Python variant included)
- `codeql.yml` and `dependency-review.yml` security workflows
- `.nvmrc` (Node 24), `renovate.json` (canonical config), `commitlint.config.mjs` + `.husky/commit-msg`
- `.cursor/rules/project.mdc` (modern Cursor format) and `.pre-commit-config.yaml` (Python profile)
- `docs/README-template.md` — standard README structure (pitch → badges → features → stack → quick start → scripts)
- Full git-hook suite: `pre-commit` (lint-staged + gitleaks) and `pre-push` (validate gate) + `.lintstagedrc.json`
- Workflow extras: release-drafter (+ config), stale.yml, PR labeler (+ config), Lighthouse starter (disabled)
- `profiles/web/` — canonical eslint/prettier/tsconfig/wrangler configs for React+TS+Vite+Cloudflare repos
- Doc scaffolds: `docs/ARCHITECTURE-template.md`, `docs/PRD-template.md`, `docs/ROADMAP-template.md` (pull-loop convention), `docs/adr/0000-template.md`
- `.gitattributes` — LF normalization, binary marks, lockfiles marked linguist-generated

### Changed

- Renamed the AI rival from Jones to Riley across the engine (`PlayerKey`, `GameState.riley`, `ai.ts`), UI, and tests; README/AGENTS.md no longer name the 1990 title this project was inspired by. Reduces trademark/franchise-association exposure as the project grows a public user base.
- Live domain migrated to `fastlane.andernet.dev` (from `jones.andernet.dev`), completing the rebrand above; `index.html`'s OG/Twitter URLs updated to match. The old domain has no redirect set up — it currently 530s instead of forwarding.
- `AGENTS.md` is now the single source of truth; `CLAUDE.md`, `copilot-instructions.md`, `.cursorrules`, `.clinerules`, `.windsurfrules` are pointers
- `AGENTS.md` documents and3rn3t stack defaults (React+TS+Vite+Wrangler / Python CLI profiles)
- SECURITY.md, CODEOWNERS, LICENSE filled with real defaults instead of TODO placeholders
- devcontainer Node feature and release workflow action versions updated
- `ai.ts`'s AI policy parameterized from a hardcoded `riley` accessor to `runAIWeek(state, key: PlayerKey)`, so `scripts/sim.ts` can drive either side with the same logic; pure refactor, verified behavior-neutral against the existing seeded-RNG AI tests

### Removed

- `.github/dependabot.yml` (Renovate is the standard)

### Fixed

- Real-device Wave 0 QA (iPhone, dark mode, portrait, Safari tab) found two mobile bugs neither Chromium testing nor code review caught: `.goal-row`'s range input had no explicit width and overflowed its grid track, clipping goal values off-screen on `StartScreen` (never tested at mobile width before); `.side`'s negative `margin-top` (added for a "pulled up" sheet look) was covering the bottom board-tile row's text, not just its shadow. Also tightened `.start`'s desktop-era spacing for mobile and added a fade-mask on the topbar stat strip so it reads as scrollable instead of cut off. Round 2 (landscape + installed Home Screen app) came back clean — **Wave 0 is complete.**
- `endWeek()`'s `logStart` was captured after `runRileyWeek()` had already run, so `lastReport.entries` — and the static week-report modal — never actually contained Riley's turn, only end-of-week system events. Found while building turn playback; now captured before Riley's turn runs.

## [0.1.0] - YYYY-MM-DD

### Added

- Initial project setup
- TODO: Describe what was included in the first release

<!-- Link definitions — update these URLs for your repository -->
<!-- [Unreleased]: https://github.com/YOUR_ORG/YOUR_REPO/compare/v0.1.0...HEAD -->
<!-- [0.1.0]: https://github.com/YOUR_ORG/YOUR_REPO/releases/tag/v0.1.0 -->
