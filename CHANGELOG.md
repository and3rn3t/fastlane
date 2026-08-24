# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Mobile-first responsive layout (Wave 0): scrollable topbar stat strip, shrunk board tiles under 480px, sheet-styled location panel
- `viewport-fit=cover` + `env(safe-area-inset-*)` padding on `.app`/`.modal-backdrop`/`.toast` (Wave 0) so iPhone notch/Dynamic Island/home indicator never cover content
- Touch-target sizing (Wave 0): 44px minimum on buttons/number inputs, `touch-action: manipulation`, explicit 16px input font-size, `inputMode`/`enterKeyHint` on numeric fields
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

- Renamed the AI rival from Jones to Riley across the engine (`PlayerKey`, `GameState.riley`, `ai.ts`), UI, and tests; README/AGENTS.md no longer name the 1990 title this project was inspired by. Reduces trademark/franchise-association exposure as the project grows a public user base. The live domain (`jones.andernet.dev`) still needs migrating — tracked in `docs/ROADMAP.md` Wave 0.
- `AGENTS.md` is now the single source of truth; `CLAUDE.md`, `copilot-instructions.md`, `.cursorrules`, `.clinerules`, `.windsurfrules` are pointers
- `AGENTS.md` documents and3rn3t stack defaults (React+TS+Vite+Wrangler / Python CLI profiles)
- SECURITY.md, CODEOWNERS, LICENSE filled with real defaults instead of TODO placeholders
- devcontainer Node feature and release workflow action versions updated

### Removed

- `.github/dependabot.yml` (Renovate is the standard)

### Fixed

## [0.1.0] - YYYY-MM-DD

### Added

- Initial project setup
- TODO: Describe what was included in the first release

<!-- Link definitions — update these URLs for your repository -->
<!-- [Unreleased]: https://github.com/YOUR_ORG/YOUR_REPO/compare/v0.1.0...HEAD -->
<!-- [0.1.0]: https://github.com/YOUR_ORG/YOUR_REPO/releases/tag/v0.1.0 -->
