---
id: security-needs-declaration
title: Needs Declaration
brief: Declare required capabilities in modules
category: security
parent: security
tags: [security, needs, capabilities, modules]
related: [modules-creating, security-guards-basics]
related-code: [core/module/NeedsParser.ts]
updated: 2026-01-05
qa_tier: 2
---

```mlld
---
name: my-tool
---

needs {
  js: []
  sh
}
```

Capabilities: `js`, `sh`, `cmd`, `node`, `python`, `network`, `filesystem`
