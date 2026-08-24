# Project Guidelines (AGENTS.md)

<!--
  SINGLE SOURCE OF TRUTH for AI assistant instructions.
  CLAUDE.md and .github/copilot-instructions.md are thin pointers to this file —
  edit HERE, not there. (Claude Code, Copilot, Cursor, and most agents all read
  AGENTS.md natively or via the pointer files.)

  AGENTS.md supports hierarchy in monorepos:
    /AGENTS.md              - Root defaults
    /apps/web/AGENTS.md     - App-specific (overrides root for that subtree)
-->

## Project Overview

**Fast Lane** — a modern, single-player life-sim board game. You get 60 hours
a week to work, study, eat, pay rent, and have a life; the AI rival "Riley"
plays by the same rules each week. First to hit all four life goals (Wealth,
Happiness, Education, Career) wins.

Architecture:

- `src/engine/` — pure, deterministic TypeScript game engine (no React imports).
  All rules live here: `actions.ts` (player verbs), `week.ts` (weekly upkeep,
  economy, events, victory), `ai.ts` (Riley's policy — it calls the same
  action functions as the human player), `data.ts` (jobs/items/locations/tuning),
  `rng.ts` (seeded PRNG; the seed lives in `GameState` so games replay identically).
- `src/state/` — React context wrapping the engine reducer + localStorage saves.
- `src/ui/` — components only; no game rules. Engine `EngineError` messages
  surface as toasts.

Rules of thumb: game-balance changes go in `data.ts`; new mechanics get an
action in `actions.ts` + a case in `engine.ts` + engine tests; the AI must only
ever act through the same action functions as the player.

## Stack (web profile)

- React + TypeScript + Vite; deployed to Cloudflare Pages/Workers via wrangler
- Package manager: **pnpm** (declare `packageManager` in package.json; do not mix with npm)
- Node: `>=24` (pinned in `.nvmrc`)
- Tests: **Vitest** (+ Testing Library for components); coverage via `vitest run --coverage`
- Lint/format: ESLint + Prettier

## Build Commands

```bash
pnpm install
pnpm dev          # local dev server
pnpm cf:dev       # wrangler dev (Workers runtime)
pnpm test         # vitest
pnpm lint         # eslint
pnpm type-check   # tsc --noEmit
pnpm format       # prettier
pnpm build        # production build
```

## Deployment

- Cloudflare Workers via `wrangler deploy`; config lives in `wrangler.toml`/`wrangler.jsonc`
- Never deploy or commit unless explicitly asked
- Secrets via `wrangler secret` / environment variables — never hardcoded, never logged

## Code Style

- Write clean, readable code with meaningful names
- Follow language-idiomatic conventions
- Prefer composition over inheritance
- Keep functions focused and under 30 lines
- Use early returns to reduce nesting
- Handle errors explicitly — no silent catches

## Architecture

- Clear separation of concerns; business logic out of route handlers and UI components
- Dependency injection for testability
- Prefer explicit over implicit; no magic strings/numbers

## Testing

- All new code includes unit tests
- Follow Arrange-Act-Assert pattern
- Test behavior, not implementation
- Cover happy path, edge cases, and error cases

## Security

- Validate all user input at boundaries
- Parameterized queries for database operations
- Never log sensitive data
- Use environment variables for secrets

## Conventions

- Conventional commits: `type(scope): description` (enforced with commitlint where configured)
- Branch naming: `type/short-description`
- One logical change per pull request
- Update documentation when changing public APIs
