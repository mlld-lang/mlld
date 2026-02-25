---
updated: 2026-02-25
tags: #docs, #cli, #atoms, #howto
related-docs: docs/dev/DOCS.md, docs/dev/DOCS-LLM.md
---

# CLI Documentation (Howto Pattern)

## Overview

The "howto pattern" is a documentation architecture that enables **self-documenting CLI tools for LLMs**. Instead of maintaining separate documentation for humans and LLMs, this pattern uses atomic documentation units that can be assembled into different outputs via scripting.

This pattern was developed for mlld and is designed to be adopted by other tools.

## Core Principles

1. **Atoms**: Small, self-contained markdown files, each covering ONE concept
2. **Frontmatter**: Metadata enables navigation and assembly
3. **Assembly via scripting**: Build different doc outputs from the same atoms
4. **CLI integration**: `mlld howto <topic>` delivers context directly to LLMs

## Directory Structure

```
project/
├── docs/
│   └── src/
│       └── atoms/           # SOURCE OF TRUTH (filesystem = hierarchy)
│           ├── intro.md     # Root quickstart
│           ├── core/        # NN-parent--child.md convention
│           │   ├── _index.md
│           │   ├── 01-variables--basics.md
│           │   ├── 02-variables--conditional.md
│           │   └── 27-comments.md
│           ├── flow-control/
│           │   ├── _index.md
│           │   ├── 01-if.md
│           │   └── 02-when--basics.md
│           └── ...          # cli, config, effects, mcp, modules, output, patterns, sdk, security
├── llm/
│   └── run/
│       └── howto.mld        # CLI entrypoint
└── cli/
    └── commands/
        └── howto.ts         # CLI command implementation
```

### Filesystem Conventions

- `_index.md` — section intro, always sorted first
- `NN-name.md` — standalone atom (numbered for ordering)
- `NN-parent--child.md` — grouped under parent heading
- `NN-parent--basics.md` — first child; heading skipped, content flows under parent
- Unnumbered files sort alphabetically after numbered items

## Atom Format

Each atom is a markdown file with YAML frontmatter:

```markdown
---
id: when-inline
title: When Match Form
brief: Pattern matching with optional colon syntax
category: flow-control
parent: when
tags: [conditionals, branching]
related: [when, when-blocks]
related-code: [interpreter/eval/when.ts]
updated: 2026-01-05
---

`when` stops at the first matching condition, like a switch statement.

\```mlld
when [
  @role == "admin" => show "Admin panel"
  @role == "user"  => show "User dashboard"
  * => show "Guest view"
]
\```

The `*` wildcard catches all unmatched cases.
```

### Frontmatter Schema

- **id** (required): Unique identifier (kebab-case)
- **title** (required): Human-readable title
- **brief** (required): One-line summary
- **category** (required): Section directory name (core, flow-control, effects, etc.)
- **parent** (optional): Parent group from filename `--` convention (when, for, exe, etc.)
- **aliases** (optional): Array of alternate lookup names (e.g., `[sh, cmd]` for run-basics)
- **tags** (optional): Array of tags for cross-referencing
- **related** (optional): Array of related atom IDs
- **related-code** (optional): Array of relevant source file paths
- **updated** (required): Last update date (YYYY-MM-DD)

### Atom Guidelines

1. **Self-contained**: Each atom should be understandable on its own
2. **No forward references**: Don't reference "below" or "above"
3. **Examples first**: Show code before explaining it
4. **Brief is key**: The one-line summary appears in tree views
5. **Strict mode only**: All code examples use bare directives (no `/` prefix)

## CLI Integration

### The `howto.mld` Script

The entrypoint script at `llm/run/howto.mld`:

```mlld
>> Load atoms from all sections
var @coreAtoms = <@root/docs/src/atoms/core/*.md>
var @flowControlAtoms = <@root/docs/src/atoms/flow-control/*.md>
>> ... (one var per section)

>> Bundle for tree display
var @allAtoms = @bundleAtoms(@coreAtoms, @flowControlAtoms, ...)
var @flatAtoms = @flattenAtoms(@allAtoms)

>> Get topic from payload (injected by CLI)
import { @topic, @subtopic, @section, @all } from @payload

>> Section lookup uses filesystem-derived bundles (not frontmatter category)
var @sectionAtoms = @getSectionAtoms(@allAtoms, @topic)

>> Route to appropriate output
when [
  @isGrep => show @grepAtoms(@allFlatAtoms, @subtopic)
  @isSectionTopic && !@wantAll => show @buildSectionIndex(@sectionAtoms, @topic)
  @hasTopic && @topicMatches.length > 0 => show @joinStripped(@topicMatches)
  * => show @buildTree(@allAtoms, @introAtom)
]
```

