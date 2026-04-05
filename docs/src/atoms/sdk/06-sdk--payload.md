---
id: payload
qa_tier: 2
title: Payload Access
brief: Access data passed via SDK or CLI, including per-field payload labels
category: sdk
parent: sdk
tags: [variables, payload, sdk, cli]
related: [reserved-variables, config-sdk-dynamic-modules, config-cli-file]
related-code: [sdk/execute.ts, cli/commands/run.ts, cli/parsers/ArgumentParser.ts]
updated: 2026-03-15
---

`@payload` contains data passed to a script at invocation time. It's available as a direct variable — no import required.

```mlld
show `Topic: @payload.topic, Count: @payload.count`
var @env = @payload.env ? @payload.env : "dev"
```

**Destructuring import** (required fields - fails if missing):

```mlld
import { topic, count } from @payload
show `Topic: @topic, Count: @count`
```

**SDK usage**:

```typescript
execute('./script.mld', { topic: 'foo', count: 5 });
```

## Per-Field Payload Labels

SDK payload fields can carry security labels at the boundary.

```typescript
await execute('./agent.mld', {
  history: 'external tool output',
  query: 'user request'
}, {
  payloadLabels: {
    history: ['untrusted']
  }
});
```

```python
result = client.execute(
    "./agent.mld",
    {"history": "external tool output"},
    payload_labels={"history": ["untrusted"]},
)
```

All wrapper SDKs support inline label helpers — `labeled`, `trusted`, and `untrusted`:

```python
from mlld import trusted, untrusted, labeled

result = client.execute(
    "./agent.mld",
    {
        "query": trusted("approved request"),
        "history": untrusted("external tool output"),
        "data": labeled(value, "pii", "sensitive"),
    },
)
```

```go
payload := map[string]any{
    "query":   mlld.Trusted("approved request"),
    "history": mlld.Untrusted("external tool output"),
}
```

These wrap values so the SDK extracts raw values for the payload and collects labels into `payload_labels` automatically.

Per-field payload labels work for both direct `@payload.field` access and imports from `@payload`.

**CLI usage** — `mlld run`, direct invocation, and `-e` all support payload:

```bash
mlld run myscript --topic foo --count 5
mlld script.mld --topic foo --count 5
mlld -e 'show @payload.topic' --topic foo
```

Unknown flags become `@payload` fields automatically. Kebab-case flags are converted to camelCase (e.g., `--dry-run` becomes `@dryRun`).

`@payload` is always `{}` when no flags are passed — safe to reference fields without checking.
