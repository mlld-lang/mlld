# Agent Example: File Processor

A long-running agent that watches `inbox/` for new markdown files, classifies each one using an LLM, and writes results to `done/`.

## How it works

1. Host app watches `inbox/` for new `.md` files
2. On new file: reads content, calls `mlld execute` with the file as payload
3. mlld script (`llm/process.mld`) sends content to haiku for classification
4. Host app reads the classification from `state_writes` and writes `done/{name}.result.json`
5. Original file moves to `done/`

## Setup

```bash
cd docs/examples/sdk/agent
mlld install @mlld/claude
```

## Run

Pick your language:

```bash
# Python (requires: pip install mlld-sdk watchdog)
python python/agent.py

# Go (requires: go get github.com/mlld-lang/mlld/sdk/go github.com/fsnotify/fsnotify)
cd go && go run agent.go

# Rust
cd rust && cargo run

# Ruby (requires: gem install mlld)
ruby ruby/agent.rb

# Elixir (requires: mlld hex package)
elixir elixir/agent.exs
```

## Try it

With the agent running, drop a file into `inbox/`:

```bash
echo "The login page returns a 500 error when the session cookie is expired." > inbox/bug-report.md
```

Check `done/` for the classification:

```bash
cat done/bug-report.result.json
```

```json
{
  "priority": "high",
  "category": "bug",
  "summary": "Login page crashes on expired session cookies"
}
```

## Adapting this pattern

The file watcher is the simplest event source. In production, swap it for:

- **HTTP webhook**: Accept POST requests, extract payload, call `execute`
- **Message queue**: Poll SQS/Redis/RabbitMQ, process each message
- **Telegram/Slack bot**: Listen for messages, classify and respond
- **Database poll**: Check for new rows, process each one

The mlld script stays the same — only the host app's event loop changes.
