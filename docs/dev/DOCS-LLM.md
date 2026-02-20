---
updated: 2026-01-05
tags: #docs, #llm, #llms-txt, #atoms
related-docs: docs/dev/DOCS.md, docs/dev/DOCS-DEV.md, docs/dev/DOCS-USER.md, docs/dev/HOWTO-PATTERN.md
related-code: llms.txt, docs/llm/, docs/src/atoms/, docs/build/llm/, llm/run/llmstxt.mld
---

# llms.txt Maintenance Guide

## tldr

LLM docs are built from **atoms** (atomic markdown files in `docs/src/atoms/`). Build scripts in `docs/build/llm/` assemble atoms into the `docs/llm/*.txt` module files. Don't edit `docs/llm/` directly - update atoms, run build scripts.

All examples use **strict mode** (bare directives). Run `mlld run llmstxt` to regenerate `llms-combined.txt`.

## File Structure

```
docs/src/atoms/             # SOURCE OF TRUTH (104 atoms)
├── syntax/                 # Variables, templates, file loading, pipelines
├── commands/               # run, exe, output, log, append, stream
├── control-flow/           # when, for, foreach, while, parallel, skip
├── modules/                # Import/export, registry, local dev
├── patterns/               # Common workflow patterns
├── configuration/          # SDK modes, env vars, resolvers
├── security/               # Guards, labels, capabilities
└── mistakes/               # Common errors and fixes

docs/build/llm/             # Build scripts (assemble atoms → modules)
├── syntax.mld
├── commands.mld
├── control-flow.mld
├── modules.mld
├── patterns.mld
├── configuration.mld
├── security.mld
└── mistakes.mld

docs/llm/                   # GENERATED OUTPUT (don't edit directly)
├── llms-overview.txt       # Purpose, mental model, two syntax modes
├── llms-core-rules.txt     # The 13 core rules
├── llms-syntax.txt         # Built from syntax atoms
├── llms-commands.txt       # Built from commands atoms
├── llms-control-flow.txt   # Built from control-flow atoms
├── llms-modules.txt        # Built from modules atoms
├── llms-patterns.txt       # Built from patterns atoms
├── llms-configuration.txt  # Built from configuration atoms
├── llms-sdk.txt            # SDK usage, execution modes
├── llms-mistakes.txt       # Built from mistakes atoms
├── llms-security.txt       # Built from security atoms
├── llms-reference.txt      # Quick reference tables
└── llms-cookbook.txt       # Annotated real-world examples

llms.txt                    # Brief entry point with TOC + essential patterns
llms-combined.txt           # Generated: all modules concatenated

llm/run/llmstxt.mld         # Build script to generate llms-combined.txt
```

### When to Use Each

| File | Use Case |
|------|----------|
| `docs/src/atoms/` | Editing content (source of truth) |
| `docs/build/llm/*.mld` | Editing how atoms are assembled |
| `llms.txt` | Quick context, points to modules |
| `llms-combined.txt` | Full context injection for comprehensive tasks |
| Individual modules | Focused help on specific topics |
| `llms-cookbook.txt` | Learning by example, real patterns |
| `mlld howto <topic>` | CLI access to atoms |

## Principles

- **Strict mode everywhere** - All examples use bare directives (`.mld` syntax), not slash-prefixed markdown mode
- **Optimize for LLM comprehension** - Pseudo-XML tags for navigation, markdown for scannability
- **Example-driven** - Every feature needs working code
- **Modular** - Each topic standalone, can be loaded independently
- **Present tense only** - Document current syntax, not history or roadmap
- **Tested examples** - Every code block must be valid mlld syntax
- **Cookbook for composition** - Reference docs show features; cookbook shows them working together

## Strict Mode vs Markdown Mode

All documentation uses **strict mode** (bare directives):

```mlld
>> Strict mode (.mld files) - what we document
var @name = "Alice"
show `Hello @name!`

>> Markdown mode (.mld.md files) - mentioned but not used in examples
/var @name = "Alice"
/show `Hello @name!`
```

