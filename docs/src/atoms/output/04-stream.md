---
id: stream
qa_tier: 2
title: Streaming
brief: Stream output during execution
category: output
tags: [streaming, output, parallel, llm]
related: [exe-simple, pipelines-parallel]
related-code: [interpreter/eval/stream.ts, grammar/patterns/stream.peggy]
updated: 2026-02-25
---

```mlld
>> In definition (recommended)
exe @llm(prompt) = stream cmd {
  claude -p "@prompt" --output-format stream-json --verbose --include-partial-messages
} with { streamFormat: "claude-code" }

show @llm("Explain TCP/IP")           >> streams tokens as they arrive

>> At invocation
exe @raw(prompt) = cmd {claude -p "@prompt" --output-format stream-json --verbose --include-partial-messages}
run stream @raw("Hello") with { streamFormat: "claude-code" }
```

Definition-level `stream` and `streamFormat` are inherited by both `run @exe()` and `show @exe()`.

```mlld
import { @haiku } from @mlld/claude-stream
show @haiku("Explain TCP/IP")        >> streams + parses by default
```

## Format Adapters

NDJSON streams require a format adapter to parse and display incrementally.

```mlld
>> Built-in adapter (string shorthand)
run stream @exe("prompt") with { streamFormat: "claude-code" }

>> Installable adapter
import { @claudeAgentSdkAdapter } from @mlld/stream-claude-agent-sdk
run stream @exe("prompt") with { streamFormat: @claudeAgentSdkAdapter }
```

| Adapter | Aliases | Parses |
|---------|---------|--------|
| `ndjson` | — | Generic NDJSON (default) |
| `claude-code` | `claude-agent-sdk` | Claude CLI stream-json events |

Without an adapter, raw NDJSON passes through unformatted.

## Shell Streaming

Non-NDJSON commands stream raw stdout:

```mlld
exe @build() = stream sh {npm run build}
show @build()                          >> live build output
```

## Parallel

```mlld
stream @a() || stream @b()            >> concurrent, buffered per-task
```

## Suppress

```bash
mlld script.mld --no-stream
MLLD_NO_STREAM=true mlld script.mld
```

## Debug

```bash
mlld script.mld --show-json           >> mirror NDJSON to stderr
mlld script.mld --append-json out.jsonl  >> save events to file
```

## Limitations

- After-guards conflict with streaming (output must be complete for validation)
- Pipeline stages buffer between stages; streaming is within each stage
