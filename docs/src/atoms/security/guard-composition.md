---
id: security-guard-composition
title: Guard Composition
brief: How multiple guards interact
category: security
parent: guards
tags: [security, guards, composition, precedence]
related: [security-guards-basics, security-before-guards, security-after-guards]
related-code: [core/security/GuardComposition.ts]
updated: 2026-01-05
---

**Multiple guards can apply. Resolution order:**

1. All applicable guards run (file top-to-bottom)
2. `deny` takes precedence over all
3. `retry` next
4. `allow @value` (transformed)
5. `allow` (unchanged)

Guards are non-reentrant (won't trigger on their own operations).
