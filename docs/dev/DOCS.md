---
updated: 2026-01-05
tags: #docs, #meta
related-docs: docs/dev/DOCS-DEV.md, docs/dev/DOCS-USER.md, docs/dev/DOCS-LLM.md, docs/dev/HOWTO-PATTERN.md
---

# Documentation

## tldr

When updating docs, ensure coverage for all audiences. "Update the docs" means checking all three: dev, user, LLM.

LLM docs use an atom-based system - update atoms in `docs/src/atoms/`, not the final `docs/llm/*.txt` files directly. See [HOWTO-PATTERN.md](HOWTO-PATTERN.md) for the full pattern.

## Audiences

| Audience | Location | Guide |
|----------|----------|-------|
| Developers | `docs/dev/` | [DOCS-DEV.md](DOCS-DEV.md) |
| Users | `docs/user/` → website | [DOCS-USER.md](DOCS-USER.md) |
| LLMs | `docs/src/atoms/` → `docs/llm/` | [DOCS-LLM.md](DOCS-LLM.md) |

## When to Update What

| Change Type | Dev Docs | User Docs | LLM Docs |
|-------------|----------|-----------|----------|
| Architecture change | ✅ | ❌ | ❌ |
| New directive/feature | ✅ | ✅ | ✅ |
| New SDK method | ✅ | ✅ | ✅ |
| Bug fix | ❌ | ❌ | ❌ |
| Behavior change | Maybe | ✅ | ✅ |
| Performance optimization | ✅ | ❌ | ❌ |
| Internal refactor | Maybe | ❌ | ❌ |

## Checklist

After making changes, run through this:

```
[ ] Dev docs needed?
    - Architecture, internals, gotchas → docs/dev/
    - See DOCS-DEV.md for style

[ ] User docs needed?
    - User-facing features → docs/user/
    - See DOCS-USER.md for style
    - Rebuild website: cd website && npm run build

[ ] LLM docs needed?
    - Update atoms in docs/src/atoms/<category>/
    - Rebuild: run build script in docs/build/llm/
    - Regenerate combined: mlld run llmstxt
    - See DOCS-LLM.md for details
```

## Build Commands

```bash
# Website (from docs/user/)
cd website && npm run build

# LLM docs from atoms (rebuild individual module)
./dist/cli.cjs docs/build/llm/syntax.mld > docs/llm/llms-syntax.txt

# LLM combined docs
mlld run llmstxt
```

## Principles (All Docs)

- **Present tense only** - No "this used to..." or "will soon..."
- **No marketing** - Skip buzzwords and self-congratulation
- **Terse** - Pointers beat prose; respect cognitive load
- **Tested examples** - Every code block must be runnable

## Quick Reference

- **Dev docs**: ALL CAPS filenames, architecture focus, no examples
- **User docs**: lowercase filenames, example-first, show output
- **LLM docs**: atom-based source, build scripts assemble, pseudo-XML output

## Atom System

LLM docs are built from atoms in `docs/src/atoms/`. See [HOWTO-PATTERN.md](HOWTO-PATTERN.md) for the full pattern.

```
docs/src/atoms/           # Source of truth (104 atoms)
  ├── syntax/             # Variables, templates, file loading, pipelines
  ├── commands/           # run, exe, output, log, append, stream
  ├── control-flow/       # when, for, foreach, while
  ├── modules/            # Import, export, registry
  ├── patterns/           # Common workflows
  ├── security/           # Guards, labels
  ├── configuration/      # SDK modes, env vars
  └── mistakes/           # Common errors

docs/build/llm/           # Build scripts (one per module)
  ├── syntax.mld
  ├── commands.mld
  └── ...

docs/llm/                 # Generated output (don't edit directly)
  ├── llms-syntax.txt
  ├── llms-commands.txt
  └── ...
```

CLI: `mlld howto <topic> [subtopic]` shows atoms directly.
