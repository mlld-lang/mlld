# Atom Style Reference

## Frontmatter Schema

Required fields:
```yaml
id: kebab-case-unique-id
title: Human Readable Title
brief: One-line summary (appears in tree views)
category: syntax | commands | control-flow | modules | patterns | configuration | security | mistakes
updated: 2026-02-16
```

Optional fields:
```yaml
parent: parent-topic-id
aliases: [alt-name-1, alt-name-2]
tags: [tag1, tag2]
related: [other-atom-id-1, other-atom-id-2]
related-code: [interpreter/eval/when.ts, grammar/directives/when.peggy]
qa_tier: 1 | 2
```

- `qa_tier: 1` — core syntax, high-traffic. `qa_tier: 2` — advanced features, lower traffic.
- `related-code` paths are relative to repo root. Every path must be a real file.
- `related` references other atom `id` values, not file paths.

## Content Rules

1. **No headings** — atoms are small enough that headings add noise. Use bold text for section labels.
2. **Examples first** — show code before explaining it.
3. **Strict mode only** — all code blocks use bare directives (no `/` prefix). Fence with ` ```mlld `.
4. **`>>` for comments** — use mlld comments in code blocks, not `//` or `#`.
5. **Present tense** — "Returns the value" not "Will return the value".
6. **Self-contained** — each atom understandable on its own. No "see below" or "as mentioned above".
7. **No marketing prose** — no "powerful", "elegant", "seamless". Just describe what it does.
8. **No time references** — no "new in rc82", "recently added", "now supports".

## Size Guidelines

| Category | Target lines |
|----------|-------------|
| syntax | 20–40 |
| commands | 20–40 |
| control-flow | 40–60 |
| patterns | 20–40 |
| configuration | 40–80 |
| security | 60–100 |
| mistakes | 15–30 |

## Anti-patterns

- No `/` prefix on directives in examples (that's markdown mode)
- No `run { ... }` — use `run cmd { ... }`
- No `@var_key` iteration syntax — use `for @key, @value in @obj` or `@var.mx.key`
- No `@json` in new code — use `@parse` (the `@json` alias is deprecated)
- No headings (##) in atom content
- No emoji
