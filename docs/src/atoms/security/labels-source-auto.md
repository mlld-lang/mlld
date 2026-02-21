---
id: labels-source-auto
title: Automatic Source Labels
brief: System-applied labels that track data provenance
category: security
parent: security
tags: [labels, taint, provenance, automatic, security]
related: [labels-overview, security-label-tracking, security-guards-basics, labels-sensitivity]
related-code: [core/security/taint.ts, interpreter/eval/label-modification.ts]
updated: 2026-01-31
qa_tier: 2
---

Source labels are automatically applied by the system to track where data originates. Unlike user-declared labels (like `secret` or `pii`), you don't add these manually—they're applied when data enters the system.

**Available source labels:**

| Label | Applied When |
|-------|--------------|
| `src:file` | Content loaded from files |
| `src:exec` | Output from command execution |
| `src:user` | User input (via `@input` resolver) |
| `src:mcp` | Data from MCP tool calls |
| `src:network` | Network fetches |
| `src:dynamic` | Runtime-injected modules |
| `src:env:<provider>` | Output from environment providers |

**Directory labels:**

When loading files, directory labels (`dir:/path`) are also applied for each parent directory. This enables location-based security rules.

**File load example:**

```mlld
var @config = <@root/config.txt>
show @config.mx.taint | @parse
```

Output includes `["src:file", "dir:/path/to/parent", ...]` - the file source plus all parent directories. Note: `@root` resolves from the project root location, ensuring paths work from any working directory.

**Command execution example:**

```mlld
exe @runCmd() = run { echo "hello" }
var @result = @runCmd()
show @result.mx.taint | @parse
```

Output: `["src:exec"]`

**Why source labels matter:**

Source labels enable provenance-based security. You can write guards that restrict what external data can do:

```mlld
guard before op:exe = when [
  @input.any.mx.taint.includes("dir:/tmp/uploads") => deny "Cannot execute uploaded files"
  * => allow
]
```

**Using source labels in policy:**

Policy can set label flow rules for source labels:

```mlld
policy @p = {
  labels: {
    "src:mcp": {
      deny: ["destructive"]
    }
  }
}
```

This prevents MCP-sourced data from flowing to operations labeled `destructive`.

**Source labels vs user labels:**

- **Source labels** (`src:*`, `dir:*`) - factual provenance, auto-applied, cannot be removed
- **User labels** (`secret`, `pii`, `untrusted`) - semantic classification, manually declared, can be modified

Both flow through the `taint` field. Guards typically check `@mx.taint` to see the full picture:

```mlld
show @data.mx.taint
show @data.mx.labels
```

The `taint` array contains both source markers and user labels. The `labels` array contains only user-declared labels.
