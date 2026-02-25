---
updated: 2026-02-25
tags: #docs, #meta
related-docs: docs/dev/DOCS-DEV.md, docs/dev/DOCS-LLM.md, docs/dev/DOCS-CLI.md
---

# Documentation

## tldr

All reference docs come from **atoms** (`docs/src/atoms/`). Article-style conceptual docs live in **explainers** (`docs/src/explainers/`). Both feed into the website, `mlld howto`, and `docs/llm/`. The **filesystem is the source of truth** — no config files for ordering or grouping.

## Content Types

| Type | Location | Purpose |
|------|----------|---------|
| **Atoms** | `docs/src/atoms/` | Reference: "how does X work?" One concept per file, code-first |
| **Explainers** | `docs/src/explainers/` | Conceptual: "why does X work this way?" Article-style narrative |
| **Examples** | `docs/src/examples/` (planned) | Applied: complete working projects showing features in composition |

## Delivery Channels

| Channel | Access Pattern | Source |
|---------|---------------|--------|
| `mlld howto <topic>` | CLI, interactive | Atoms (keyword search across id, tags, title, brief) |
| Website | Browser | Atoms + explainers, organized by section |
| `llms.txt` | Web, token-efficient | Curated entry point for LLMs without CLI access |
| `llms-combined.txt` | Web, comprehensive | All atoms assembled |
| `docs/dev/` | Developer reference | Architecture, internals |

## Guides

| Guide | Covers |
|-------|--------|
| [DOCS-DEV.md](DOCS-DEV.md) | Developer documentation style |
| [DOCS-LLM.md](DOCS-LLM.md) | LLM docs build system (atoms → llms.txt) |
| [DOCS-CLI.md](DOCS-CLI.md) | Howto pattern, atom format, CLI integration |

## When to Update What

| Change Type | Dev Docs | User Docs | LLM Docs |
|-------------|----------|-----------|----------|
| Architecture change | Y | - | - |
| New directive/feature | Y | Y | Y |
| New SDK method | Y | Y | Y |
| Bug fix | - | - | - |
| Behavior change | Maybe | Y | Y |
| Performance optimization | Y | - | - |
| Internal refactor | Maybe | - | - |

## Checklist

After making changes, run through this:

```
[ ] Dev docs needed?
    - Architecture, internals, gotchas → docs/dev/
    - See DOCS-DEV.md for style

[ ] User docs needed?
    - User-facing features → update atoms in docs/src/atoms/
    - Rebuild website: cd website && npm run build
    - See DOCS-CLI.md for atom format

[ ] LLM docs needed?
    - Update atoms in docs/src/atoms/<section>/
    - Rebuild: mlld run llmstxt
    - See DOCS-LLM.md for details
```

## Build Commands

```bash
# Website
cd website && npm run build

# LLM docs from atoms
mlld run llmstxt

# Test howto
mlld howto <topic>
```

## Atom System

LLM docs are built from atoms in `docs/src/atoms/`. See [DOCS-CLI.md](DOCS-CLI.md) for the full pattern.

```
docs/src/atoms/             # Source of truth (~143 atoms + intro)
├── intro.md                # LLM quickstart
├── cli/         (7)        # CLI invocation, validation, checkpoint
├── config/      (14)       # Config files, policy, env blocks, auth
├── core/        (30)       # Variables, templates, file loading, exe, run, builtins
├── effects/     (18)       # Pipelines, labels, guards, hooks
├── flow-control/(21)       # if, when, for, foreach, while, loop, bail
├── mcp/         (5)        # MCP export, import, tool collections
├── modules/     (21)       # Import/export, registry, publishing
├── output/      (4)        # output, log, append, stream
├── patterns/    (3)        # Prose, ralph, guarded tool export
├── sdk/         (7)        # Execution modes, state, analysis
└── security/    (13)       # Signing, MCP security, audit log

docs/llm/                   # Generated output (don't edit directly)
├── llms-core.txt           # core atoms
├── llms-flow-control.txt   # flow-control atoms
├── llms-effects.txt        # effects atoms
├── ...                     # one file per section
└── llms-cookbook.txt        # Annotated examples
```

### Filesystem Conventions

Ordering and grouping come from filenames:

- `_index.md` — section intro (always first)
- `NN-name.md` — standalone atom, sorted numerically
- `NN-parent--child.md` — grouped under parent heading
- `NN-parent--basics.md` — first child; basics heading is skipped (content flows under parent)

CLI: `mlld howto <topic> [subtopic]` shows atoms directly.

## Automated Doc Testing

All mlld code blocks in documentation are automatically extracted and syntax-validated during `npm run build:fixtures`.

**How it works:**
1. `scripts/extract-doc-tests.mjs` extracts code blocks tagged with ` ```mlld ` or ` ```mlld:md `
2. Each block becomes a test case in `tests/cases/docs/<docname>/<block-number>/`
3. Tests validate syntax (parse without errors) but don't execute
4. Test errors show source file + line number for quick fixes

**When tests fail:**
```
Source: From introduction.md line 436: Autonomous loops (strict mode)
Fix the original documentation file, then run: npm run build:fixtures
```

Fix the original doc file, not the generated test. Then rebuild fixtures.

**Skipping invalid examples:** Place a `skip.md` file in the test case directory for intentionally invalid syntax (educational examples showing errors).

## QA Testing (qa_tier)

Atoms can be tagged for automated QA testing via the `qa_tier` frontmatter field:

```yaml
---
id: variables-basics
qa_tier: 1
---
```

| Tier | Description | Count |
|------|-------------|-------|
| 1 | Core syntax - isolated, fast | ~15 |
| 2 | Commands, control flow - needs context | ~22 |
| 3 | Integration, patterns - complex setup | (future) |
| absent | Skip - meta docs, SDK config | - |

**Run QA tests:**
```bash
mlld run qa --tier 1           # Core syntax only
mlld run qa --tier 1,2         # Tier 1 and 2
mlld run qa --topic variables  # Filter by prefix
```

**When adding new atoms:** Add `qa_tier: 1` or `qa_tier: 2` if the atom documents testable mlld syntax. Omit for meta/config docs.

## Principles (All Docs)

- **Present tense only** - No "this used to..." or "will soon..."
- **No marketing** - Skip buzzwords and self-congratulation
- **Terse** - Pointers beat prose; respect cognitive load
- **Tested examples** - Every code block must be runnable

## Quick Reference

- **Dev docs**: ALL CAPS filenames, architecture focus, no examples
- **User docs**: lowercase filenames, example-first, show output
- **LLM docs**: atom-based source, build scripts assemble, pseudo-XML output
