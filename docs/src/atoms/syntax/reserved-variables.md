---
id: reserved-variables
title: Reserved Variables
brief: Built-in system variables
category: syntax
parent: variables
tags: [variables, reserved, system]
related: [variables-basics, file-loading-metadata, syntax-payload]
related-code: [interpreter/env/Environment.ts, core/reserved-vars.ts]
updated: 2026-01-11
---

- `@now` - current timestamp
- `@input` - stdin/env (must be allowed in config)
- `@payload` - data passed via SDK or CLI (see payload atom)
- `@state` - mutable state for SDK integrations
- `@root` - project root path (preferred for docs/examples)
- `@base` - current script directory path (compatibility)
- `@debug` - environment info
- `@fm` - current file's frontmatter (in modules)

Built-in transformer names are also unavailable for `var`/`let` declarations:
- `@exists`, `@typeof`
- `@json`, `@xml`, `@csv`, `@md`
- `@upper`, `@lower`, `@trim`, `@pretty`, `@sort`
- `@keep`, `@keepStructured`
