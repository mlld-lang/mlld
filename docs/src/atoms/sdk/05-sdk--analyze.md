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

Use cases: MCP proxy, module validation, IDE/LSP, security auditing.
