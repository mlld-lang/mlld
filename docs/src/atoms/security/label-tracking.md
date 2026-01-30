---
id: security-label-tracking
title: Label Tracking
brief: How labels flow through operations
category: security
parent: labels
aliases: [label]
tags: [security, labels, tracking, flow]
related: [security-guards-basics, security-automatic-labels]
related-code: [core/security/LabelTracker.ts]
updated: 2026-01-05
qa_tier: 2
---

- Method calls: `@secret.trim()` preserves labels
- Templates: interpolated values carry labels
- Field access: `@user.email` inherits from `@user`
- Iterators: each item inherits collection labels
- Pipelines: labels flow through stages
