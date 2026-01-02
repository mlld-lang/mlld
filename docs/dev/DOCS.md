---
updated: 2026-01-02
tags: #docs, #meta
related-docs: docs/dev/DOCS-DEV.md, docs/dev/DOCS-USER.md, docs/dev/DOCS-LLM.md
---

# Documentation

## tldr

When updating docs, ensure coverage for all audiences. "Update the docs" means checking all three: dev, user, LLM.

## Audiences

| Audience | Location | Guide |
|----------|----------|-------|
| Developers | `docs/dev/` | [DOCS-DEV.md](DOCS-DEV.md) |
| Users | `docs/user/` → website | [DOCS-USER.md](DOCS-USER.md) |
| LLMs | `docs/llm/` → llms.txt | [DOCS-LLM.md](DOCS-LLM.md) |

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
    - Syntax, directives, patterns → docs/llm/
    - See DOCS-LLM.md for style
    - Regenerate: mlld run llmstxt
```

## Build Commands

```bash
# Website (from docs/user/)
cd website && npm run build

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
- **LLM docs**: strict mode examples, pseudo-XML structure, modular files
