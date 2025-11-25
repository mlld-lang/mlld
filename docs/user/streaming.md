# Streaming

## tldr

Enable live output from LLM calls and long-running commands with `stream`:

```mlld
stream /exe @chat(prompt) = run { claude "@prompt" }

/show @chat("Explain mlld in one sentence")
# Shows chunks as they arrive, not all at once
```

## Enabling Streaming

Three ways to enable streaming:

### 1. `stream` Keyword (Recommended)

```mlld
stream /exe @llm(prompt) = run { claude "@prompt" }

/show @llm("Hello")                        # Streams output
```

### 2. `/stream` Directive

```mlld
/stream

/exe @llm(prompt) = run { claude "@prompt" }
/show @llm("Hello")                        # Streams output
```

### 3. `with { stream: true }` Clause

```mlld
/exe @llm(prompt) = run { claude "@prompt" }

/show @llm("Hello") with { stream: true }  # Streams this call only
```

## Disable Streaming

Suppress streaming globally:

```bash
mlld script.mld --no-stream
# or
MLLD_NO_STREAM=1 mlld script.mld
```

Per-operation:

```mlld
stream /exe @llm(prompt) = run { claude "@prompt" }

/show @llm("Hello") with { stream: false } # Buffer, show when complete
```

## Streaming Executors

These executors support streaming:
- `shell` / `bash` - Shell commands with live output
- `node` - Node.js scripts
- LLM clients that output NDJSON (claude, openai, etc.)

```mlld
stream /exe @build() = run { npm run build }

/show @build()                             # Shows build output live
```

## NDJSON Auto-Parsing

Streaming executables that output NDJSON are automatically parsed.

Recognized paths:
- `message.content[].text`
- `message.content[].result`
- `delta.text`
- `completion`
- `error.message`

```mlld
stream /exe @llm(prompt) = run {
  claude "@prompt" --output-format stream-json
}

/show @llm("Write a haiku")
# Parses NDJSON, shows message text as it streams
```

## Live Output Formatting

Streaming produces live formatted output:

**Message text:**
- Shows on stdout with spacing
- Deduplicates identical chunks
- Avoids double-printing

**Thinking blocks:**
```
💭 Analyzing the question...
💭 Considering edge cases...
```

**Tool use:**
```
🔧 read_file input="config.json"
🔧 bash_run command="npm test"
```

**Tool results:**
- Suppressed by default (reduce noise)
- Enable with `MLLD_DEBUG=true`

## Debug Output

### Mirror NDJSON to stderr

```bash
mlld script.mld --show-json
# or
MLLD_SHOW_JSON=true mlld script.mld
```

Shows raw NDJSON events as they arrive (useful for debugging).

### Save NDJSON to File

```bash
mlld script.mld --append-json output.jsonl
# or
mlld script.mld --append-json              # Defaults to YYYY-MM-DD-HH-MM-SS-stream.jsonl
```

Writes NDJSON to file while also showing formatted output.

## Streaming with Pipelines

Pipelines stream through stages:

```mlld
stream /exe @analyze(text) = run { claude "Analyze: @text" }
stream /exe @summarize(analysis) = run { claude "Summarize: @analysis" }

/var @input = <large-file.md>
/var @result = @input | @analyze | @summarize
/show @result                              # Both stages stream
```

## Parallel Streaming

Parallel groups stream concurrently:

```mlld
stream /exe @task1() = run { sleep 2 && echo "Task 1 done" }
stream /exe @task2() = run { sleep 1 && echo "Task 2 done" }

/for 2 parallel @i in [1, 2] => @task@i()
# Both tasks stream output as they complete
```

Output is buffered per task and shown when each completes.

## Streaming with /show

Streaming `/show` avoids double-printing streamed content:

```mlld
stream /exe @llm(prompt) = run { claude "@prompt" }

/show @llm("Hello")                        # Content streams once (not duplicated)
```

Without streaming, content would appear during execution and again when `/show` displays it.

## Common Patterns

### Stream Long-Running Build

```mlld
stream /exe @build() = run { npm run build }

/show @build()                             # See build output live
```

### Stream Multiple LLM Calls

```mlld
stream /exe @chat(prompt) = run { claude "@prompt" }

/for @question in @questions => @chat(@question)
# Each question streams as it's answered
```

### Conditional Streaming

```mlld
/exe @llm(prompt) = run { claude "@prompt" }

/when @isInteractive => show @llm("Hello") with { stream: true }
/when !@isInteractive => show @llm("Hello") with { stream: false }
```

### Debug Streaming Issues

```bash
# See raw NDJSON events
mlld script.mld --show-json

# Save events for inspection
mlld script.mld --append-json debug.jsonl
```

## Streaming Limitations

Streaming is disabled when:
- After-guards are active (output must be fully available for validation)
- Error: "Cannot run after-guards when streaming is enabled"
- Solution: Use `with { stream: false }` or change guards to `before`

```mlld
/guard after @validate for op:exe = when [...]  # After guard

stream /exe @llm(p) = run { claude "@p" }
/show @llm("test")                         # Error: streaming + after-guards conflict

# Fix: disable streaming for this call
/show @llm("test") with { stream: false }  # Works
```

## Technical Details

**NDJSON Paths Checked** (in order):
1. `message.content[N].text`
2. `message.content[N].result`
3. `delta.text`
4. `completion`
5. `error.message`

**Formatting Rules:**
- Message text: stdout with spacing/dedup
- Thinking: stderr with `💭` prefix
- Tool use: stderr with `🔧` prefix and input preview
- Tool results: suppressed (noise reduction)

**File Output:**
- `--append-json` writes to JSONL format
- Default filename: `YYYY-MM-DD-HH-MM-SS-stream.jsonl`
- Compatible with NDJSON parsing tools
