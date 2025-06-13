# mlld project guidelines

repo: github.com/mlld-lang/mlld

## Style Guide
- **Name convention**: Always write "mlld" in all lowercase when referring to the language (not "MLLD", "Mlld", or "MllD")

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
```

## Generated Files (Gitignored)
- **Grammar files**: `grammar/parser/*.js`, `grammar/parser/*.ts`, `grammar/generated/*`
- **Test fixtures**: `tests/fixtures/**/*.generated-fixture.json`
- **Always run**: `npm run build:grammar` after pulling to regenerate files locally
- This prevents merge conflicts from generated files

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

## CRITICAL: AST Usage Pattern
**BUILD WITH THE AST, NOT AROUND IT OR AGAINST IT**

The interpreter MUST work with the AST structure provided by the parser. This means:
- **NEVER use `.raw` fields** - These are legacy/debug fields. Use `.values` arrays exclusively
- **NEVER use string manipulation** - No regex, split, replace, match, startsWith on AST content
- **ALWAYS evaluate nodes** - Use `interpolate()` to extract values from node arrays
- **NEVER extract `.content` directly** - Even "simple" Text nodes should go through evaluation
- **NEVER construct nodes manually** - If you need synthetic nodes, create proper AST construction helpers

**Why this matters**: We've fixed this multiple times. Using `.raw` or string manipulation:
1. Defeats the entire purpose of having a parser and AST
2. Makes the code fragile - any grammar change breaks string assumptions
3. Creates inconsistent patterns - same operation done differently everywhere
4. Is actually MORE work than using the AST properly

**Correct pattern example**:
```typescript
// WRONG - uses raw field
const identifier = directive.raw?.identifier;

// WRONG - uses string manipulation  
if (content.startsWith('@')) { ... }