### The CLI Command

Implement a command that executes the howto script with topic/subtopic as payload:

```typescript
// cli/commands/howto.ts
import { execute } from '@sdk/execute';

export async function howtoCommand(options: { topic?: string; subtopic?: string }) {
  const result = await execute('llm/run/howto.mld', {
    topic: options.topic || '',
    subtopic: options.subtopic || ''
  });

  // Output is already printed by the script's show directives
}
```

Register in your CLI dispatcher:

```typescript
this.commandMap.set('howto', createHowtoCommand());
this.commandMap.set('ht', createHowtoCommand()); // Alias
```

Add to `commandsWithSubcommands` array in argument parser:

```typescript
private readonly commandsWithSubcommands = [
  // ... other commands ...
  'howto', 'ht'
];
```

## Usage Examples

### Show topic tree

```bash
$ mlld howto

MLLD HELP TOPICS

  intro                    What mlld is, mental model, and key concepts

core                              (--all for full content)
  variables-basics         Create primitives, arrays, objects
  templates-basics         String interpolation with backticks
  exe-simple               Define reusable commands, code, and templates
  ...

flow-control                      (--all for full content)
  if                       Imperative branching with optional else
  when                     Select the first matching branch
  for-parallel             Concurrent iteration
  ...
```

### Show section index

```bash
$ mlld howto core

Variables, templates, file loading, executables...

---

CORE TOPICS

  variables-basics         Create primitives, arrays, objects
  templates-basics         String interpolation with backticks
  ...
```

### Show specific topic

```bash
$ mlld howto when

**When block** (first match wins):
...
```

## Building LLM Docs

The build script `llm/run/llmstxt.mld` globs each section directory, sorts files by the naming convention, groups by `--` parent, and wraps in pseudo-XML tags:

```bash
mlld run llmstxt
```

The filesystem conventions handle ordering and grouping automatically — no config files needed. See [DOCS-LLM.md](DOCS-LLM.md) for the full build system.

This gives you:
1. Atoms as the single source of truth
2. Three output formats from the same atoms (website, CLI help, llms.txt)
3. Consistency across all documentation

## Package Distribution

Include in your package.json:

```json
{
  "files": [
    "dist/",
    "llm/run/howto.mld",
    "docs/src/atoms/"
  ]
}
```

This ensures the howto system ships with your package.

## Benefits

1. **DRY**: Write documentation once, use everywhere
2. **LLM-friendly**: `mlld howto <topic>` gives LLMs exactly what they need
3. **Self-documenting**: Users (and LLMs) can explore your tool's features
4. **Maintainable**: Update one atom, all outputs get the change
5. **Testable**: Diff built output against expected to catch doc drift
6. **Portable**: Other tools can adopt this pattern

## Adoption Checklist

- [ ] Create `docs/src/atoms/` directory structure
- [ ] Write atoms with frontmatter for each feature
- [ ] Create `llm/run/howto.mld` script
- [ ] Implement `howto` CLI command
- [ ] Add to `commandsWithSubcommands` in argument parser
- [ ] Include atoms in package.json `files` array
- [ ] Create build scripts for llm docs
- [ ] Test: `<tool> howto`, `<tool> howto <topic>`, `<tool> howto <topic> <subtopic>`

## Related Patterns

- **Fray notes**: Session-specific context curation
- **tk**: Task management CLI
- **PPP/QTTD**: Planning document formats

The howto pattern complements these by providing **static, canonical documentation** that persists across sessions.

## Example: Adopting in Your Tool

If you're building a CLI tool called `mytool`:

1. Create `docs/src/atoms/` with your feature atoms
2. Copy `llm/run/howto.mld` and adjust paths
3. Implement `mytool howto` command following the pattern above
4. Build your llm docs from atoms

Now LLMs can run `mytool howto <feature>` to learn about your tool!

## Metadata Automation

The mlld project includes a git pre-commit hook that automatically updates the `updated` field in atom frontmatter when atoms are modified and staged. The hook is integrated with the pre-commit hook at `.git/hooks/pre-commit`.

Key features:
- Detects staged markdown files in `docs/src/atoms/`
- Excludes `_index.md` files (category indexes)
- Updates `updated: YYYY-MM-DD` to today's date
- Automatically stages the updated file
- Uses macOS-compatible `sed -i.bak` syntax

This ensures atoms always have accurate update dates without manual intervention.

For other projects adopting this pattern, see the atom date updating section in `.git/hooks/pre-commit` for the implementation.
