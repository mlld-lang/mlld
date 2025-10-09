---
description: Error when using cached import type with a non-URL path
---

# Cached Import Type Error

This should fail because cached imports require an absolute URL source.

/import cached(5m) "./type-cached-non-url.mld" as @cachedSource
