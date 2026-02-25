---
id: security-needs-declaration
title: Needs Declarations
brief: Declare module requirements for tools, runtimes, and packages
category: security
parent: security
tags: [security, needs, modules, dependencies]
related: [modules-creating, policy-capabilities, security-policies]
related-code: [core/policy/needs.ts, interpreter/eval/needs.ts, interpreter/eval/import/ModuleNeedsValidator.ts]
updated: 2026-02-15
qa_tier: 2
---

`needs` declares module requirements. It does not authorize operations.

`needs` checks whether an environment can satisfy a module:
- Validates `cmd` and `sh` requirements against available commands.
- Validates declared package dependencies (`node/js`, `python/py`, `ruby/rb`, `go`, `rust`).
- Records requirements for import and profile selection.

Security enforcement comes from `policy` and `guard` declarations (`capabilities.allow`, `capabilities.deny`, `capabilities.danger`).

```mlld
---
name: my-tool
---

needs {
  sh,
  cmd: [git, curl],
  node: [lodash],
  python: [requests]
}
```

Supported `needs` keys and aliases:
- `cmd` - command requirements (`*`, list, or command map)
- `sh` or `bash`
- `network` or `net`
- `filesystem` or `fs`
- `node` or `js` (Node ecosystem packages)
- `python` or `py` (Python ecosystem packages)
- `ruby` or `rb` (Ruby ecosystem packages)
- `go`
- `rust`

Bare identifiers inside `needs { ... }` are shorthand command requirements:

```mlld
needs { git, curl }  >> same as cmd: [git, curl]
```

`keychain` is not a `needs` key. Control keychain access with policy capabilities:

```mlld
policy @p = {
  capabilities: {
    danger: ["@keychain"]
  }
}
```
