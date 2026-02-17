---
id: syntax-payload
title: Payload Access
brief: Access data passed via SDK or CLI
category: syntax
parent: variables
tags: [variables, payload, sdk, cli]
related: [reserved-variables, config-sdk-dynamic-modules, config-cli-file]
related-code: [sdk/execute.ts, cli/commands/run.ts, cli/parsers/ArgumentParser.ts]
updated: 2026-02-17
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

**CLI usage** — both `mlld run` and direct invocation support payload:

```bash
mlld run myscript --topic foo --count 5
mlld script.mld --topic foo --count 5
```

Unknown flags become `@payload` fields automatically. Kebab-case flags are converted to camelCase (e.g., `--dry-run` becomes `@dryRun`).

`@payload` is always available as `{}` even when no flags are passed — scripts can safely reference `@payload` fields without checking whether payload was injected.
