---
id: config-cli-run
title: mlld run Command
brief: Execute scripts with payload injection
category: configuration
parent: cli
tags: [cli, run, scripts, payload]
related: [syntax-payload, config-sdk-dynamic-modules]
related-code: [cli/commands/run.ts]
updated: 2026-01-11
---

Run mlld scripts from a configured directory with automatic payload injection.

```bash
mlld run                     # List available scripts
mlld run hello               # Run llm/run/hello.mld
mlld run qa --topic vars     # Pass payload: @payload.topic = "vars"
```

**Payload injection**: Unknown flags become `@payload` fields:

```bash
mlld run build --env prod --fast true
```

```mlld
>> In build.mld
import "@payload" as @payload
var @env = @payload.env ? @payload.env : "dev"
var @fast = @payload.fast ? @payload.fast : false
```

**Script directory**: Configured in `mlld-config.json`, defaults to `llm/run/`.

**Options**:

| Flag | Description |
|------|-------------|
| `--timeout <ms>` | Script timeout (default: 300000) |
| `--debug` | Show execution metrics |
| `--<name> <value>` | Payload field |
