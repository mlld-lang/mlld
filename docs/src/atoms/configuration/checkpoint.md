---
id: checkpoint
title: Checkpoint & Resume
brief: Cache LLM call results and resume interrupted runs
category: configuration
parent: cli
aliases: [resume, cache, fresh, fork]
tags: [checkpoint, resume, cache, llm, cli]
related: [config-cli-run, hooks, exe-simple]
related-code: [interpreter/checkpoint/CheckpointManager.ts, interpreter/hooks/checkpoint-pre-hook.ts, cli/commands/checkpoint.ts, cli/commands/run.ts]
updated: 2026-02-20
---

Checkpointing automatically caches results from `llm`-labeled executables so you can resume interrupted runs without re-calling LLMs.

**Auto-detection**: `exe` and `run` operations with the `llm` label that make external calls (cmd, sh, prose, node) are checkpoint-eligible. No opt-in flag needed.

```mlld
>> This call is automatically checkpointed
exe llm @review(file, model) = cmd {claude -p "Review @file" --model @model}

var @result = @review("main.ts", "sonnet")
```

Second run: `@review("main.ts", "sonnet")` returns the cached result instantly.

## CLI Flags

```bash
mlld run pipeline                        # auto-caches llm calls
mlld run pipeline --fresh                # clear cache, rebuild from scratch
mlld run pipeline --no-checkpoint        # disable caching entirely
mlld run pipeline --resume @review       # invalidate @review's cache entries, re-run
mlld run pipeline --fork other-script    # seed cache from another script's results
```

| Flag | Effect |
|------|--------|
| `--fresh` / `--new` | Clear this script's cache before running |
| `--no-checkpoint` | Disable all checkpoint reads and writes |
| `--resume @fn` | Invalidate all entries for `@fn`, re-execute |
| `--resume @fn:2` | Invalidate only the 3rd invocation (0-based) |
| `--resume @fn("src/")` | Invalidate entries where first arg starts with `"src/"` |
| `--fork <script>` | Read hits from another script's cache (read-only); misses write to current cache |

## Inspecting the Cache

```bash
mlld checkpoint list <script>       # list cached entries
mlld checkpoint inspect <script>    # full JSON dump (manifest + records)
mlld checkpoint clean <script>      # delete cache for a script
```

Cache lives in `.mlld/checkpoints/<script-name>/`.

## Named Checkpoints

The `checkpoint` directive registers a named marker for resume targeting:

```mlld
checkpoint "data-loaded"

>> Later, resume from this point:
>> mlld run pipeline --resume "data-loaded"
```

## Context Variables

| Variable | Description |
|----------|-------------|
| `@mx.checkpoint.hit` | `true` when current operation was served from cache |
| `@mx.checkpoint.key` | Cache key for the current operation |

Use in hooks for observability:

```mlld
hook @cacheLog after @review = [
  append `@mx.op.name hit=@mx.checkpoint.hit` to "cache.log"
]
```

## How It Works

- Cache key = SHA-256 hash of function name + normalized args
- On hit: execution short-circuits, guards are skipped, post-hooks still run
- On miss: result is cached after post-hooks complete
- Cache read/write errors are isolated (logged as warnings, never abort execution)