The overview module explains both modes, but examples throughout use strict mode to match what LLMs should generate for `.mld` files.

## Deprecated Syntax

**Do not use in examples:**

| Deprecated | Use Instead |
|------------|-------------|
| `run { ... }` | `run cmd { ... }` |
| `@var_key` in iteration | `for @key, @value in @obj` or `@var.mx.key` |

## The Cookbook

`llms-cookbook.txt` contains annotated real-world examples showing feature composition. Each recipe is 30-80 lines with heavy comments explaining patterns.

**Current recipes:**
1. **LLM Library** - Clean utility module (pipelines, when, cmd:dir)
2. **Gate Pattern** - Validation with blocks and structured returns
3. **Agent Definition** - Config module with frontmatter and templates
4. **Router** - Complex scoring and decision logic
5. **Orchestrator** - Parallel execution with routing

**Why a cookbook?**
LLMs learn better from composed examples than isolated feature docs. The cookbook shows how patterns combine in real code, leading to faster comprehension.

**Adding recipes:**
- Base on real working code (anonymize if needed)
- Show multiple features working together
- Heavy `>>` comments explaining the "why"
- Keep to 30-80 lines
- Include a summary of demonstrated features

## Pseudo-XML Structure

Each module uses lightweight pseudo-XML tags for LLM navigation:

```markdown
<MLLD_SECTION_NAME>

Content here with markdown formatting.

```mlld
var @example = "code"
```

</MLLD_SECTION_NAME>
```

**Tag naming:** `ALL_CAPS_UNDERSCORES` for clear visual distinction

**Detection rule:** Only `<...>` containing `.`, `/`, `*`, or `@` are treated as file references. XML-like `<TAG>` is safe as plain text.

**Gotcha:** Tags with `@` or `.` in attributes trigger file load detection. Use `:::...:::` escape hatch for XML with interpolated attributes:

```mlld
>> This fails - @ triggers file detection
var @doc = ::<GUIDE version="@version">::

>> Use triple-colon escape hatch
var @doc = :::<GUIDE version="{{version}}">:::
```

## Module Organization

### llms-overview.txt
- What mlld is/isn't
- Mental model shift
- Two syntax modes explained
- Key concepts summary

### llms-core-rules.txt
The 13 fundamental rules. High bar for additions - only truly essential syntax.

### llms-syntax.txt
Detailed syntax coverage:
- Variables and conditional inclusion
- Templates (backticks, `::...::`)
- File loading with globs and AST selectors
- `.data/.text` JSON string accessors
- Builtin methods
- Pipelines and transforms
- Comments and reserved variables

### llms-commands.txt
All command directives:
- `run cmd/sh/js` with decision tree
- `exe` with blocks and when
- `output`, `log`, `append`
- `stream`

### llms-control-flow.txt
- `when` (inline, block list, value-returning)
- `for` (arrow, block, collection, parallel)
- `skip` keyword for filtering
- `foreach`
- `loop` blocks
- `while` loops

### llms-modules.txt
- Creating modules with frontmatter
- Import types and patterns
- Exports
- Registry and local dev

### llms-patterns.txt
Common workflows:
- Tool orchestration
- Data pipelines
- Router/gate patterns
- Parallel execution
- LLM integration

### llms-configuration.txt
- Environment variables
- SDK execution modes
- Dynamic module injection
- Resolvers

### llms-mistakes.txt
Common errors with ❌/✅ patterns. Add here when you identify repeated LLM mistakes.

### llms-security.txt
- Guards and policies
- Data labels
- Automatic labels

### llms-reference.txt
Quick lookup tables:
- Execution contexts
- Directives
- Operators
- Metadata fields
- Escape hatch templates

### llms-cookbook.txt
Real-world annotated examples.

## Updating Content

### Adding a New Feature

