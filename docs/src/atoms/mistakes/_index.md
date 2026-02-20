---
id: mistakes
title: Common Mistakes
brief: Avoid common pitfalls when writing mlld
category: mistakes
updated: 2026-01-05
---

Common mistakes to avoid when writing mlld, from syntax errors to anti-patterns.

- Avoid local `@state` objects such as `var @state = { stop: false }`. `@state` is SDK-managed, and mlld variable bindings are immutable.
