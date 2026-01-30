# The Howto Pattern: Self-Documenting Help for LLMs

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
│   ├── src/
│   │   └── atoms/           # SOURCE OF TRUTH
│   │       ├── category-a/
│   │       │   ├── _index.md
│   │       │   ├── topic-1.md
│   │       │   ├── topic-2.md
│   │       │   └── subtopic-a.md
│   │       └── category-b/
│   │           └── ...
│   ├── build/               # Build scripts
│   │   ├── howto/
│   │   │   ├── topic-1.mld
│   │   │   └── topic-2.mld
│   │   └── llm/
│   │       └── combined.mld
│   └── templates/           # Output format templates
│       ├── llm.att
│       └── howto.att
├── llm/
│   └── run/
│       └── howto.mld        # CLI entrypoint
└── cli/
    └── commands/
        └── howto.ts         # CLI command implementation
```

## Atom Format

Each atom is a markdown file with YAML frontmatter:

```markdown
---
id: when-first
title: When First (Switch-Style)
brief: Stops at first matching condition
category: control-flow
parent: when
tags: [conditionals, branching]
related: [when-simple, when-bare]
related-code: [interpreter/eval/when.ts]
updated: 2026-01-05
---

## When First

`when first` stops at the first matching condition, like a switch statement.

\```mlld
when first [
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
- **category** (required): Top-level category
- **parent** (optional): Parent topic ID for hierarchical grouping
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
>> Load all atoms
var @atoms = <@base/docs/src/atoms/**/*.md>

>> Get topic/subtopic from payload (injected by CLI)
import { @topic, @subtopic } from @payload

>> Filter atoms by topic or subtopic
var @matches = @filterByTopic(@atoms, @topic, @subtopic)

>> Output the appropriate help
when first [
  @subtopic => show @joinStripped(@exactMatches(@atoms, @fullId))
  @topic => show @joinStripped(@topicMatches(@atoms, @topic))
  * => show @buildTree(@atoms)
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

control-flow/
  when                     Conditionals (simple, bare, first)
  for                      Iteration (arrow, block, parallel)
  foreach                  Transform collections
  while                    Bounded loops

Use: mlld howto <topic> for details
```

### Show topic help

```bash
$ mlld howto when

## When Simple
...

## When Bare
...

## When First
...
```

### Show specific subtopic

```bash
$ mlld howto when first

## When First (Switch-Style)

`when first` stops at the first matching condition...
```

## Building LLM Docs

Create build scripts that assemble atoms into llm docs:

```mlld
>> docs/build/llm/control-flow.mld

var @whenAtoms = [
  <@base/docs/src/atoms/control-flow/when-simple.md>,
  <@base/docs/src/atoms/control-flow/when-bare.md>,
  <@base/docs/src/atoms/control-flow/when-first.md>
]

var @content = for @a in @whenAtoms => @strip(@a)

show `<WHEN_DECISIONS>
\`when\` handles conditionals. Three forms: simple, bare, first.

@content.join("\n\n")
</WHEN_DECISIONS>`
```

This lets you:
1. Keep atoms as the source of truth
2. Build different output formats (llms.txt, website, CLI help)
3. Ensure consistency across all documentation

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
