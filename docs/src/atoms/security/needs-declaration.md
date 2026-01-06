---
id: security-needs-declaration
title: Needs Declaration
brief: Declare required capabilities in modules
category: security
parent: security
tags: [security, capabilities, modules, permissions]
related: [modules-creating, security-guards-basics]
related-code: [interpreter/eval/needs.ts, core/security/Capabilities.ts]
updated: 2026-01-05
---

**Declare required capabilities in modules:**

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
