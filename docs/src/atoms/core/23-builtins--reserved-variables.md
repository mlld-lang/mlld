---
id: builtins-reserved-variables
qa_tier: 1
title: Reserved Variables
brief: Built-in system variables (@root, @now, @fm, @mx, etc.)
category: core
parent: builtins
tags: [builtins, variables, reserved, system]
related: [variables-basics, file-loading-frontmatter, builtins-transformers]
related-code: [interpreter/env/Environment.ts, core/reserved-vars.ts]
updated: 2026-03-24
---

- `@root` / `@base` - project root path
- `@now` - current ISO timestamp
- `@input` - stdin/env (must be allowed in config)
- `@state` - mutable state for SDK integrations
- `@debug` - environment info
- `@fm` - current file's frontmatter (in modules)
- `@mx` - metadata accessor (labels, taint, attestations, guard context)

`@root`/`@base` resolution algorithm:

1. Start at the current file directory and walk upward.
2. Check mlld markers first (in order):
   - `mlld-config.json`
   - `mlld-lock.json`
   - `mlld.lock.json`
3. If none are found, check fallback project markers:
   - `package.json`
   - `.git`
   - `pyproject.toml`
   - `Cargo.toml`
4. The first directory containing any marker becomes `@root` (`@base` is an alias).

Built-in transformer/helper names are available for `var`/`let` declarations and are shadowable per scope:
- `@exists`, `@fileExists`, `@typeof`
- `@parse`, `@json` (deprecated alias), `@xml`, `@csv`, `@md`
- `@upper`, `@lower`, `@trim`, `@pretty`, `@sort`
- `@keep`, `@keepStructured`

`mlld validate` reports builtin shadowing as informational output.
