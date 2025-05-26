# mlld project guidelines

## Build & Test Commands
```bash
npm run build        # Build the project
npm test <dir>       # Run tests for a specific section of code
npm test <file_path> # Run specific test file (e.g. npm test cli/priority-cli.test.ts)
npm run ast -- '<mlld syntax>'  # Shows AST for any valid Mlld syntax
```

## Code Style
- **Imports**: Use @ paths aliases (@core/, @services/, etc.) as defined in tsconfig.json -- no relative paths for imports
- **Structure**: Use interface-first design (I[Name]Service interfaces + implementation)
- **Formatting**: 2-space indentation, single quotes, semicolons
- **Types**: Strict type checking enabled, always provide explicit return types
- **Naming**: PascalCase for classes/interfaces, camelCase for methods/variables
- **Tests**: Test cases in tests/cases written in markdown --> grammar/scripts/build-fixtures.js builds fixtures from these when running `npm run build:fixtures` or when running `build` or `build:grammar` --> tests/fixtures have complete AST and expected final output --> @interpreter/interpreter.fixture.test.ts runs the tests in our fixtures, effectively creating e2e tests. when individual tests/cases need to reference files, they go in tests/cases/files
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

## Meld Syntax Rules

**Meld is a scripting language embedded in Markdown documents** - it enhances Markdown with dynamic content generation while preserving the readability of the source document.

### Core Syntax Principles
1. **Directives only at start of lines** - Meld directives (`@text`, `@data`, etc.) are ONLY interpreted when they begin a line
   - Exception: `@run` can be used on RHS of `@text` and `@exec` definitions
   - Exception: Directives can be used in RHS of `@data` object definitions
2. **Variables are created without `@`** - `@text name = "value"` (not `@text @name`)
3. **Variables are referenced with `@`** - Use `@name` in directives, `{{name}}` in templates
4. **Commands require brackets** - `@run [echo "hello"]` not `@run echo "hello"`
5. **Only `@run` and `@add` produce output** - Other directives define or assign but don't output
6. **Markdown-first design** - Everything that isn't a directive line is treated as regular Markdown

### Variable References
- In directives: `@variable` or `@object.field.subfield`
- In templates `[[...]]`: `{{variable}}` or `{{object.field.subfield}}`
- No mixing: Can't do `{{variable.@other.field}}` or `@{{variable}}`
- Plain text: `@variable` is literal text, not a reference

### Templates and Interpolation
- Templates use double brackets: `[[...]]`
- Only `{{variable}}` syntax works inside templates
- `@` symbols in templates are literal characters
- Directives inside templates are NOT executed - they're literal text
- Field access: `{{user.name}}` or `{{items.0.value}}`

### Exec Commands
- `@exec name(params) = @run [command]` - Defines a reusable command
- `@run @name(args)` - Executes the defined command
- Parameters are referenced with `@param` inside the command definition

### Import Syntax
- File imports: `@import { var1, var2 } from "path/to/file.mld"`
- Import all: `@import { * } from "path/to/file.mld"`
- Paths are relative to the importing file's directory

### Common Mistakes to Avoid
- ❌ `@run echo "hello"` → ✅ `@run [echo "hello"]`
- ❌ `@text @myvar = "value"` → ✅ `@text myvar = "value"`
- ❌ `Hello @name!` → ✅ `@text greeting = [[Hello {{name}}!]]` then `@add @greeting`
- ❌ `{{@variable}}` → ✅ `{{variable}}`
- ❌ `@path config = env.paths.dev` → ✅ `@path config = @env.paths.dev`

## Key File Locations
- **Grammar**: `grammar/mlld.peggy` (main), `grammar/directives/` (modular patterns)
- **Interpreter**: `interpreter/core/interpreter.ts` (main), `interpreter/eval/` (directive evaluators)  
- **Error Classes**: `core/errors/` (definitions), see `docs/dev/ERRORS.md` for system overview
- **Tests**: `tests/cases/` (markdown examples), `tests/fixtures/` (generated), `interpreter/interpreter.fixture.test.ts` (runner)
- **CLI**: `cli/index.ts` (entry point), `api/index.ts` (programmatic interface)
- **Examples**: `examples/` (real-world usage patterns and integration tests)

## Coding Practices
