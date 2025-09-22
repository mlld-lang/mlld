# Claude Code SDK — Streaming JSON (End-to-End)

This example shows how to stream JSON events from the Claude (Anthropic) SDK and view them live via mlld’s streaming mode.

What you’ll see:
- Live NDJSON events printed as the model streams.
- With `--stream=full`, the JSON flows in real time in your terminal.
- With `--stream=progress`, you’ll see a per-stage word counter increment as chunks arrive.

## Prerequisites

- Set your Anthropic API key: `export ANTHROPIC_API_KEY=sk-ant-...`
- Install the SDK in this repo (root):
  - `npm install @anthropic-ai/sdk`

Note: We keep this dependency out of the main package.json to avoid bloating installs; the example assumes the SDK is installed at the repo root so `node` can resolve it.

## Run

- Full streaming output (recommended to inspect JSON):
  - `MLLD_STREAM=full mlld examples/claude-code-streaming/claude-stream.mld`

- Progress-only mode (compact):
  - `MLLD_STREAM=progress mlld examples/claude-code-streaming/claude-stream.mld`

You can also pass a custom prompt:

```
PROMPT="Summarize this repo in one sentence" \
MLLD_STREAM=full mlld examples/claude-code-streaming/claude-stream.mld
```

## Files

- `claude-stream.mld` — minimal mlld pipeline that runs a Node script.
- `stream.js` — Node script using the Anthropic SDK’s streaming API to emit NDJSON events.

## Notes

- The script prints newline-delimited JSON (NDJSON). Pipe to tools like `jq` if you want to filter/pretty-print:
  - `MLLD_STREAM=full mlld examples/claude-code-streaming/claude-stream.mld | jq -c .`
- The script attempts to use the modern `client.messages.stream(...)` API and falls back to `client.messages.create({ ..., stream: true })` if needed.

