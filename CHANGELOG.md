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
