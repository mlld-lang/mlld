---
id: modules-exporting
title: Exporting from Modules
brief: Control which items are visible to importers
category: modules
parent: modules
tags: [modules, exports, encapsulation, api]
related: [modules-creating, modules-importing-registry, env-overview, policy-auth]
related-code: [interpreter/eval/export.ts, grammar/patterns/export.peggy]
updated: 2026-02-09
qa_tier: 2
---

Modules only expose items listed in `export { }`. Unexported items stay private.

```mlld
exe @greet(name) = `Hello, @name!`
exe @farewell(name) = `Goodbye, @name!`
var @_helper = "internal"

>> Only @greet and @farewell are visible to importers
export { @greet, @farewell }
```

**Why explicit exports:** Encapsulation. Importers see a clean API surface. Internal helpers, intermediate variables, and implementation details stay hidden. Rename or remove internals without breaking callers.

**Wildcard export:** Export everything (same as no `export` directive):

```mlld
export { * }
```

**Environment module pattern:** Modules that wrap credentials export executables and let callers import the policy separately:

```mlld
var @policyConfig = {
  auth: {
    claude: { from: "keychain:mlld-env-{projectname}/claude-dev", as: "ANTHROPIC_API_KEY" }
  }
}
policy @p = union(@policyConfig)

exe @spawn(prompt) = run cmd { claude -p "@prompt" } using auth:claude

export { @spawn }
```

**Notes:**
- Accessing unexported items via namespace import raises a runtime error
- Guards can be exported alongside variables
- Without an `export` directive, all module-level items are auto-exported
