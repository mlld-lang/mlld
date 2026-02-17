---
id: config-cli-file
title: Direct File Invocation
brief: Run mlld files with payload, timeout, and metrics
category: configuration
parent: cli
tags: [cli, file, payload, timeout, metrics]
related: [syntax-payload, config-cli-run, config-sdk-dynamic-modules]
related-code: [cli/parsers/ArgumentParser.ts, cli/execution/FileProcessor.ts]
updated: 2026-02-17
---

Run any mlld file directly with `mlld <file>`. Supports the same payload injection as `mlld run`, plus timeout and metrics flags.

```bash
mlld script.mld                        # Run a file
mlld script.mld --topic foo --count 5  # Pass payload fields
mlld script.mld --timeout 5m           # Limit execution time
mlld script.mld --metrics              # Show timing on stderr
```

**Payload injection**: Unknown flags become `@payload` fields. `@payload` is always available as `{}` even with no flags, so scripts can safely import from it:

```mlld
import { topic } from @payload
show @topic
```

```bash
mlld script.mld --topic hello    # @payload = {"topic":"hello"}
mlld script.mld                  # @payload = {}
```

**Options**:

| Flag | Description |
|------|-------------|
| `--timeout <duration>` | Overall execution timeout (e.g., 5m, 1h, 30s) |
| `--metrics` | Show execution timing on stderr |
| `--<name> <value>` | Payload field (unknown flags become `@payload` fields) |

**Difference from `mlld run`**: Direct invocation takes a file path. `mlld run` discovers scripts from the configured script directory (default: `llm/run/`) and supports AST caching across runs.
