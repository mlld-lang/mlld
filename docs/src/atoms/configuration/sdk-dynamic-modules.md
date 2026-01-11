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

Inject runtime context without filesystem I/O.

```typescript
processMlld(template, {
  dynamicModules: {
    '@state': { count: 0, messages: [...] },
    '@payload': { text: 'user input', userId: '123' }
  }
});
```

```mlld
>> Import syntax (preferred)
import { text, userId } from @payload
show @text

>> Or direct access
var @input = @payload.text
```

CLI usage with `mlld run`:

```bash
mlld run myscript --topic foo --count 5
```

```mlld
>> In myscript.mld
import { topic, count } from @payload
show `Topic: @topic, Count: @count`
```

Dynamic imports are labeled `src:dynamic` and marked untrusted.
