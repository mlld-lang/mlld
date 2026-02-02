---
name: claude-poll
author: mlld
version: 1.1.0
about: Claude invocation with file-polling completion detection. Works around claude -p process hang by running in background and polling for a marker file or JSONL pattern.
bugs: https://github.com/mlld-lang/modules/issues
repo: https://github.com/mlld-lang/modules
keywords: [llm, ai, anthropic, claude, async, polling, jsonl, events]
license: CC0
mlldVersion: ">=2.0.0-rc78"
---

/needs {
  sh
}

# @local/claude-poll

Claude invocation that detects completion by polling for an output file or JSONL pattern, then kills the process. Works around a known issue where `claude -p` doesn't terminate after the agent session completes ([anthropics/claude-code#20084](https://github.com/anthropics/claude-code/issues/20084)).

Supports two polling modes:
- **File mode**: Watch for a marker file to appear
- **JSONL mode**: Watch for a pattern to appear in a JSONL file (useful for event-driven pipelines)

## tldr

**File mode** - watch for a marker file:
```mlld
/import { @claudePoll } from @local/claude-poll

>> Agent writes /tmp/result.json during its session
/var @output = @claudePoll(
  "Analyze data and write results to /tmp/result.json",
  "opus",
  @base,
  "Read,Write,Glob,Grep",
  "/tmp/result.json"
)
>> @output contains the contents of /tmp/result.json
```

**JSONL mode** - watch for an event in a JSONL file:
```mlld
/import { @claudePollEvent } from @local/claude-poll

>> Agent appends event to events.jsonl
/var @eventsFile = "@runDir/events.jsonl"
/var @output = @claudePollEvent(
  "Process m-24a0 and append {\"event\":\"item_done\",\"id\":\"m-24a0\",...} to @eventsFile",
  "opus",
  @base,
  "Read,Write,Glob,Grep",
  @eventsFile,
  "item_done",
  "m-24a0"
)
>> @output contains the matching JSON line
```

## docs

### `@claudePoll(prompt, model, dir, tools, markerFile)`

Runs `claude -p` in the background and polls for `markerFile` to appear. Once detected, waits briefly for any final writes, kills the process, and returns the marker file contents.

- `prompt`: The prompt text (piped to claude stdin)
- `model`: Model name (haiku, sonnet, opus)
- `dir`: Working directory for the session
- `tools`: Comma-separated tool list (e.g., "Read,Write,Glob,Grep")
- `markerFile`: Absolute path to a file the agent will write as its final output

**Important**: Your prompt must instruct the agent to write the marker file. This function returns the contents of that file.

```mlld
/var @result = @claudePoll(
  "Research the topic and write findings to /tmp/findings.json",
  "sonnet",
  @base,
  "Read,Write,Glob,Grep",
  "/tmp/findings.json"
)
```

### `@claudePollTimeout(prompt, model, dir, tools, markerFile, timeout)`

Same as `@claudePoll` but with an explicit timeout in seconds. If the marker file doesn't appear within the timeout, the process is killed and an empty string is returned.

```mlld
>> Give up after 30 minutes
/var @result = @claudePollTimeout(
  "Analyze the codebase",
  "opus",
  @base,
  "Read,Write,Glob",
  "/tmp/analysis.json",
  1800
)
```

### `@claudePollJsonl(prompt, model, dir, tools, jsonlFile, pattern)`

Runs `claude -p` in the background and polls for `pattern` to appear in `jsonlFile`. Once detected, waits briefly for any final writes, kills the process, and returns the matching line.

- `prompt`: The prompt text (piped to claude stdin)
- `model`: Model name (haiku, sonnet, opus)
- `dir`: Working directory for the session
- `tools`: Comma-separated tool list
- `jsonlFile`: Absolute path to a JSONL file the agent will append to
- `pattern`: Grep pattern to match (e.g., `"id":"m-24a0".*"done":true`)

**Important**: Your prompt must instruct the agent to append a JSON line to the JSONL file. This function returns the matching line.

```mlld
/var @eventsFile = "/path/to/events.jsonl"
/var @result = @claudePollJsonl(
  "Process item m-24a0 and append result to events.jsonl",
  "opus",
  @base,
  "Read,Write,Glob,Grep",
  @eventsFile,
  "\"id\":\"m-24a0\".*\"status\":\"done\""
)
>> @result contains the matching JSON line
```

