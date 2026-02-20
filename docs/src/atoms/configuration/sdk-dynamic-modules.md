---
id: config-sdk-dynamic-modules
title: Dynamic Module Injection
brief: Inject runtime context without filesystem I/O
category: configuration
parent: sdk
tags: [configuration, sdk, modules, injection, payload]
related: [config-sdk-execution-modes, config-sdk-execute, security-automatic-labels, syntax-payload]
related-code: [sdk/execute.ts, core/resolvers/DynamicModuleResolver.ts]
updated: 2026-01-11
---

Inject runtime context without filesystem I/O.

```typescript
execute('./script.mld', { text: 'user input', userId: '123' });
```

```mlld
>> Destructuring import (fields must exist)
import { text, userId } from @payload
show @text
```

For optional fields, use namespace import with ternary:

```mlld
>> Namespace import for optional field access
import "@payload" as @payload
var @text = @payload.text ? @payload.text : "default"
```

CLI usage with `mlld run`:

```bash
mlld run myscript --topic foo --count 5
```

```mlld
>> In myscript.mld - required fields
import { topic, count } from @payload
show `Topic: @topic, Count: @count`
```

Dynamic imports are labeled `src:dynamic` and marked untrusted.
