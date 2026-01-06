---
id: security-label-tracking
title: Label Tracking
brief: How labels flow through operations
category: security
parent: labels
tags: [security, labels, tracking, flow]
related: [security-automatic-labels, security-guards-basics]
related-code: [core/security/LabelPropagation.ts]
updated: 2026-01-05
---

**Labels flow through operations:**

- Method calls: `@secret.trim()` preserves labels
- Templates: interpolated values carry labels
- Field access: `@user.email` inherits from `@user`
- Iterators: each item inherits collection labels
- Pipelines: labels flow through stages
