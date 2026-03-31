---
id: llm-modules
title: LLM Modules
brief: The (prompt, config) convention for LLM executables and how the runtime supports it
category: modules
tags: [modules, llm, exe, config, tools, bridge, streaming, box]
related: [module-patterns, exe-simple, exe-blocks, box-blocks, stream]
related-code: [interpreter/eval/exec-invocation.ts, interpreter/env/executors/call-mcp-config.ts]
updated: 2026-03-11
qa_tier: 2
---

LLM modules follow a `(prompt, config)` calling convention. The first argument is always the prompt text. The second is an optional config object that controls model selection, tool access, streaming, and other behavior.

```mlld
import { @claude, @haiku } from @mlld/claude

>> Simple — model shortcut, no config
show @haiku("What is REST?")

>> Full control — config object
var @result = @claude("Review the auth module", {
  model: "opus",
  tools: ["Read", "Grep"],
  stream: true
})
```

## The config object

The `@mlld/claude` module defines these config fields:

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `model` | string | `"sonnet"` | Model name: `haiku`, `sonnet`, `opus` |
| `dir` | string | `@root` | Working directory for tool operations |
| `tools` | array | — | Tool access list (see below) |
| `stream` | boolean | — | Enable token streaming |
| `system` | string | — | Appended system prompt |

Poll variants (`@claudePoll`, `@claudePollJsonl`, `@claudePollEvent`) extend the config with additional fields like `poll`, `timeout`, `pattern`, `event`, and `itemId`. See the `@mlld/claude` module README for details.

**Convention, not schema:** The runtime recognizes `tools` and `dir` from the config object (see next section). Everything else — `model`, `system`, `stream` — is handled by the module implementation, not the runtime. Module authors can add their own fields.

## Runtime support for `config.tools`

When an `exe llm` function is invoked with a config object containing a `tools` property, the runtime automatically:

1. **Detects** the second argument as a config object (plain object with a `tools` key)
2. **Normalizes** the tools array (strings for built-in tools, exe refs for mlld functions)
3. **Reads `config.dir`** if present, to set the working directory for bridge operations
4. **Creates MCP bridges** — temporary servers that expose the requested tools
5. **Populates `@mx.llm`** with bridge metadata for the exe body to consume

```mlld
exe llm @agent(prompt, config) = [
  >> These are set automatically by the runtime:
  >> @mx.llm.config   — path to generated MCP config file used for explicit tool isolation
  >> @mx.llm.allowed  — unified tool name list for --allowedTools
  >> @mx.llm.native   — native tool names CSV (empty when no native tools requested)
  >> @mx.llm.inBox    — true when inside a box with active VFS bridge
  >> @mx.llm.hasTools — true when config.tools was specified

  => @prompt | cmd { claude -p --model sonnet --allowedTools "@mx.llm.allowed" }
]
```

This is why `exe llm` functions don't need to manually construct `--mcp-config` flags or manage bridge lifecycles — the runtime handles it.

### Tool types in the array

The `tools` array accepts a mix of string names and exe references:

```mlld
exe @summarize(text) = cmd { ... }

var @r = @claude("Analyze this codebase", {
  tools: ["Read", "Grep", @summarize]
})
```

| Entry type | What happens |
|------------|-------------|
| String (`"Read"`) | Routed to built-in capability. Inside a box, proxied through VFS bridge. Outside a box, passed as native CLI tool name. |
| Exe ref (`@summarize`) | Wrapped as an MCP tool via a function bridge. The runtime generates a JSON schema from the function signature. |

### Empty tools

Passing an empty array signals "no tools" — the runtime sets `@mx.llm.hasTools = true`, keeps `@mx.llm.allowed` empty, and still provides an empty strict MCP config so modules can disable built-ins and block ambient MCP connectors:

```mlld
var @r = @claude("Pure text generation", { tools: [] })
```

## Box interaction

Tool routing changes based on whether the call happens inside a `box`:

**Outside a box:** String tools pass through as native names. The child process uses them directly.

**Inside a box:** String tools are proxied through the workspace VFS bridge. File operations route through the box's in-memory filesystem, and the child process cannot access the real filesystem.

```mlld
var @ws = box [
  file "data.csv" = "id,name\n1,Alice\n2,Bob"
  let @r = @claude("Summarize the CSV file", {
    model: "haiku",
    tools: ["Read"]
  })
  >> @claude's Read tool sees data.csv in the VFS, not the real filesystem
  => @r
]
```

The `@mx.llm.native` field tells module implementations which native tools are active. When `config.tools` is explicit, modules should also use `@mx.llm.config` as a strict MCP config even if it only contains an empty server set. This prevents the child LLM from inheriting ambient MCP connectors while still allowing modules to pass `--tools ""` or an equivalent empty native allowlist when `native` is empty.

## Streaming

Streaming is wired at the exe definition level using `with { stream, streamFormat }`:

```mlld
exe llm @myLLM(prompt, config) = [
  let @cfg = @config ? @config : {}
  => @prompt | cmd { claude -p --model sonnet }
] with { stream: @cfg.stream, streamFormat: @myAdapter }
```

The `@mlld/claude` module does this internally — when you pass `stream: true` in config, the underlying exe's `with` clause activates streaming. You don't need to configure this when using the module:

```mlld
show @claude("Explain TCP/IP", { model: "haiku", stream: true })
```

See `stream` for format adapters and streaming details.

## Writing your own LLM module

An LLM module follows this pattern:

```mlld
>> 1. Label with llm so the runtime processes config.tools
>> 2. Accept (prompt, config) as the calling convention
>> 3. Read @mx.llm for bridge metadata set by the runtime

exe llm @myLLM(prompt, config) = [
  let @cfg = @config ? @config : {}
  let @model = @cfg.model ? @cfg.model : "sonnet"

  => when [
    @mx.llm && @mx.llm.config && @mx.llm.native => @prompt | cmd {
      my-llm-cli --model @model --mcp-config "@mx.llm.config" --tools "@mx.llm.allowed"
    }
    @mx.llm && @mx.llm.config => @prompt | cmd {
      my-llm-cli --model @model --disable-builtin-tools --mcp-config "@mx.llm.config" --tools "@mx.llm.allowed"
    }
    * => @prompt | cmd {
      my-llm-cli --model @model
    }
  ]
]

>> Model shortcuts
exe llm @fast(prompt) = @myLLM(@prompt, { model: "fast" })
exe llm @smart(prompt) = @myLLM(@prompt, { model: "smart" })

export { @myLLM, @fast, @smart }
```

**Key points:**

- The `llm` label is required — without it, the runtime won't process `config.tools` or populate `@mx.llm`
- Always default missing config: `let @cfg = @config ? @config : {}`
- Branch on `@mx.llm.config` and `@mx.llm.native` to handle bridged, exe-ref-only, and unbridged invocations
- Shortcuts should delegate to the core exe, not duplicate the implementation
- The runtime cleans up bridge temp files automatically when the exe scope exits
