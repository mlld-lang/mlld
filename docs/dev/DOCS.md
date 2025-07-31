---
updated: 2025-07-28
tags: #docs, #style
related-docs: docs/*.md, docs/slash/*.md, docs/dev/*.md
---

# Documentation

## tldr

Use this guide to writing both developer-facing and user-facing docs for mlld

## Principles

- Dev-facing docs in ALL CAPS. User-facing docs in lowercase (except README.md files which are always capitalized)
- Use unix `man` pages voice.
- In user-facing docs: show, don't tell: focus on examples. In dev-facing docs, skip examples: they're just hidden code to maintain.
- Be terse and extremely pragmatic about what is included based on what will be useful and relevant for the specific audience. 
- Simple pointers are much better than exhaustive explanations. 
- Respect others' context windows and cognitive load. Add nothing that isn't *critical* or fundamental. No empty-value bulleted lists.
- No backwards-looking "this used to do x, now it does y". No future promises. Docs reflect the present. Not the future or the past.
- No marketingese or self-congratulatory editorializing.
- In dev-facing docs, crystallize key learnings from debugging sessions. Add details to GitHub issues and reference those rather than filling up the codebase with debug lore.

## Details

### Structure

- README.md - Main entrypoint from GitHub and npm
- @llms.txt - Terse LLM explanation of mlld and current syntax
- docs/ - User-facing website docs
- docs/slash/ - Detailed guide to each mlld directive
- docs/dev/ - Developer facing architectural docs

### Template for dev-facing docs

The more closely we adhere to this structure the more useful mlld will be able to be in assembling context programmatically. 

```md
---
updated: YYYY-MM-DD
tags: #arch, #interpreter
related-docs: docs/filename.md, docs/otherfile.md, docs/dev/FILE.md
related-code: interpreter/eval/*.ts, security/something.ts
related-types: core/types { Type, OtherType }
---

# Document Name

## tldr

One paragraph or ~5 bullets max. What is this and when do I care? If it's user-facing, is there a way to understand 80% of it in one quick commented example in under 8 lines?

## Principles

- Single-pass evaluation (no separate resolution phase)
- Evaluators are autonomous (no orchestration layer)
- Fail fast with specific errors (MlldDirectiveError)

## Details

- Key components/concepts
- Entry points: `interpreter/eval/index.ts`

## Gotchas (optional)

- NEVER call evaluate() without Environment
- File paths must be absolute in production

## Debugging (optional)

Key algorithms, critical dependencies, debugging approach.

```

## Template for user-facing docs

No template. 

Frontmatter is not used in user-facing docs. 

User-facing docs should have a ## tldr and the rest of the doc should be an inverted pyramid organized by ipmortance.