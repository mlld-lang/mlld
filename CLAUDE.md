# mlld project guidelines

repo: github.com/mlld-lang/mlld

## Agents
Agents dispatched with the 'Task' tool can sometimes perform work you did not intend and the results can be counterproductive or even destructive. Please do not send agents on tasks without having a discussion with me first.

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
- **Tests**: Test cases in tests/cases written in markdown --> grammar/scripts/build-fixtures.js builds fixtures from these when running `npm run build:fixtures` or when running `build` or `build:grammar` --> tests/fixtures have complete AST and expected final output --> interpreter/interpreter.fixture.test.ts runs the tests in our fixtures, effectively creating e2e tests. when individual tests/cases need to reference files, they go in tests/cases/files
- **Test File Naming**: CRITICAL - All test files must have unique names across the entire test suite. Never use generic names like `config.mld`, `utils.mld`, or `data.json`. Instead, prefix with the test name: `import-all-config.mld`, `namespace-test-utils.mld`, etc. This prevents file collisions when tests are copied to the same virtual filesystem.
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

## CRITICAL: When the AST Seems Unclear
**When working in the interpreter, FOLLOW THE AST, and DON'T accommodate broken data structures. If you feel you're shoehorning the AST in, 
STOP! All clarity in mlld flows from our highly intentful grammar and AST.**

**Red flags that indicate AST problems, not interpreter problems:**
- Manual type checking with `typeof` and `instanceof`
- Converting between data structures (e.g., arrays to strings)
- Different handling for "similar" operations in different contexts
- Complex conditional logic to handle multiple data formats
- Adding "accommodation code" or "workaround logic"

**When you see these patterns: STOP. Investigate how to the grammar/AST first.**

## Mlld Syntax Rules

**Mlld is a scripting language embedded in Markdown documents** - it enhances Markdown with dynamic content generation while preserving the readability of the source document.

### Core Syntax Principles
1. **Directives only at start of lines** - mlld syntax is only interpreted in lines that start with a `/` directive
   - Exception: `run` can be used on RHS of `/var` and `/exe` definitions (without `@`)
   - Exception: Directives can be used in RHS of `/var` object definitions
2. **Variables are created with `@`** - `/var @name = "value"` (not `/var name`)
3. **Variables are referenced with `@`** - Use `@name` in directives and backtick templates
4. **Commands require braces or quotes** - `/run {echo "hello"}` or `/run "echo hello"`
5. **Only `/run`, `/show`, and `/output` produce output** - Other directives define or assign but don't output
6. **Markdown-first design** - Everything that isn't a directive line is treated as regular Markdown
7. **Comments use `>>`** - `>> This is a comment` at line start or `code >> comment` at line end

### Variable References
- In directives: `@variable` or `@object.field.subfield`
- In backtick templates `` `...` ``: `@variable` or `@object.field`
- In commands `{...}` or `"..."`: `@variable` interpolation works
- Plain text: `@variable` in non-directive lines is literal text, not a reference

### Templates and Interpolation
- **Primary syntax - Backtick templates**: `` `text with @var interpolation` `` - simple and clean
- **Double quotes**: `"Hello @name"` - `@` variables are interpolated in commands and some contexts
- **Single quotes**: `'Hello @name'` - No interpolation, literal text
- Field access: `@user.name` in backticks and directives

### Exe Commands
- `/exe @name(params) = run {command}` - Defines a reusable command
- `/run @name(args)` - Executes the defined command
- Parameters are referenced with `@param` inside the command definition
- Shadow environments: `/exe js = { func1, func2 }` - Makes functions available to call from JS code
  - Functions can call each other within /run js blocks
  - Supports js and node (python/sh have grammar support but pending implementation)

### Import Syntax
- File imports: `/import { var1, var2 } from "path/to/file.mld"`
- Import all: `/import { * } from "path/to/file.mld"`
- Module imports: `/import { func1, func2 } from @author/module`
- Environment variables: `/import { GITHUB_TOKEN, NODE_ENV } from @INPUT`
  - Requires variables to be listed in `mlld.lock.json` security.allowedEnv
  - mlld validates required env vars exist at startup
- Paths are relative to the importing file's directory
- Modules use @ prefix for registry modules and private resolvers (no quotes)

### Common Mistakes to Avoid
- Trying to treat mlld like a template language -- it's not; it's a scripting language embedded in markdown, so it only works for lines starting with a `/` directive
- ❌ `/run echo "hello"` → ✅ `/run {echo "hello"}` or `/run "echo hello"`
- ❌ `/var myvar = "value"` → ✅ `/var @myvar = "value"`
- ❌ `/var @result = @run {cmd}` → ✅ `/var @result = run {cmd}` (no @ before run)
- ❌ `Hello @name!` → ✅ `/show `Hello @name!`` or `/var @greeting = "Hello!"` then `/show @greeting`
- ❌ Forgetting braces or quotes in commands
- ❌ Trying to interpolate in plain text lines

