# mlld project guidelines

repo: github.com/mlld-lang/mlld

## Learn the Language

Run `mlld howto intro` for a quick overview of what mlld is and how it works. Run `mlld howto` to browse all documentation topics, `mlld howto grep <pattern>` to search.

## Everyday Commands

```bash
npm run build                        # Full build (grammar + TS + fixtures + outputs)
npm test                             # Run tests (incremental build runs automatically via pretest)
npm test <dir>                       # Run tests for a section (e.g. npm test interpreter/)
npm test <file>                      # Run specific test file
npm run test:case -- <fixture-path>  # Run fixture tests by path
                                     #   npm run test:case -- feat/alligator
                                     #   npm run test:case -- slash/var
npm run ast -- '<mlld syntax>'       # Show AST for syntax (also accepts file paths or stdin)
mlld validate <file|dir>             # Validate mlld syntax without executing
mlld run <script>                    # Run script from llm/run/
```

## Code Style

- **Imports**: Use `@` path aliases (`@core/`, `@interpreter/`, `@grammar/`, etc.) from tsconfig.json. No relative paths.
- **Formatting**: 2-space indent, single quotes, semicolons
- **Naming**: PascalCase for classes/interfaces, camelCase for methods/variables
- **Types**: Strict checking, explicit return types

## Architecture Map

See `docs/dev/ARCHITECTURE.md` for the full system map. Key layers:

| Layer | Code | Deep dive |
|---|---|---|
| Grammar/Parser | `grammar/*.peggy`, `grammar/deps/grammar-core.ts` | `docs/dev/GRAMMAR.md` |
| Interpreter | `interpreter/core/`, `interpreter/eval/` | `docs/dev/INTERPRETER.md` |
| Environment | `interpreter/env/Environment.ts` | `docs/dev/INTERPRETER.md` |
| Modules/Imports | `interpreter/eval/import/*` | `docs/dev/MODULES.md` |
| Pipelines | `interpreter/eval/pipeline/*` | `docs/dev/PIPELINE.md` |
| Errors | `errors/{parse,js}/*/`, `core/errors/` | `docs/dev/ERRORS.md` |
| Tests | `tests/cases/`, `tests/fixtures/` | `docs/dev/TESTS.md` |
| SDK | `sdk/` | `docs/dev/SDK.md` |
| CLI | `bin/mlld.ts`, `cli/commands/` | — |

Runtime flow: parse AST → single-pass `evaluate()` → emit effects → format output. No separate resolution phase.

## Test System

Full details in `docs/dev/TESTS.md`. The essentials:

- **Valid tests**: `tests/cases/{slash,feat,integration}/` — `example.md` + `expected.md`
- **Error tests**: `tests/cases/{invalid,exceptions,warnings}/` — `example.md` + `error.md`
- **File naming**: CRITICAL — unique names across ALL tests. Prefix with context: `import-all-config.mld` not `config.mld`
- **Skip tests**: Place `skip.md` in a test dir to skip it during fixture generation
- **Build fixtures**: `npm run build:fixtures` regenerates `.generated-fixture.json` files
- **Fast mode**: Set `TESTFAST=true` in `.env.local` to skip slow integration tests (~9s vs ~16s)

## Error System

Full details in `docs/dev/ERRORS.md`. Error patterns are compiled at build time from `errors/{parse,js}/*/` directories. Each pattern has a `pattern.js` (pure function, no imports) and `error.md` (template). Run `npm run build:errors` after adding patterns.

## Grammar

Full details in `docs/dev/GRAMMAR.md`. Peggy.js grammar with abstraction-first design. Files in `grammar/*.peggy` concatenate during build. Edit helpers in `grammar/deps/grammar-core.ts` only, never in `grammar/generated/`. Always `npm run build:grammar` before testing grammar changes.

## Generated Files (Gitignored)

- `grammar/generated/*` — parser output
- `tests/fixtures/**/*.generated-fixture.json` — test fixtures
- `core/errors/patterns/*.generated.js` — compiled error patterns

Run `npm run build` after pulling to regenerate.

## Documentation Map

Three audiences: `docs/dev/` (contributors), `docs/user/` (users → website), `docs/src/atoms/` → `docs/llm/` (LLM context). See `docs/dev/DOCS.md` for the full guide.

Key dev docs beyond architecture:
- `docs/dev/VAR-EVALUATION.md` — variable resolution contexts and behavior
- `docs/dev/DATA.md` — structured values, metadata, content loading
- `docs/dev/SECURITY.md` — label flow, policy enforcement, guards
- `docs/dev/OUTPUT.md` — intent/effect system, document rendering
- `docs/dev/STREAMING.md` — StreamBus, sinks, SDK stream events
- `docs/dev/BUILD-TEST.md` — incremental build system details

## Rules

- Always write "mlld" in lowercase (not "MLLD", "Mlld")
- Use `tmp/` for throwaway scripts and temp files
- Edit existing files; don't create revised copies
- **NEVER use `git add -A`** — always add specific files
- **NEVER use `git clean -fd`** — uncommitted files are used for project work
- Don't run `mlld run polish` or `mlld run qa` — have the user run them (30+ min)
- Don't run `npx mlld` — use `mlld` (locally installed via `npm install -g .`)
- Always build before testing grammar or fixture changes: `npm run build`
