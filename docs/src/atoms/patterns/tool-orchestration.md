---
id: pattern-tool-orchestration
title: Tool Orchestration Pattern
brief: Coordinate multiple tools with data flow
category: patterns
parent: patterns
tags: [patterns, tools, orchestration, foreach]
related: [foreach, for-parallel]
related-code: []
updated: 2026-01-05
---

```mlld
var @areas = [
  {"name": "auth", "files": ["auth/*.ts"], "tests": ["test/auth/*"]},
  {"name": "api", "files": ["api/*.ts"], "tests": ["test/api/*"]}
]

exe @runQA(area) = cmd {echo "Testing @area.name" | cat}
var @results = foreach @runQA(@areas)
```
