---
id: checkpoint
qa_tier: 2
title: Checkpoint & Resume
brief: Cache LLM call results, control replay policy, and resume targeted work
category: cli
aliases: [checkpoint, checkpoints, resume, cache, fresh, fork]
tags: [checkpoint, resume, cache, llm, cli]
related: [config-cli-run, hooks, exe-simple]
related-code: [interpreter/checkpoint/CheckpointManager.ts, interpreter/hooks/checkpoint-pre-hook.ts, cli/commands/checkpoint.ts, cli/commands/run.ts]
updated: 2026-03-06
---

Checkpointing automatically persists results from `llm`-labeled executables so you can resume interrupted runs without re-calling LLMs. Cache writes are automatic; cache reads follow the script's resume policy.

**Auto-detection**: `exe` and `run` operations with the `llm` label that make external calls (cmd, sh, prose, node) are checkpoint-eligible. No opt-in flag needed.

```mlld
resume: auto

>> This call is automatically checkpointed
exe llm @review(file, model) = cmd {claude -p "Review @file" --model @model}

var @result = @review("main.ts", "sonnet")
```

Second run with `resume: auto` or `mlld run ... --resume`: `@review("main.ts", "sonnet")` returns the cached result instantly.

## Resume Modes

Set a top-of-file `resume:` header to control when cached hits are allowed:

```mlld
resume: manual   >> default if omitted
resume: auto     >> serve checkpoint hits by default
resume: never    >> skip checkpoint reads/writes unless --resume is used
```

Quoted and unquoted forms are both accepted: `resume: auto` and `resume: "auto"`.

| Mode | Behavior |
|------|----------|
| `manual` | Default for scripts. Writes checkpoints, but only serves hits when `--resume` is passed |
| `auto` | Writes checkpoints and serves hits automatically |
| `never` | Skips checkpoint reads and writes for normal runs |

`--resume` overrides the script-level mode for the current run.

## CLI Flags

```bash
mlld run pipeline                        # writes checkpoints; default replay is manual unless script says resume:auto
mlld run pipeline --fresh                # clear cache, rebuild from scratch
mlld run pipeline --no-checkpoint        # disable caching entirely
mlld run pipeline --resume               # use existing hits without invalidating a target
mlld run pipeline --resume @review       # invalidate @review's cache entries, re-run
mlld run pipeline --fork other-script    # seed cache from another script's results
```

| Flag | Effect |
|------|--------|
| `--fresh` / `--new` | Clear this script's cache before running |
| `--no-checkpoint` | Disable all checkpoint reads and writes |
| `--resume` | Enable checkpoint replay for this run without invalidating a specific target |
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

## Named Checkpoints & Policies

The `checkpoint` directive registers a named marker for resume targeting and can override resume behavior for the checkpoint scope that follows it:

```mlld
checkpoint "fetch-api" with {
  resume: auto,
  ttl: 1h,
  complete: @fetchDone
}

>> Later:
>> mlld run pipeline --resume "fetch-api"
```

| Field | Effect |
|-------|--------|
| `resume: auto|manual|never` | Override the script-level resume mode for that checkpoint scope |
| `ttl: 1h` | Expire automatic hits after the duration |
| `complete: <expr>` | Record completion state when the checkpoint scope closes; automatic hits are only served after a prior run marked it complete |

Named checkpoints are discovered from source before execution starts, so `--resume "name"` works even if a prior run failed before that checkpoint was reached.

`--resume` still overrides `resume`, `ttl`, and `complete` for the current run.

## Context Variables

| Variable | Description |
|----------|-------------|
| `@mx.checkpoint.hit` | `true` when current operation was served from cache |
| `@mx.checkpoint.key` | Cache key for the current operation |

Use in hooks for observability:

```mlld
hook @cacheLog after op:named:review = [
  append `@mx.op.name hit=@mx.checkpoint.hit` to "cache.log"
]
```

## How It Works

- Cache key = SHA-256 hash of function name + normalized args
- On hit: execution short-circuits, guards are skipped, post-hooks still run, and workspace snapshots are restored when available
- On miss: result is cached after post-hooks complete
- Automatic hits obey script/checkpoint resume policy, TTL, and completion gates
- Cache read/write errors are isolated (logged as warnings, never abort execution)

## Workspace VFS Side Effects Are Replayed

Checkpoint resume now captures and restores VFS workspace state for checkpointed operations running inside an active `box` workspace. If an LLM call writes files via tools like `Write` or `Bash`, those files are restored on cache hits.

```mlld
resume: auto

var @ws = box [
  let @dummy = @claude("Write results to output.txt", { model: "haiku", tools: ["Write"] })
]
show <@ws/output.txt>   >> works on resume — workspace snapshot is restored
```

Current limits:

- Restore only applies when the matching workspace is active at replay time
- Restoring a snapshot clears any stale `shellSession` so later shell commands see the restored VFS state
- Malformed snapshots fail soft with a warning
- External side effects outside the workspace are still not replayed
