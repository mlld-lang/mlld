# mlld project guidelines

repo: github.com/mlld-lang/mlld

## Agents
Agents dispatched with the 'Task' tool can sometimes perform work you did not intend and the results can be counterproductive or even destructive. Please do not send agents on tasks without having a discussion with me first.

## Style Guide
- **Name convention**: Always write "mlld" in all lowercase when referring to the language (not "MLLD", "Mlld", or "MllD")

## Git Guidelines
- **NEVER EVER USE `git add -A`** ALWAYS add the specific files to be committed

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

## Code Style
- **Imports**: Use @ paths aliases (@ core/, @ services/, etc.) as defined in tsconfig.json -- no relative paths for imports
- **Structure**: Use interface-first design (I[Name]Service interfaces + implementation)
- **Formatting**: 2-space indentation, single quotes, semicolons
- **Types**: Strict type checking enabled, always provide explicit return types
- **Naming**: PascalCase for classes/interfaces, camelCase for methods/variables
- **Test Structure**: 
  - **Directories**: `tests/cases/{valid,invalid,exceptions,warnings}/` → fixtures generated to `tests/fixtures/`
  - **Files**: `example.md` (input), `expected.md` (output for valid), `error.md` (error pattern for invalid/exceptions)
  - **Support files**: Auto-copied from test dir to VFS root. Manual setup in `interpreter.fixture.test.ts:760+` for complex cases
  - **Naming**: CRITICAL - Unique names across ALL tests. Prefix with context: `import-all-config.mld` not `config.mld`
  - **Build**: `npm run build:fixtures` → generates `.generated-fixture.json` files with AST + expected output
- **Error Handling**: Use specialized MlldError classes (MlldDirectiveError, MlldParseError, etc.) Many error conditions use the same method as tests to test our effectiveness at capturing error conditions and delivering consistent error messages. tests/cases/invalid (syntax errors), tests/cases/exceptions (runtime errors), tests/cases/warnings (plausibly valid syntax but common mistakes new mlld learners make), tests/cases/deprecated (deprecated examples - empty currently) 
- **Grammar:** Our peggy.js grammar uses an abstraction-focused modular design for DRY code that makes peggy's hierarchical traversal clear. Look for patterns to consolidate and abstract where possible. Key grammar docs: grammar/docs/README.md grammar/docs/DEBUG.md Refer to grammar/docs/NAMING-CONVENTIONS.md for naming patterns.

## Architecture 
- **Interpreter**: Single recursive `evaluate()` function
- **Environment class**: Combines state + capabilities (file I/O, command execution)
- **Direct evaluation**: No service orchestration or ResolutionService
- **Smart evaluators**: Each directive evaluator does all the work directly
- **CLI/API integrated**: Both now use the new interpreter directly

## Key Decisions & Context
- **Parser returns arrays** - We handle this in evaluate()
- **Newlines are nodes** - Preserved for markdown output
- **Direct execution** - Evaluators read files and execute commands directly
- **XML via llmxml** - Uses SCREAMING_SNAKE format for maximum clarity
- **AST Parsing**: ALWAYS use the AST -- never use regex

[... rest of the content remains the same ...]