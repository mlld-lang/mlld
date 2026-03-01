---
id: cli-run
qa_tier: 2
title: mlld run Command
brief: Execute scripts with payload injection
category: cli
tags: [cli, run, scripts, payload, checkpoint, resume]
related: [syntax-payload, config-sdk-dynamic-modules, config-cli-file, checkpoint]
related-code: [cli/commands/run.ts]
updated: 2026-02-25
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
>> In build.mld — @payload is available directly
var @env = @payload.env ? @payload.env : "dev"
var @fast = @payload.fast ? @payload.fast : false
```

**Reserved flags**: `--mlld-env` is reserved for agent environment loading. `--env` now flows through as `@payload.env`.

**Script directory**: Configured in `mlld-config.json`, defaults to `llm/run/`.

**Options**:

| Flag | Description |
|------|-------------|
| `--timeout <duration>` | Script timeout (e.g., 5m, 1h, 30s) - default: unlimited |
| `--debug` | Show execution metrics |
| `--fresh` / `--new` | Clear checkpoint cache before running |
| `--no-checkpoint` | Disable checkpoint reads/writes for this run |
| `--resume [target]` | Invalidate checkpoint entries and re-run (see below) |
| `--fork <script>` | Seed cache from another script's checkpoints (read-only) |
| `--mlld-env <env>` | Load agent env file(s) or inline KEY=VALUE overrides |
| `--<name> <value>` | Payload field |

**Checkpoint/resume**: `llm`-labeled exes are automatically cached. Use `--resume` to selectively re-run:

```bash
mlld run pipeline --resume @review          # invalidate all @review entries
mlld run pipeline --resume @review:2        # invalidate 3rd invocation (0-based)
mlld run pipeline --resume @review("src/")  # invalidate by arg prefix
```

See `mlld howto checkpoint` for cache inspection and named checkpoints.
