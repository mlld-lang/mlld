---
id: syntax-payload
title: Payload Access
brief: Access data passed via SDK or CLI
category: syntax
parent: variables
tags: [variables, payload, sdk, cli]
related: [reserved-variables, config-sdk-dynamic-modules]
related-code: [sdk/execute.ts, cli/commands/run.ts]
updated: 2026-01-11
---

`@payload` contains data passed to a script at invocation time.

**Destructuring import** (required fields - fails if missing):

```mlld
import { topic, count } from @payload
show `Topic: @topic, Count: @count`
```

**Namespace import** (optional fields with defaults):

```mlld
import "@payload" as @payload
var @topic = @payload.topic ? @payload.topic : "default"
var @count = @payload.count ? @payload.count : 0
```

**SDK usage**:

```typescript
execute('./script.mld', { topic: 'foo', count: 5 });
```

**CLI usage** with `mlld run`:

```bash
mlld run myscript --topic foo --count 5
```

Unknown flags become `@payload` fields automatically.