### Conditional Logic (/when)
- `/when @condition => @action` - Simple one-line conditional
- `/when @condition [...]` - Execute each action for matching condition (all fire independently)
  ```
  /when @condition [
    "prod" => /show "Production"
    "dev" => /show "Development"
    _ => /show "Unknown"
  ]
  ```
- `/when @var first: [...]` - Execute first matching condition only
- `/when @var any: [...] => @action` - Execute if any condition matches
- `/when @var all: [...] => @action` - Execute only if all conditions match
- Conditions can be variables, expressions, or command results
- Truthiness: empty strings, null, false, 0 are falsy; everything else is truthy

### Iteration (foreach)
- `/var @result = foreach @command(@array)` - Apply command to each element
- `/var @result = foreach @template(@array)` - Apply template to each element
- Multiple arrays create cartesian product: `foreach @cmd(@arr1, @arr2)`
- Works with parameterized `/exe` commands or template variables
- Results are always arrays matching the iteration count
- Parameter count must match array count: `/exe @process(a, b)` requires 2 arrays

### Module System (mlld Modules)
- Install: `mlld install @author/module` or `mlld install` (from lock file)
- List: `mlld ls` shows installed modules with metadata
- Import: `/import { funcName } from @author/module` (no quotes!)
- Modules are cached locally in `.mlld-cache/`
- Lock file: `mlld.lock.json` ensures reproducible installs
- Publishing: See `docs/registering-modules.md`

### Environment Variables
- Manage allowed env vars: `mlld env allow GITHUB_TOKEN NODE_ENV`
- List allowed vars: `mlld env list` 
- Remove access: `mlld env remove GITHUB_TOKEN`
- Stored in `mlld.lock.json` under `security.allowedEnv`
- Import in files: `/import { GITHUB_TOKEN } from @INPUT`
- Fail-fast: mlld validates required vars exist at startup

### Output Directive (/output)
- File output: `/output @content to "path/to/file.txt"`
- Stream output: `/output @message to stdout` or `/output @error to stderr`
- Environment variables: `/output @value to env:MY_VAR`
- Format conversion: `/output @data to "file.json" as json`
- Conditional output: `/when @condition => /output @result to "output.txt"`

### With Clauses (when merged from feature branch)
- Transform output: `/run {cmd} with { pipeline: [@transform1, @transform2] }`
- Validate dependencies: `/run {cmd} with { needs: { file: "config.json" } }`
- Each pipeline stage receives previous output as `@input`
- Can combine pipeline and needs in same with clause
- Works with both `/run` and `/exe` directives

## Key File Locations
- **Grammar**: `grammar/mlld.peggy` (main), `grammar/directives/` (modular patterns)
- **Interpreter**: `interpreter/core/interpreter.ts` (main), `interpreter/eval/` (directive evaluators)
  - `interpreter/eval/when.ts` - Conditional logic implementation
  - `interpreter/eval/var.ts` - Variable creation (handles all types)
  - `interpreter/eval/show.ts` - Output/display implementation
  - `interpreter/eval/exe.ts` - Executable definitions
  - `interpreter/eval/lazy-eval.ts` - Lazy evaluation for foreach/when
- **Registry**: `core/registry/` - Module system implementation
- **Error Classes**: `core/errors/` (definitions), see `docs/dev/ERRORS.md` for system overview
- **Tests**: `tests/cases/` (markdown examples), `tests/fixtures/` (generated), `interpreter/interpreter.fixture.test.ts` (runner)
  - **Test File Setup**: Supporting files (not `example.md` or `expected.md`) in tests/cases directories are copied to the root of the virtual filesystem. For example, files in `tests/cases/valid/data/my-test/` are available as `/filename.md` in the test, not `./filename.md`.
- **CLI**: `cli/index.ts` (entry point), `api/index.ts` (programmatic interface)
  - `cli/commands/install.ts` - Module installation
  - `cli/commands/ls.ts` - Module listing
- **Examples**: `examples/` (real-world usage patterns and integration tests)

## Compacting
When compacting for the next session--*especially* mid-task, your emphasis should be on *removing* unnecessary context which does not advance the current priority. Claude needs surgically assembled context. Be sure to avoid including unnecessary details summarizing the past conversation when it will have no clear benefit to the next Claude to pick up where you left off. Make your summary a clear mission briefing. Ask yourself "What would I need to know if I was picking this work up fresh with no context?" There may be documents or files worth referencing. Present the information in an organized and structured fashion. This is for LLM consumption, so don't hesitate to use XML in order to make it well organized and clear.

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

## Debugging
- When adding debugging output, use `MLLD_DEBUG=true` or `--debug`
- **For debug output**: Use `if (process.env.MLLD_DEBUG === 'true') console.log()` pattern
  - This is simple, works reliably, and is used throughout the codebase
  - The winston logger has issues with dynamic level changes and is overcomplicated
- **For errors**: Use `logger.error()` - this always works correctly
