---
id: security-guard-composition
title: Guard Composition
brief: How multiple guards resolve
category: security
parent: guards
tags: [security, guards, composition, resolution]
related: [security-guards-basics, security-before-guards]
related-code: [interpreter/eval/guard.ts]
updated: 2026-01-05
---

1. All applicable guards run (file top-to-bottom)
2. `deny` takes precedence over all
3. `retry` next
4. `allow @value` (transformed)
5. `allow` (unchanged)

Guards are non-reentrant (won't trigger on their own operations).
