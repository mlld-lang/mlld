---
updated: 2026-02-25
tags: #docs, #llm, #llms-txt, #atoms
related-docs: docs/dev/DOCS.md, docs/dev/DOCS-DEV.md, docs/dev/DOCS-CLI.md
related-code: llms.txt, docs/llm/, docs/src/atoms/, llm/run/llmstxt.mld
---

# llms.txt Maintenance Guide

## tldr

LLM docs are built from **atoms** (atomic markdown files in `docs/src/atoms/`). The **filesystem is the source of truth** — directory structure encodes hierarchy and ordering. A build script (`llm/run/llmstxt.mld`) assembles atoms into `docs/llm/*.txt` module files. Don't edit `docs/llm/` directly — update atoms, run `mlld run llmstxt`.

All examples use **strict mode** (bare directives).

## File Structure

```
docs/src/atoms/             # SOURCE OF TRUTH
├── intro.md                # LLM quickstart, powers `mlld qs`
├── cli/                    # CLI invocation, validation, checkpoint, live-stdio
├── config/                 # Config files, env vars, policy, env blocks, auth
├── core/                   # Variables, templates, file loading, exe, run, builtins, escaping
├── effects/                # Pipelines, labels, guards, hooks
├── flow-control/           # if, when, for, foreach, while, loop, bail
├── mcp/                    # MCP export, import, tool collections, reshaping
├── modules/                # Import/export, registry, publishing, versioning
├── output/                 # output, log, append, stream
├── patterns/               # Prose, ralph, guarded tool export
├── sdk/                    # Execution modes, state, dynamic modules, analysis
└── security/               # Signing, MCP security, profiles, needs, audit log

docs/llm/                   # GENERATED OUTPUT (don't edit directly)
├── llms-overview.txt       # Purpose, mental model, two syntax modes
├── llms-core-rules.txt     # The 13 core rules
├── llms-core.txt           # Variables, templates, file loading, exe, run, builtins
├── llms-flow-control.txt   # if, when, for, foreach, while, loop
├── llms-effects.txt        # Pipelines, labels, guards, hooks
├── llms-modules.txt        # Import/export, registry
├── llms-mcp.txt            # MCP integration
├── llms-output.txt         # output, log, append, stream
├── llms-patterns.txt       # Common workflow patterns
├── llms-cli.txt            # CLI usage, checkpoint, validation
├── llms-config.txt         # Configuration, policy, environments
├── llms-sdk.txt            # SDK execution modes, state, analysis
├── llms-security.txt       # Signing, MCP security, audit log
├── llms-reference.txt      # Quick reference tables
└── llms-cookbook.txt        # Annotated real-world examples

llms.txt                    # Brief entry point with TOC + essential patterns
llms-combined.txt           # Generated: all modules concatenated

llm/run/llmstxt.mld         # Build script: globs atom dirs, builds all modules
```

### Filesystem Conventions

Atom ordering and grouping come from filenames, not config files:

- `_index.md` — section intro, always first
- `NN-name.md` — standalone atom (gets its own `<TAG>`)
- `NN-parent--child.md` — grouped under `<PARENT>` tag with siblings
- `NN-parent--basics.md` — first child; content flows directly under parent (no separate heading)
- Numbered files sort numerically, unnumbered sort alphabetically after numbered

### When to Use Each

| File | Use Case |
|------|----------|
| `docs/src/atoms/` | Editing content (source of truth) |
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

\```mlld
var @example = "code"
\```

</MLLD_SECTION_NAME>
```

**Tag naming:** `ALL_CAPS_UNDERSCORES` for clear visual distinction

**Detection rule:** Only `<...>` containing `.`, `/`, `*`, or `@` are treated as file references. XML-like `<TAG>` is safe as plain text.

## Module Organization

### llms-overview.txt
- What mlld is/isn't
- Mental model shift
- Two syntax modes explained
- Key concepts summary

