# SDK Examples

Working examples of common mlld integration patterns, implemented in all SDK languages (Python, Go, Rust, Ruby, Elixir).

## Examples

### [agent/](agent/) — File-processing agent

A long-running process that watches a directory for incoming files, classifies each one with an LLM, and writes structured results. Demonstrates the core pattern: **host language handles IO, mlld handles decisions**.

### [cron/](cron/) — Scheduled digest

A script designed to run on a schedule (cron, systemd timer). Gathers recent git activity and generates a readable summary. Demonstrates: **host language handles scheduling and context gathering, mlld handles synthesis**.

## Prerequisites

- `mlld` CLI installed and on PATH
- Claude Max plan signed in (via `claude` CLI) or `ANTHROPIC_API_KEY` set
- Run `mlld install @mlld/claude` inside each example directory

## The pattern

Both examples follow the same architecture used in production mlld deployments:

```
Host App (Python/Go/Rust/Ruby/Elixir)     mlld Script
├── Event loop / scheduler                 ├── Receives payload
├── Gather context (files, APIs, shell)    ├── Calls LLM (haiku/sonnet/opus)
├── Call mlld SDK: execute(script, data)   ├── Returns structured result
├── Read state_writes from result          │   via state:// writes
└── Act on result (write files, notify)    └──
```

The host language handles IO, lifecycle, and scheduling. mlld handles LLM calls, prompt construction, and structured output. This separation means you can swap event sources (file watcher → webhook → message queue) without changing the mlld logic.