1. Create atom in `docs/src/atoms/<category>/<feature>.md` with frontmatter
2. Add atom to build script in `docs/build/llm/<category>.mld`
3. Rebuild module: `./dist/cli.cjs docs/build/llm/<category>.mld > docs/llm/llms-<category>.txt`
4. Verify with diff: `diff docs/llm/llms-<category>.txt <original>`
5. Update llms-reference.txt tables if applicable
6. Consider adding to cookbook if it composes well
7. Regenerate combined: `mlld run llmstxt`

### Adding a Common Mistake

1. Create atom in `docs/src/atoms/mistakes/<mistake>.md`
2. Show wrong and correct patterns (no ❌/✅ emoji - plain text)
3. Add to build script: `docs/build/llm/mistakes.mld`
4. Rebuild: `./dist/cli.cjs docs/build/llm/mistakes.mld > docs/llm/llms-mistakes.txt`
5. Regenerate combined

### Fixing Examples

1. Find the source **atom** in `docs/src/atoms/`
2. Update with correct strict mode syntax
3. Test example parses: `npm run ast -- 'code'`
4. Rebuild the module: `./dist/cli.cjs docs/build/llm/<category>.mld > docs/llm/llms-<category>.txt`
5. Regenerate combined

### Atom Format

Each atom has YAML frontmatter:

```markdown
---
id: when
title: When
brief: Select the first matching branch
category: control-flow
parent: control-flow
tags: [conditionals, branching]
related: [when-inline, when]
related-code: [interpreter/eval/when.ts]
updated: 2026-01-05
---

Content here with code examples...
```

See [HOWTO-PATTERN.md](HOWTO-PATTERN.md) for full atom specification.

## Build Scripts

### Module Build Scripts

Each `docs/build/llm/<category>.mld` builds one `docs/llm/llms-<category>.txt`:

```bash
# Rebuild single module
./dist/cli.cjs docs/build/llm/syntax.mld > docs/llm/llms-syntax.txt

# Rebuild all modules (example)
for script in docs/build/llm/*.mld; do
  name=$(basename "$script" .mld)
  ./dist/cli.cjs "$script" > "docs/llm/llms-$name.txt"
done
```

Build scripts:
1. Load atoms in order from `docs/src/atoms/<category>/`
2. Strip frontmatter from each atom
3. Wrap each section in pseudo-XML tags
4. Output assembled module

### Combined Build Script

`llm/run/llmstxt.mld` generates `llms-combined.txt`:

```bash
mlld run llmstxt
```

The script:
1. Reads version from package.json
2. Loads all modules from docs/llm/ in logical order
3. Wraps in `<MLLD_COMPLETE_GUIDE>` with version and timestamp
4. Writes to llms-combined.txt

**Module order** (defined in script):
1. overview
2. core-rules
3. syntax
4. commands
5. control-flow
6. modules
7. patterns
8. configuration
9. sdk
10. mistakes
11. security
12. reference
13. cookbook

## Testing Changes

1. **Validate syntax:**
   ```bash
   npm run ast -- 'var @test = "hello"'
   ```

2. **Regenerate and check:**
   ```bash
   mlld run llmstxt
   head -20 llms-combined.txt
   ```

3. **Test with LLM:**
   - Feed relevant module
   - Ask LLM to write example code
   - Verify output uses strict mode and correct patterns

4. **Check for deprecated syntax:**
   ```bash
   grep -n "run {" docs/llm/*.txt  # should use run cmd {}
   grep -n "/var\|/show\|/for" docs/llm/*.txt  # should be bare directives
   ```

## Version Management

Update version in:
1. `llms.txt` header: `<MLLD_GUIDE version="X.Y.Z">`
2. `llms-overview.txt` header
3. Regenerate combined (picks up version from package.json)

Version should match mlld release version.

## Related Documentation

- **docs/dev/DOCS.md** - Unified documentation guide (entrypoint)
- **docs/dev/DOCS-DEV.md** - Developer-facing documentation principles
- **docs/dev/DOCS-USER.md** - User-facing documentation guide
- **docs/dev/HOWTO-PATTERN.md** - Full atom pattern specification
- **docs/user/** - Detailed user documentation
- **tests/cases/valid/feat/** - Comprehensive test cases