### `@claudePollEvent(prompt, model, dir, tools, jsonlFile, eventType, itemId)`

Convenience wrapper that polls for a specific event type and item ID in a JSONL file. Builds the pattern automatically from eventType and itemId.

- `eventType`: Event type to match (e.g., "item_done", "merge_done")
- `itemId`: Item ID to match (e.g., "m-24a0")

```mlld
/var @eventsFile = "/path/to/events.jsonl"
/var @result = @claudePollEvent(
  "Process ticket m-24a0 and log item_done event to events.jsonl",
  "opus",
  @base,
  "Read,Write",
  @eventsFile,
  "item_done",
  "m-24a0"
)
>> Watches for: {"event": "item_done", "id": "m-24a0", ...}
```

### `@claudePollJsonlTimeout(prompt, model, dir, tools, jsonlFile, pattern, timeout)`

Same as `@claudePollJsonl` but with an explicit timeout in seconds.

### Debugging

Set `MLLD_DEBUG_CLAUDE_POLL=1` to emit poll diagnostics to stderr.
Set `MLLD_CLAUDE_POLL_LOG=/path/to/claude.log` to capture `claude` stdout/stderr.

## module

```mlld-run
exe @claudePoll(prompt, model, dir, tools, markerFile) = sh {
  PROMPT_FILE=$(mktemp)
  printf '%s' "$prompt" > "$PROMPT_FILE"

  CLAUDE_LOG="${MLLD_CLAUDE_POLL_LOG:-}"
  if [ -n "$CLAUDE_LOG" ]; then
    mkdir -p "$(dirname "$CLAUDE_LOG")" 2>/dev/null || true
  fi
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    PROMPT_BYTES=$(wc -c < "$PROMPT_FILE" | tr -d ' ')
    echo "[claude-poll] prompt_bytes=$PROMPT_BYTES model=$model tools=$tools dir=$dir marker=$markerFile log=$CLAUDE_LOG" >&2
  fi

  if [ -n "$CLAUDE_LOG" ]; then
    (cd "$dir" && claude -p --model "$model" --allowedTools "$tools" < "$PROMPT_FILE" > "$CLAUDE_LOG" 2>&1) &
  else
    (cd "$dir" && claude -p --model "$model" --allowedTools "$tools" < "$PROMPT_FILE" > /dev/null 2>&1) &
  fi
  CLAUDE_PID=$!
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    echo "[claude-poll] pid=$CLAUDE_PID" >&2
  fi

  while ! test -f "$markerFile"; do
    sleep 5
    if ! kill -0 $CLAUDE_PID 2>/dev/null; then
      if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
        echo "[claude-poll] process exited before marker file appeared" >&2
      fi
      break
    fi
  done

  sleep 15
  kill $CLAUDE_PID 2>/dev/null
  wait $CLAUDE_PID 2>/dev/null
  CLAUDE_STATUS=$?
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    echo "[claude-poll] exit_status=$CLAUDE_STATUS" >&2
  fi

  rm -f "$PROMPT_FILE"
  cat "$markerFile" 2>/dev/null
}

exe @claudePollTimeout(prompt, model, dir, tools, markerFile, timeout) = sh {
  PROMPT_FILE=$(mktemp)
  printf '%s' "$prompt" > "$PROMPT_FILE"

  CLAUDE_LOG="${MLLD_CLAUDE_POLL_LOG:-}"
  if [ -n "$CLAUDE_LOG" ]; then
    mkdir -p "$(dirname "$CLAUDE_LOG")" 2>/dev/null || true
  fi
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    PROMPT_BYTES=$(wc -c < "$PROMPT_FILE" | tr -d ' ')
    echo "[claude-poll] prompt_bytes=$PROMPT_BYTES model=$model tools=$tools dir=$dir marker=$markerFile log=$CLAUDE_LOG timeout=$timeout" >&2
  fi

  if [ -n "$CLAUDE_LOG" ]; then
    (cd "$dir" && claude -p --model "$model" --allowedTools "$tools" < "$PROMPT_FILE" > "$CLAUDE_LOG" 2>&1) &
  else
    (cd "$dir" && claude -p --model "$model" --allowedTools "$tools" < "$PROMPT_FILE" > /dev/null 2>&1) &
  fi
  CLAUDE_PID=$!
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    echo "[claude-poll] pid=$CLAUDE_PID" >&2
  fi

  ELAPSED=0
  while ! test -f "$markerFile"; do
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    if [ "$ELAPSED" -ge "$timeout" ]; then
      kill $CLAUDE_PID 2>/dev/null
      wait $CLAUDE_PID 2>/dev/null
      if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
        echo "[claude-poll] timeout reached after ${ELAPSED}s" >&2
      fi
      rm -f "$PROMPT_FILE"
      exit 0
    fi
    if ! kill -0 $CLAUDE_PID 2>/dev/null; then
      if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
        echo "[claude-poll] process exited before marker file appeared" >&2
      fi
      break
    fi
  done

  sleep 15
  kill $CLAUDE_PID 2>/dev/null
  wait $CLAUDE_PID 2>/dev/null
  CLAUDE_STATUS=$?
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    echo "[claude-poll] exit_status=$CLAUDE_STATUS" >&2
  fi

  rm -f "$PROMPT_FILE"
  cat "$markerFile" 2>/dev/null
}

>> JSONL polling - watch for pattern in a JSONL file
exe @claudePollJsonl(prompt, model, dir, tools, jsonlFile, pattern) = sh {
  PROMPT_FILE=$(mktemp)
  printf '%s' "$prompt" > "$PROMPT_FILE"

  CLAUDE_LOG="${MLLD_CLAUDE_POLL_LOG:-}"
  if [ -n "$CLAUDE_LOG" ]; then
    mkdir -p "$(dirname "$CLAUDE_LOG")" 2>/dev/null || true
  fi
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    PROMPT_BYTES=$(wc -c < "$PROMPT_FILE" | tr -d ' ')
    echo "[claude-poll] prompt_bytes=$PROMPT_BYTES model=$model tools=$tools dir=$dir jsonl=$jsonlFile pattern=$pattern log=$CLAUDE_LOG" >&2
  fi

  if [ -n "$CLAUDE_LOG" ]; then
    (cd "$dir" && claude -p --model "$model" --allowedTools "$tools" < "$PROMPT_FILE" > "$CLAUDE_LOG" 2>&1) &
  else
    (cd "$dir" && claude -p --model "$model" --allowedTools "$tools" < "$PROMPT_FILE" > /dev/null 2>&1) &
  fi
  CLAUDE_PID=$!
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    echo "[claude-poll] pid=$CLAUDE_PID" >&2
  fi

  # Poll for pattern in JSONL file
  while ! grep -q "$pattern" "$jsonlFile" 2>/dev/null; do
    sleep 5
    if ! kill -0 $CLAUDE_PID 2>/dev/null; then
      if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
        echo "[claude-poll] process exited before JSONL pattern appeared" >&2
      fi
      break
    fi
  done

  sleep 15
  kill $CLAUDE_PID 2>/dev/null
  wait $CLAUDE_PID 2>/dev/null
  CLAUDE_STATUS=$?
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    echo "[claude-poll] exit_status=$CLAUDE_STATUS" >&2
  fi

  rm -f "$PROMPT_FILE"
  # Return the matching line (last match if multiple)
  grep "$pattern" "$jsonlFile" 2>/dev/null | tail -1
}

>> JSONL polling with timeout
exe @claudePollJsonlTimeout(prompt, model, dir, tools, jsonlFile, pattern, timeout) = sh {
  PROMPT_FILE=$(mktemp)
  printf '%s' "$prompt" > "$PROMPT_FILE"

  CLAUDE_LOG="${MLLD_CLAUDE_POLL_LOG:-}"
  if [ -n "$CLAUDE_LOG" ]; then
    mkdir -p "$(dirname "$CLAUDE_LOG")" 2>/dev/null || true
  fi
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    PROMPT_BYTES=$(wc -c < "$PROMPT_FILE" | tr -d ' ')
    echo "[claude-poll] prompt_bytes=$PROMPT_BYTES model=$model tools=$tools dir=$dir jsonl=$jsonlFile pattern=$pattern log=$CLAUDE_LOG timeout=$timeout" >&2
  fi

  if [ -n "$CLAUDE_LOG" ]; then
    (cd "$dir" && claude -p --model "$model" --allowedTools "$tools" < "$PROMPT_FILE" > "$CLAUDE_LOG" 2>&1) &
  else
    (cd "$dir" && claude -p --model "$model" --allowedTools "$tools" < "$PROMPT_FILE" > /dev/null 2>&1) &
  fi
  CLAUDE_PID=$!
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    echo "[claude-poll] pid=$CLAUDE_PID" >&2
  fi

  ELAPSED=0
  while ! grep -q "$pattern" "$jsonlFile" 2>/dev/null; do
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    if [ "$ELAPSED" -ge "$timeout" ]; then
      kill $CLAUDE_PID 2>/dev/null
      wait $CLAUDE_PID 2>/dev/null
      if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
        echo "[claude-poll] timeout reached after ${ELAPSED}s" >&2
      fi
      rm -f "$PROMPT_FILE"
      exit 0
    fi
    if ! kill -0 $CLAUDE_PID 2>/dev/null; then
      if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
        echo "[claude-poll] process exited before JSONL pattern appeared" >&2
      fi
      break
    fi
  done

  sleep 15
  kill $CLAUDE_PID 2>/dev/null
  wait $CLAUDE_PID 2>/dev/null
  CLAUDE_STATUS=$?
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    echo "[claude-poll] exit_status=$CLAUDE_STATUS" >&2
  fi

  rm -f "$PROMPT_FILE"
  grep "$pattern" "$jsonlFile" 2>/dev/null | tail -1
}

>> Convenience: poll for specific event type + item ID
exe @claudePollEvent(prompt, model, dir, tools, jsonlFile, eventType, itemId) = sh {
  PROMPT_FILE=$(mktemp)
  printf '%s' "$prompt" > "$PROMPT_FILE"

  # Build pattern: matches "event": "<type>" and "id": "<id>" in same line
  # Allow optional spaces after colons for JSON formatting flexibility
  PATTERN="\"event\":[[:space:]]*\"$eventType\".*\"id\":[[:space:]]*\"$itemId\""

  CLAUDE_LOG="${MLLD_CLAUDE_POLL_LOG:-}"
  if [ -n "$CLAUDE_LOG" ]; then
    mkdir -p "$(dirname "$CLAUDE_LOG")" 2>/dev/null || true
  fi
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    PROMPT_BYTES=$(wc -c < "$PROMPT_FILE" | tr -d ' ')
    echo "[claude-poll] prompt_bytes=$PROMPT_BYTES model=$model tools=$tools dir=$dir jsonl=$jsonlFile event=$eventType id=$itemId log=$CLAUDE_LOG" >&2
  fi

  if [ -n "$CLAUDE_LOG" ]; then
    (cd "$dir" && claude -p --model "$model" --allowedTools "$tools" < "$PROMPT_FILE" > "$CLAUDE_LOG" 2>&1) &
  else
    (cd "$dir" && claude -p --model "$model" --allowedTools "$tools" < "$PROMPT_FILE" > /dev/null 2>&1) &
  fi
  CLAUDE_PID=$!
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    echo "[claude-poll] pid=$CLAUDE_PID pattern=$PATTERN" >&2
  fi

  while ! grep -qE "$PATTERN" "$jsonlFile" 2>/dev/null; do
    sleep 5
    if ! kill -0 $CLAUDE_PID 2>/dev/null; then
      if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
        echo "[claude-poll] process exited before JSONL event appeared" >&2
      fi
      break
    fi
  done

  sleep 15
  kill $CLAUDE_PID 2>/dev/null
  wait $CLAUDE_PID 2>/dev/null
  CLAUDE_STATUS=$?
  if [ -n "$MLLD_DEBUG_CLAUDE_POLL" ]; then
    echo "[claude-poll] exit_status=$CLAUDE_STATUS" >&2
  fi

  rm -f "$PROMPT_FILE"
  grep -E "$PATTERN" "$jsonlFile" 2>/dev/null | tail -1
}

export { @claudePoll, @claudePollTimeout, @claudePollJsonl, @claudePollJsonlTimeout, @claudePollEvent }
```
