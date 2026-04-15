---
id: mcp-tool-gateway
title: Tool Collections
brief: Define surfaced tool sets from object literals or runtime MCP discovery
category: mcp
parent: mcp
tags: [mcp, tools, env, labels, collections]
related: [mcp, mcp-export, tool-reshaping, mcp-guards, exe-metadata]
related-code: [interpreter/eval/var.ts, cli/mcp/FunctionRouter.ts, cli/mcp/MCPOrchestrator.ts]
updated: 2026-04-15
qa_tier: 2
---

`var tools` defines a named collection of surfaced tools. Use it to choose the public tool names an agent sees, derive input metadata from records, attach operation labels, and add prompt/authorization metadata.

```mlld
record @send_email_inputs = {
  facts: [recipient: string],
  data: {
    trusted: [subject: string],
    untrusted: [body: string?]
  },
  validate: "strict"
}

exe tool:w @sendEmail(recipient, subject, body) = js { return "sent"; }

var tools @agentTools = {
  send_email: {
    mlld: @sendEmail,
    inputs: @send_email_inputs,
    labels: ["execute:w", "exfil:send", "comm:w"],
    description: "Send an outbound email",
    instructions: "Prefer update_draft for in-progress composition.",
    can_authorize: "role:planner"
  }
}
```

**Tool definition fields:**
- `mlld` — executable reference
- `inputs` — input-capable record reference used to derive the surfaced tool args
- `labels` — operation labels added to the invoked exe when the surfaced tool is called
- `description` — explicit tool-doc / MCP description override
- `instructions` — extra prompt guidance for explicit `@toolDocs()` and MCP annotations
- `can_authorize` — catalog shorthand for default `role:*` authorization permissions, or `false` to default-deny this surfaced tool
- `bind` — pre-fill parameters (see `tool-reshaping`)

`inputs: @record` is the canonical shipped path for surfaced tool contracts.

## Record-backed tool inputs

When a tool entry uses `inputs: @record`, the collection derives its visible arg surface from the record:

- record fields must match executable params
- every remaining executable param must be covered by either `inputs` or `bind`
- bound params cannot also appear in the record
- on write surfaces, record `facts` become effective control args
- on read-only surfaces, record `facts` become effective source args
- record `correlate: true` becomes the same-source check for multi-fact write tools
- top-level record policy sections such as `exact`, `update`, `allowlist`, `blocklist`, and `optional_benign` feed runtime validation, `@policy.build(...)`, `@toolDocs()`, and MCP descriptions from the same source definition
- if the input record declares `update:`, the surfaced tool must include `update:w` in `labels`

This keeps prompt docs, MCP schemas, runtime validation, and policy enforcement on one definition.

**Scope tools to an agent with `env`:**

```mlld
box @agent with { tools: @agentTools } [
  run cmd { claude -p @task }
]
```

The agent only sees tools in `@agentTools`. Guards check `@mx.op.labels` on each call.

Tool collections are identity-bearing runtime values. Passing `@agentTools` through exe params, imports, module exports, and box/tool APIs preserves the collection metadata (`inputs`, surfaced names, bind shaping, labels, can_authorize defaults). Object spread does not: `{ ...@agentTools }` materializes plain data and drops tool-collection identity.

**Serve a collection over MCP:**

```bash
mlld mcp tools.mld --tools-collection @agentTools
```

The `--tools-collection` flag serves the reshaped collection instead of raw exports. Bound parameters are hidden; only surfaced parameters appear in the tool schema. See `mcp-export` for basic serving, `pattern-guarded-tool-export` for a complete example.

For record-backed entries, the served schema comes from the input record fields after `bind` is applied. The same metadata also feeds injected tool notes and `@toolDocs()`.

**Guard on labels:**

```mlld
guard @blockDestructive before op:exe = when [
  @mx.op.labels.includes("destructive") => deny "Blocked"
  * => allow
]
```

Labels from the tool definition flow to `@mx.op.labels` when the surfaced tool dispatches. They do not taint the collection variable itself. See `mcp-guards`.

**Create a collection directly from a runtime MCP spec:**

```mlld
var @serverSpec = "node ./calendar-server.cjs"
var tools trusted @calendarTools = mcp @serverSpec
show @calendarTools.createEvent.description
```

This asks the MCP server for its tool schema and builds the `ToolCollection` directly from the discovered tools. It is not object-literal normalization:

- Use object literals when you want `inputs`, `bind`, descriptions/instructions, can_authorize defaults, or per-tool labels.
- Use `var tools @t = mcp @expr` when the server command is only known at runtime and you want the discovered collection as a value.
- Normal `var` labels still apply to the collection variable itself, as in `trusted @calendarTools`.

Use `import tools from mcp "..."` when you want callable functions or a namespace in the current scope. Use `var tools @t = mcp @expr` when you want to pass a runtime-built collection into `box with { tools: @t }` or other tool-collection APIs.

Direct collection dispatch also uses the surfaced collection key for policy matching:

```mlld
show @agentTools["send_email"]({
  recipient: "ada@example.com",
  subject: "Hi",
  body: "Hello"
}) with { policy: @taskPolicy }
```

If `policy.authorizations.allow` names `send_email`, that authorization matches even when the underlying executable has a different internal name.

The same surfaced key is what catalog `can_authorize` defaults, `@policy.build(...)`, injected authorization notes, and `@toolDocs()` refer to.
