# Streaming

## tldr

Enable live output from LLM calls and long-running commands with `stream`:

```mlld
exe @chat(prompt) = stream cmd {claude "@prompt"}

show @chat("Explain mlld in one sentence")
>> Shows chunks as they arrive, not all at once
```

## Enabling Streaming

Two ways to enable streaming:

### 1. In Definition (Recommended)

Define an executable that streams:

```mlld
exe @llm(prompt) = stream cmd {claude "@prompt"}

show @llm("Hello")  >> Streams output
```

### 2. At Invocation

Stream when calling:

```mlld
exe @llm(prompt) = cmd {claude "@prompt"}

stream @llm("Hello")  >> Streams this call
```

## Disable Streaming

Suppress streaming globally:

```bash
mlld script.mld --no-stream
# or
MLLD_NO_STREAM=true mlld script.mld
```

## Streaming Executors

These command types support streaming:
- `sh` / `bash` - Shell commands with live output
- `cmd` - Single commands with pipes
- `node` - Node.js scripts
- LLM clients that output NDJSON (claude, openai, etc.)

```mlld
exe @build() = stream sh {npm run build}

show @build()  >> Shows build output live
```

## NDJSON Auto-Parsing

Streaming executables that output NDJSON are automatically parsed using format adapters.

```mlld
exe @llm(prompt) = stream cmd {
  claude "@prompt" --output-format stream-json
}

show @llm("Write a haiku")
>> Parses NDJSON, shows message text as it streams
```

By default, a generic NDJSON adapter extracts text from common paths like `text`, `content`, `message`, and `data`.

## Stream Format Adapters

For better parsing of specific LLM output formats, use `streamFormat` in a with clause.

**Built-in shorthand:**

```mlld
exe @llm(prompt) = stream cmd {claude "@prompt" --output-format stream-json}

run stream @llm("Hello") with { streamFormat: "claude-code" }
```

**Installable adapter config:**

```bash
mlld install @mlld/stream-claude-agent-sdk
```

```mlld
import { @claudeAgentSdkAdapter } from @mlld/stream-claude-agent-sdk

run stream @chat("Use a tool") with { streamFormat: @claudeAgentSdkAdapter }
```

**Available Adapters**:

| Name | Aliases | Use Case |
|------|---------|----------|
| `ndjson` | - | Generic NDJSON (default) |
| `claude-code` | `claude-agent-sdk`, `@mlld/claude-agent-sdk` | Claude CLI/SDK output |

The `@mlld/stream-claude-agent-sdk` module exports `@claudeAgentSdkAdapter`, which matches the `claude-code` schema.

The `claude-code` adapter understands Claude's NDJSON format including:
- Text message chunks
- Thinking/reasoning blocks
- Tool use events
- Tool results
- Usage metadata

**Example with explicit adapter**:

```mlld
import { @claudeAgentSdkAdapter } from @mlld/stream-claude-agent-sdk
exe @chat(prompt) = stream cmd {claude "@prompt" --output-format stream-json}

>> Default parsing (generic NDJSON)
show @chat("Hello")

>> Claude-specific parsing (string shortcut)
run stream @chat("Use a tool") with { streamFormat: "claude-code" }

>> Claude-specific parsing (imported config)
run stream @chat("Use a tool") with { streamFormat: @claudeAgentSdkAdapter }
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
mlld script.mld --append-json  >> Defaults to YYYY-MM-DD-HH-MM-SS-stream.jsonl
```

Writes NDJSON to file while also showing formatted output.

## Streaming with Pipelines

Pipelines stream through stages:

```mlld
exe @analyze(text) = stream cmd {claude "Analyze: @text"}
exe @summarize(analysis) = stream cmd {claude "Summarize: @analysis"}

var @input = <large-file.md>
var @result = @input | @analyze | @summarize
show @result  >> Both stages stream
```

## Parallel Streaming

Parallel groups stream concurrently:

```mlld
exe @task1() = stream sh {sleep 2 && echo "Task 1 done"}
exe @task2() = stream sh {sleep 1 && echo "Task 2 done"}

var @results = stream @task1() || stream @task2()
>> Both tasks stream output as they complete
```

Output is buffered per task and shown when each completes.

## Streaming with show

Streaming show avoids double-printing streamed content:

```mlld
exe @llm(prompt) = stream cmd {claude "@prompt"}

show @llm("Hello")  >> Content streams once (not duplicated)
```

Without streaming, content would appear during execution and again when show displays it.

## Common Patterns

### Stream Long-Running Build

```mlld
exe @build() = stream sh {npm run build}

show @build()  >> See build output live
```

### Stream Multiple LLM Calls

```mlld
exe @chat(prompt) = stream cmd {claude "@prompt"}

for @question in @questions => @chat(@question)
>> Each question streams as it's answered
```

### Conditional Streaming

```mlld
exe @llm(prompt) = cmd {claude "@prompt"}

when @isInteractive => stream @llm("Hello")
when !@isInteractive => show @llm("Hello")
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
- Solution: Disable streaming for that call or change guards to `before`

```mlld
guard @validate after op:exe = when [
  @output.includes("ERROR") => deny "Blocked by after-guard"
  * => allow
]

exe @llm(p) = stream cmd {claude "@p"}
show @llm("test")  >> Error: streaming + after-guards conflict

>> Fix: don't use stream for this call
exe @llm2(p) = cmd {claude "@p"}
show @llm2("test")  >> Works
```

## Technical Details

**Format Adapter System**: All streaming uses format adapters to parse NDJSON:
- Default `ndjson` adapter handles generic JSON formats
- `claude-code` adapter handles Claude SDK-specific events
- Adapters extract structured data (text, tool calls, thinking) from raw chunks

**Adapter Schema Matching**: Each adapter defines schemas that match JSON events by type:
- `type: "text"` → message content
- `type: "thinking"` → reasoning blocks
- `type: "tool_use"` → tool invocations
- `type: "tool_result"` → tool outputs
- `type: "error"` → error messages

**Formatting Rules:**
- Message text: stdout with spacing/dedup
- Thinking: stderr with `💭` prefix
- Tool use: stderr with `🔧` prefix and input preview
- Tool results: suppressed (noise reduction)

**File Output:**
- `--append-json` writes to JSONL format
- Default filename: `YYYY-MM-DD-HH-MM-SS-stream.jsonl`
- Compatible with NDJSON parsing tools

**SDK Access**: When using mlld programmatically, streaming results are available via `StructuredResult.streaming`:
```typescript
const result = await interpret(script, { mode: 'structured' });
console.log(result.streaming?.text);    // Accumulated text
console.log(result.streaming?.events);  // All parsed events
```

