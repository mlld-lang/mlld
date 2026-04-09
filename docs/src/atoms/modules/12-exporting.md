---
id: modules-exporting
title: Exporting from Modules
brief: Control which items are visible to importers
category: modules
tags: [modules, exports, encapsulation, api]
related: [modules-creating, modules-importing-registry, box-overview, policy-auth]
related-code: [interpreter/eval/export.ts, grammar/patterns/export.peggy]
updated: 2026-04-08
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

**Environment module pattern:** Modules that wrap credentials export executables and let callers import the policy separately for credential configuration:

```mlld
policy @p = {
  auth: {
    claude: { from: "keychain:mlld-box-{projectname}/claude-dev", as: "ANTHROPIC_API_KEY" }
  }
}

exe @spawn(prompt) = run cmd { claude -p "@prompt" } using auth:claude

export { @spawn }
```

**Notes:**
- Accessing unexported items via namespace import raises a runtime error
- Exported executables do not expose captured module internals through field access
- Guards can be exported alongside variables
- Without an `export` directive, all module-level items are auto-exported
- Exported tool collections preserve their surfaced tool metadata when imported elsewhere; treat them as values, not as objects to spread
- Object spread over an exported value materializes plain data and drops wrapper metadata/identity
