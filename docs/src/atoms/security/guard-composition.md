---
id: security-guard-composition
title: Guard Composition
brief: How multiple guards resolve
category: security
parent: guards
tags: [security, guards, composition, resolution]
related: [security-guards-basics, security-before-guards]
related-code: [interpreter/eval/guard.ts]
updated: 2026-02-15
qa_tier: 2
---

1. Guards run top-to-bottom in declaration order.
2. `always` timing participates in both phases (`before` and `after`).
3. Decision precedence is `deny` > `retry` > `allow @value` > `allow`.
4. Before-phase transforms are last-wins: each guard evaluates against the original input independently, and the last guard's replacement becomes the operation input.
5. After-phase transforms chain sequentially; each guard receives the previous guard's output.
6. `retry` actions apply only in retryable operation contexts (for example pipeline stages). In non-retryable contexts, retry resolves as a deny.
7. `before op:exe` transforms run before executable evaluation, so guard logic reads `@input` in this phase. `@output` is available in `after` phase only.

Guards are non-reentrant (won't trigger on their own operations).
