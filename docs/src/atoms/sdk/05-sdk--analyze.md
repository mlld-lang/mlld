---
id: sdk-analyze-module
qa_tier: 3
title: Analyze Module
brief: Static analysis without execution
category: sdk
parent: sdk
tags: [configuration, sdk, analysis, static-analysis]
related: [config-sdk-execute, modules-exporting]
related-code: [sdk/analyze.ts, core/analysis/ModuleAnalyzer.ts]
updated: 2026-04-06
---

Static analysis without execution.

```typescript
const analysis = await analyzeModule('./tools.mld');

if (!analysis.valid) {
  console.error('Errors:', analysis.errors);
}

const tools = analysis.executables
  .filter(e => analysis.exports.includes(e.name));
```

`AnalyzeResult` contains:

| Field | Description |
|-------|-------------|
| `filepath` | Absolute path to analyzed file |
| `valid` | Whether the module is valid |
| `errors` | Parse/analysis errors (message, line, column) |
| `executables` | Executable definitions (name, params, labels) |
| `policies` | Policy declarations (rules, operations, refs) |
| `policyCalls` | Static `@policy.build(...)` / `@policy.validate(...)` analysis results |
| `records` | Record declarations and key/display metadata |
| `shelves` | Shelf declarations and slot metadata |
| `exports` | Exported names |
| `imports` | Import statements (source, names) |
| `guards` | Guard definitions (name, timing, trigger) |
| `needs` | Capability requirements (cmd, node, py) |

`policyCalls` entries are conservative by design: analyzable callsites return `status: "analyzed"` plus diagnostics, while dynamic callsites return `status: "skipped"` plus a skip reason. The SDK keeps skipped callsites visible so callers can decide whether to surface or ignore them.

Use cases: MCP proxy, module validation, IDE/LSP, policy auditing, security auditing.
