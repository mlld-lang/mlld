---
id: sdk-dynamic-modules
qa_tier: 3
title: Dynamic Module Injection
brief: Inject runtime context without filesystem I/O
category: sdk
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
>> @payload is available directly — no import required
show @payload.text
var @name = @payload.userId ? @payload.userId : "anonymous"
```

Destructuring import also works for required fields:

```mlld
import { text, userId } from @payload
show @text
```

CLI usage with `mlld run`:

```bash
mlld run myscript --topic foo --count 5
```

```mlld
>> In myscript.mld
show `Topic: @payload.topic, Count: @payload.count`
```

Dynamic imports are labeled `src:dynamic` and marked untrusted.
