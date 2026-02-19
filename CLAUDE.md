# mlld project guidelines

repo: github.com/mlld-lang/mlld

## Ticket management
- Use `tk` cli for ticket management. `tk help` to see how to use it.

## Style Guide
- **Name convention**: Always write "mlld" in all lowercase when referring to the language (not "MLLD", "Mlld", or "MllD")

## Reduce Clutter
- Use tmp/ for temporary test files and throwaway scripts
- Edit existing files rather than writing new 'revised' versions of the same file.

## Git Guidelines
- **NEVER EVER USE `git add -A`** ALWAYS add the specific files to be committed
- NEVER use `git clean -fd` -- we use uncommitted files for temporary project files and scripts, etc.

## Module System (JavaScript/TypeScript)
- **Package Type**: ESM-first (`"type": "module"`) - all `.js` files are ES modules
- **Dual Build**: tsup creates both `.mjs` and `.cjs` outputs for compatibility
- **Parser Generation**: Peggy generates both `parser.js` (ESM) and `parser.ts` (with types)
- **Important**: Run `npm run build:grammar` before other builds to generate the parser
- **Scripts**: Build scripts import parser directly from `grammar/parser/parser.js`
- **TypeScript**: Uses `@grammar/parser` which resolves to the index.ts wrapper
- See `docs/dev/MODULES.md` for complete module system documentation

## Build & Test Commands
```bash
npm run build        # Build the project
npm test <dir>       # Run tests for a specific section of code
npm test <file_path> # Run specific test file (e.g. npm test cli/priority-cli.test.ts)
npm run test:case -- <fixture-path>  # Run specific fixture test(s) by path
                     # Examples:
                     #   npm run test:case -- feat
                     #   npm run test:case -- feat/alligator
                     #   npm run test:case -- feat/alligator/glob-concat
npm run ast -- '<mlld syntax>'  # Shows AST for any valid mlld syntax
npm run ast -- file.mld         # Shows AST for a file (auto-detects if file exists)
cat file.mld | npm run ast      # Shows AST from stdin
mlld run <script>    # Run mlld script from script directory (default: llm/run/)
```

## Generated Files (Gitignored)
- **Grammar files**: `grammar/parser/*.js`, `grammar/parser/*.ts`, `grammar/generated/*`
- **Test fixtures**: `tests/fixtures/**/*.generated-fixture.json`
- **Always run**: `npm run build:grammar` after pulling to regenerate files locally
- This prevents merge conflicts from generated files

## Generated Files (not gitignored)
- `tests/cases/docs` are syntax validation smoke tests built from docs in order to ensure we do not ship syntactically invalid examples. They are built whenever running tests and should be committed alongside docs updates.

## Code Style
- **Imports**: Use @ paths aliases (@ core/, @ services/, etc.) as defined in tsconfig.json -- no relative paths for imports
- **Structure**: Use interface-first design (I[Name]Service interfaces + implementation)
- **Formatting**: 2-space indentation, single quotes, semicolons
- **Types**: Strict type checking enabled, always provide explicit return types
- **Naming**: PascalCase for classes/interfaces, camelCase for methods/variables
- **Test Structure**:
  - **Directories**: `tests/cases/` root for valid tests, subdirs `{invalid,exceptions,warnings}/` for special cases → fixtures to `tests/fixtures/`
  - **Files**: `example.md` (input), `expected.md` (output for valid), `error.md` (error pattern for invalid/exceptions)
  - **Support files**: Auto-copied from test dir to VFS root. Manual setup in `interpreter.fixture.test.ts:870+` for complex cases
  - **Naming**: CRITICAL - Unique names across ALL tests. Prefix with context: `import-all-config.mld` not `config.mld`
  - **Build**: `npm run build:fixtures` → generates `.generated-fixture.json` files with AST + expected output
  - **Skip system**: Place `skip.md` or `skip-*.md` files in test dirs to skip during fixture generation
- **Error Handling**: Use specialized MlldError classes (MlldDirectiveError, MlldParseError, etc.) Many error conditions use the same method as tests to test our effectiveness at capturing error conditions and delivering consistent error messages. tests/cases/invalid (syntax errors), tests/cases/exceptions (runtime errors), tests/cases/warnings (plausibly valid syntax but common mistakes new mlld learners make), tests/cases/deprecated (deprecated examples - empty currently) 
- **Grammar:** Our peggy.js grammar uses an abstraction-focused modular design for DRY code that makes peggy's hierarchical traversal clear. Look for patterns to consolidate and abstract where possible. Key grammar docs: grammar/docs/README.md grammar/docs/DEBUG.md Refer to grammar/docs/NAMING-CONVENTIONS.md for naming patterns.

## Architecture 
- **Interpreter**: Single recursive `evaluate()` function
- **Environment class**: Combines state + capabilities (file I/O, command execution)
- **Direct evaluation**: No service orchestration or ResolutionService
- **Smart evaluators**: Each directive evaluator does all the work directly
- **CLI/API integrated**: Both now use the new interpreter directly

## Important notes
- Don't ever run `mlld run polish` or `mlld run qa` -- have the user run them. They will take 30+ minutes to run.
- Don't ever run `npx mlld` -- use `mlld` (which is our local dir installed with `npm install -g .`)