### llms-core-rules.txt
The 13 fundamental rules. High bar for additions - only truly essential syntax.

### llms-core.txt
Variables, templates, file loading, exe, run, builtins, escaping:
- Variables and conditional inclusion
- Templates (backticks, `::...::`)
- File loading with globs and AST selectors
- exe (simple forms, blocks, when, shadow, prose)
- run (basics, cwd, stdin, params)
- Builtin methods and transforms
- Comments, escaping

### llms-flow-control.txt
- `if` blocks
- `when` (inline, blocks, value-returning, operators)
- `for` (arrow, block, collection, parallel, filter, skip)
- `foreach`, `loop`, `while`, `bail`

### llms-effects.txt
- Pipelines (basics, context, retry, parallel)
- Labels (sensitivity, trust, influenced, source, tracking)
- Guards (basics, composition, privileged, transform, denied)
- Hooks

### llms-mcp.txt
- MCP basics (export and import)
- Tool collections and reshaping

### llms-output.txt
- `output`, `log`, `append`, `stream`

### llms-cli.txt
- `mlld run`, `mlld file`
- Checkpoint/resume
- Validation, live-stdio, MCP dev, skills

### llms-config.txt
- Config files, environment variables, paths
- Policy (capabilities, operations, label flow, composition, auth)
- Environment blocks and auth

### llms-modules.txt
- Importing (local, namespace, directory, templates, node/python, types)
- Resolvers, lockfile, philosophy
- Creating, exporting, publishing
- Module structure and patterns

### llms-sdk.txt
- Execution modes, execute function, state
- Dynamic modules, analyze, payload, language SDKs

### llms-security.txt
- Getting started (progressive levels)
- Signing (basics, sign/verify, autosign)
- MCP security (basics, policy, guards)
- Profiles, needs, audit log
- Patterns (audit guard, airlock)

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

1. Create atom in `docs/src/atoms/<section>/NN-name.md` with frontmatter
2. Follow naming convention: `NN-parent--child.md` for grouped, `NN-name.md` for standalone
3. Rebuild: `mlld run llmstxt`
4. Verify output: check `docs/llm/llms-<section>.txt`
5. Update llms-reference.txt tables if applicable
6. Consider adding to cookbook if it composes well

### Fixing Examples

1. Find the source **atom** in `docs/src/atoms/`
2. Update with correct strict mode syntax
3. Test example parses: `npm run ast -- 'code'`
4. Rebuild: `mlld run llmstxt`

### Atom Format

Each atom has YAML frontmatter:

```markdown
---
id: when-inline
title: When Match Form
brief: Pattern matching with optional colon syntax
category: flow-control
parent: when
tags: [conditionals, branching]
related: [when-inline, when]
related-code: [interpreter/eval/when.ts]
updated: 2026-01-05
---

Content here with code examples...
```

See [DOCS-CLI.md](DOCS-CLI.md) for full atom specification.

## Build Scripts

A single mlld script (`llm/run/llmstxt.mld`) builds all LLM docs:

```bash
mlld run llmstxt     # or: npm run build:docs
```

The script:
1. Globs each section directory under `docs/src/atoms/`
2. Sorts files: `_index.md` first, then `NN-*` numerically, then unnumbered alphabetically
3. Parses `--` delimiter to determine parent-child grouping
4. Wraps in pseudo-XML tags (parent groups get `<PARENT>` tags, standalone atoms get individual tags)
5. Writes each module to `docs/llm/llms-<section>.txt`
6. Assembles all modules into `llms-combined.txt` with version and timestamp

**Module order** in combined output:
1. overview, 2. core-rules, 3. core, 4. flow-control, 5. effects, 6. modules, 7. mcp, 8. output, 9. patterns, 10. cli, 11. config, 12. sdk, 13. security, 14. reference, 15. cookbook

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
- **docs/dev/DOCS-CLI.md** - Full atom pattern specification
