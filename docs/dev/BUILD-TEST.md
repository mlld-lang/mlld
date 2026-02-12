---
updated: 2025-01-08
tags: #build, #test, #perf
related-docs: .env.local.example
related-code: scripts/build-incremental.js, scripts/test-runner.js
---

# Build & Test System

## tldr

- **Granular builds**: Only rebuilds changed components (grammar, TypeScript, errors, version)
- **Fast tests**: `TESTFAST=true` in `.env.local` skips selected slow integration/e2e files and slow fixture cases
- **Test cycle**: ~9s fast mode (94% coverage), ~16s full suite
- Entry: `npm test` (runs `pretest` → `build-incremental.js` → `test-runner.js`)

## Principles

- Build only what changed (grammar separate from TypeScript)
- Skip tests you rarely touch (import edge cases, CLI security tests)
- Default to safe (CI runs full suite, can always force rebuild)
- Use git working tree for change detection, fall back to timestamps

## Details

### Build System (`scripts/build-incremental.js`)

Checks each component independently:

**Grammar** - rebuilds if:
- `grammar/mlld.peggy` changed
- `grammar/**/*.ts` changed (except tests)
- Output missing: `grammar/generated/parser/*.{js,cjs,ts}`

**TypeScript** - rebuilds if:
- Source `.ts` files changed (not tests, not grammar)
- Output missing: `dist/*.{mjs,cjs}`
- Build > 24 hours old

**Errors** - rebuilds if:
- `scripts/build-*-errors.js` changed
- Output missing: `core/errors/patterns/*.generated.js`

**Version** - rebuilds if:
- `package.json` changed
- Output missing: `core/version.ts`

**Config files always trigger rebuild:**
`package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.build.json`, `tsup.config.ts`, `vitest.config.mts`

### Test System (`scripts/test-runner.js`)

Reads `TESTFAST` from `.env.local` or environment variable.

**TESTFAST=true skips 9 test files plus e2e tests:**
- `tests/integration/imports/edge-cases.test.ts` (6s)
- `tests/integration/cli/absolute-paths.test.ts` (10s)
- `tests/integration/imports/local-resolver-bugs.test.ts` (4s)
- `tests/integration/shadow-env-basic-import.test.ts` (5s)
- `tests/integration/imports/shadow-environments.test.ts` (~4s)
- `tests/integration/imports/complex-scenarios.test.ts` (~3s)
- `tests/integration/node-shadow-cleanup.test.ts` (~2.5s)
- `tests/integration/heredoc-large-variable.test.ts` (1s)
- `core/registry/python/VirtualEnvironmentManager.test.ts` (~3s)
- `tests/*.e2e.test.ts` (glob exclude)

**TESTFAST=true also skips known slow fixture cases:**
- `feat/with/combined`
- `feat/with/needs-node`
- `slash/run/command-bases-npm-run`

**Still runs:** Shadow env, complex imports, cleanup tests, remaining fixture tests, all unit tests

**Full suite mode (`TESTFAST=false`) runs all fixture cases, including the slow fixture cases.**

### Commands

```bash
npm test                    # Uses .env.local TESTFAST setting
TESTFAST=false npm test     # Force full suite
npm run test:force          # Force rebuild + test
node scripts/build-incremental.js  # Manual build check
```

### Change Detection

Uses git commands to detect changes:
1. `git diff --cached --name-only` (staged)
2. `git diff --name-only` (unstaged)
3. `git ls-files --others --exclude-standard` (untracked)

Falls back to timestamp comparison if git unavailable.

## Gotchas

- TESTFAST is gitignored (`.env.local`), can't accidentally commit
- Build skips are conservative: any error → rebuild
- Test file changes don't trigger builds, but source file changes in any component trigger that component's rebuild
- Parallel test execution means slow tests add less wall time than their individual durations

## Debugging

Check build decisions:
```bash
node scripts/build-incremental.js  # Shows what needs rebuilding and why
git status --short                 # See what changed
```

Check test mode:
```bash
cat .env.local                     # See TESTFAST setting
npm test | head -5                 # See which mode is active
```

Force clean state:
```bash
FORCE_BUILD=1 TESTFAST=false npm test  # Full rebuild + full suite
```