// RIGHT - uses AST evaluation
const identifierNodes = directive.values?.identifier;
const identifier = await interpolate(identifierNodes, env);
```

## Meld Syntax Rules

**Meld is a scripting language embedded in Markdown documents** - it enhances Markdown with dynamic content generation while preserving the readability of the source document.

### Core Syntax Principles
1. **Directives only at start of lines** - mlld syntax is only interpreted in lines that start with a mlld directive
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
- Context specific: "double brackets, double braces" is the rule: "literal text for @var and {{var}}",  [@var interpolation], [[template with {{var}} interpolation]]
- No mixing: Can't do `{{variable.@other.field}}` or `@{{variable}}`
- Plain text: `@variable` is literal text, not a reference

### Templates and Interpolation
- Templates use double brackets: `[[...]]`
- Only `{{variable}}` syntax works inside templates
- `@` symbols in templates are literal characters
- Directives inside templates are NOT executed - they're literal text
- Field access: `{{user.name}}` or `{{items.0.value}}`
- Backtick templates: `` `text with @var interpolation` `` - simpler alternative to `[[text with {{var}}]]`

### Exec Commands
- `@exec name(params) = @run [(command)]` - Defines a reusable command
- `@run @name(args)` - Executes the defined command
- Parameters are referenced with `@param` inside the command definition
- Shadow environments: `@exec js = { func1, func2 }` - Makes functions available to call from JS code
  - Functions can call each other within @run js blocks
  - Supports js and node (python/sh have grammar support but pending implementation)

### Import Syntax
- File imports: `@import { var1, var2 } from "path/to/file.mld"`
- Import all: `@import { * } from "path/to/file.mld"`
- Module imports: `@import { func1, func2 } from @author/module`
- Environment variables: `@import { GITHUB_TOKEN, NODE_ENV } from @INPUT`
  - Requires variables to be listed in `mlld.lock.json` security.allowedEnv
  - mlld validates required env vars exist at startup
- Paths are relative to the importing file's directory
- Modules use @ prefix for registry modules and private resolvers (no quotes)

### Common Mistakes to Avoid
- trying to treat mlld like a template langauge -- it's not; it's a programming language embedded in markdown, so it only works for lines starting with a @ directive
- ❌ `@run echo "hello"` → ✅ `@run [echo "hello"]`
- ❌ `@text @myvar = "value"` → ✅ `@text myvar = "value"`
- ❌ `Hello @name!` → ✅ `@text greeting = [[Hello {{name}}!]]` then `@add @greeting`
- ❌ `{{@variable}}` → ✅ `{{variable}}`
- ❌ `@path config = env.paths.dev` → ✅ `@path config = @env.paths.dev`

### Conditional Logic (@when)
- `@when @condition => @action` - Simple one-line conditional
- `@when @var first: [...]` - Execute first matching condition only
- `@when @var any: [...]` - Execute all matching conditions
- `@when @var all: [...]` - Execute action only if all conditions match
- Conditions can be variables, expressions, or command results
- Truthiness: empty strings, null, false, 0 are falsy; everything else is truthy

### Iteration (foreach)
- `@data result = foreach @command(@array)` - Apply command to each element
- `@data result = foreach @template(@array)` - Apply template to each element
- Multiple arrays create cartesian product: `foreach @cmd(@arr1, @arr2)`
- Works with parameterized `@exec` commands or `@text` templates
- Results are always arrays matching the iteration count
- Parameter count must match array count: `@exec process(a, b)` requires 2 arrays

### Module System (mlld Modules)
- Install: `mlld install @author/module` or `mlld install` (from lock file)
- List: `mlld ls` shows installed modules with metadata
- Import: `@import { funcName } from @author/module` (no quotes!)
- Modules are cached locally in `.mlld-cache/`
- Lock file: `mlld.lock.json` ensures reproducible installs
- Publishing: See `docs/registering-modules.md`

### Environment Variables
- Manage allowed env vars: `mlld env allow GITHUB_TOKEN NODE_ENV`
- List allowed vars: `mlld env list` 
- Remove access: `mlld env remove GITHUB_TOKEN`
- Stored in `mlld.lock.json` under `security.allowedEnv`
- Import in files: `@import { GITHUB_TOKEN } from @INPUT`
- Fail-fast: mlld validates required vars exist at startup

### With Clauses (when merged from feature branch)
- Transform output: `@run [cmd] with { pipeline: [@transform1, @transform2] }`
- Validate dependencies: `@run [cmd] with { needs: { file: "config.json" } }`
- Each pipeline stage receives previous output as `@input`
- Can combine pipeline and needs in same with clause
- Works with both `@run` and `@exec` directives

## Key File Locations
- **Grammar**: `grammar/mlld.peggy` (main), `grammar/directives/` (modular patterns)
- **Interpreter**: `interpreter/core/interpreter.ts` (main), `interpreter/eval/` (directive evaluators)
  - `interpreter/eval/when.ts` - Conditional logic implementation
  - `interpreter/eval/data.ts` - Handles foreach operations
  - `interpreter/eval/lazy-eval.ts` - Lazy evaluation for foreach/when
- **Registry**: `core/registry/` - Module system implementation
- **Error Classes**: `core/errors/` (definitions), see `docs/dev/ERRORS.md` for system overview
- **Tests**: `tests/cases/` (markdown examples), `tests/fixtures/` (generated), `interpreter/interpreter.fixture.test.ts` (runner)
- **CLI**: `cli/index.ts` (entry point), `api/index.ts` (programmatic interface)
  - `cli/commands/install.ts` - Module installation
  - `cli/commands/ls.ts` - Module listing
- **Examples**: `examples/` (real-world usage patterns and integration tests)

## Compacting
When compacting for the next session--*especially* mid-task, your emphasis should be on *removing* unnecessary context which does not advance the current priority. Claude needs surgically assembled context. Be sure to avoid including unnecessary details summarizing the past conversation when it will have no clear benefit to the next Claude to pick up where you left off. Make your summary a clear mission briefing. Ask yourself "What would I need to know if I was picking this work up fresh with no context?" There may be documents or files worth referencing. Present the information in an organized and structured fashion. This is for LLM consumption, so don't hesitate to use XML in order to make it well organized and clear for Claude.

## Coding Practices
- Don't add comments saying something is being removed or changed -- keep comments timeless
- **No branding in commits/PRs**: Do NOT add "🤖 Generated with Claude Code" or "Co-Authored-By: Claude" to commits or PRs. These add no value and are just annoying metrics/branding. Keep commits clean and professional.

## Development Workflows
- **Local Testing**: To test mlld locally with custom command names:
  - `npm run reinstall` - installs as `mlld-<current-git-branch>` (e.g., `mlld-rc`, `mlld-main`)
  - `npm run reinstall -- myname` - installs as `mlld-myname` 
  - `npm run reinstall:clean` - removes ALL `mlld-*` commands
  - `npm run reinstall:clean -- myname` - removes only `mlld-myname`
  - These commands create symlinks in your global npm bin directory, so you can run multiple versions side-by-side

## llms.txt Editing Rules

The `llms.txt` file serves as the authoritative onboarding guide for LLMs learning mlld. It must be accurate, complete, and verified against the actual implementation.

### Editing Guidelines:
1. **Verify Before Editing**: Every syntax example and claim must be verified against:
   - Grammar files in `grammar/` (source of truth for syntax)
   - Test cases in `tests/cases/` (examples of valid/invalid syntax)
   - Interpreter code in `interpreter/` (implementation details)
   - Documentation in `docs/` (user-facing explanations)

2. **Confidence Threshold**: Only make edits when >95% confident in accuracy:
   - 100%: Verified in grammar + tests + working examples
   - 95%: Clear in code + documentation
   - <95%: Needs more investigation - file GitHub issue instead

3. **Example Accuracy**: All code examples must:
   - Parse successfully according to the grammar
   - Execute as described
   - Demonstrate best practices
   - Include both ❌ wrong and ✅ correct versions where helpful

4. **Completeness**: Cover common LLM mistakes and misconceptions:
   - mlld is NOT a template language
   - Context-specific variable syntax
   - Module-first philosophy for complexity

5. **Maintenance**: When mlld syntax evolves:
   - Update examples to match current syntax
   - Note deprecated patterns explicitly
   - Test all examples before committing
