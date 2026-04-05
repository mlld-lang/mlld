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
updated: 2026-01-05
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
| `exports` | Exported names |
| `imports` | Import statements (source, names) |
| `guards` | Guard definitions (name, timing, trigger) |
| `needs` | Capability requirements (cmd, node, py) |

Use cases: MCP proxy, module validation, IDE/LSP, security auditing.
