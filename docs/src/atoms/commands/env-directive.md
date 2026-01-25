---
id: env-directive
title: Environment Directive
brief: Scope tool access and execution context
category: commands
tags: [environment, tools, scoping, security]
related: [mcp-tool-gateway, tool-reshaping, guards-basics]
related-code: [interpreter/eval/env.ts, interpreter/env/Environment.ts]
updated: 2026-01-24
qa_tier: 2
---

The `env` directive creates scoped execution contexts with controlled tool access.

**Basic usage:**

```mlld
var @config = { tools: @agentTools }

env @config [
  run cmd { claude -p @task }
]
```

Commands inside the block see only the tools specified in the config.

**Tool scoping with { tools }:**

```mlld
exe @readData() = js { return "ok"; }
exe @writeData(x) = js { return x; }

var tools @allTools = {
  read: { mlld: @readData },
  write: { mlld: @writeData }
}

env @allTools with { tools: ["read"] } [
  >> Only 'read' tool is available here
  run cmd { claude -p @task }
]
```

The `with { tools: [...] }` clause restricts which tools from the config are visible.

**Tool scope formats:**

```mlld
>> Array of tool names
env @config with { tools: ["read", "write"] } [...]

>> Comma-separated string
env @config with { tools: "read, write" } [...]

>> Wildcard for all tools
env @config with { tools: "*" } [...]

>> Object keys as tool names
var @subset = { read: @readTool, write: @writeTool }
env @config with { tools: @subset } [...]
```

**Environment config object:**

```mlld
var @agentConfig = {
  provider: "@local",
  tools: @agentTools,
  auth: "claude"
}

env @agentConfig [
  run cmd { claude -p @task }
]
```

Common config fields:
- `tools` - Tool collection or list
- `provider` - Environment provider (e.g., "@local", "@mlld/env-docker")
- `auth` - Authentication reference

**Inline tool scoping:**

```mlld
var tools @agentTools = {
  read: { mlld: @readData },
  write: { mlld: @writeData },
  delete: { mlld: @deleteData, labels: ["destructive"] }
}

env @agentTools with { tools: ["read", "write"] } [
  >> Agent cannot access 'delete' tool
  run cmd { claude -p @task }
]
```

**Return values:**

Blocks can return values like exe blocks:

```mlld
var @result = env @config [
  let @data = run cmd { fetch-data }
  => @data
]
```

**Scoped environment:**

The env block creates a child environment. Variables defined inside don't leak out, but the block can access parent scope variables.

```mlld
var @input = "test"

env @config [
  >> Can read @input from parent
  let @processed = @input | @transform
  => @processed
]
```
