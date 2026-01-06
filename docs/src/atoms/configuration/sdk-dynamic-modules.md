---
id: config-sdk-dynamic-modules
title: Dynamic Module Injection
brief: Inject runtime context without filesystem I/O
category: configuration
parent: sdk
tags: [configuration, sdk, modules, injection]
related: [config-sdk-execution-modes, config-sdk-execute, security-automatic-labels]
related-code: [sdk/execute.ts, interpreter/env/DynamicModules.ts]
updated: 2026-01-05
---

**Inject runtime context without filesystem I/O:**

```typescript
processMlld(template, {
  dynamicModules: {
    '@state': { count: 0, messages: [...] },
    '@payload': { text: 'user input', userId: '123' }
  }
});
```

```mlld
var @count = @state.count + 1
var @input = @payload.text
```

Dynamic imports are labeled `src:dynamic` and marked untrusted.
