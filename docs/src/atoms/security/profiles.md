---
id: profiles
title: Profiles
brief: Tiered capability bundles for graceful degradation
category: security
parent: security
tags: [profiles, capabilities, degradation, policy, needs, environments]
related: [policy-composition, env-config, env-blocks, policy-capabilities, security-needs-declaration]
related-code: [interpreter/eval/profiles.ts, core/policy/needs.ts, interpreter/eval/env.ts]
updated: 2026-02-15
qa_tier: 2
---

Profiles let a module declare multiple operating modes so it can degrade gracefully when policy restricts capabilities.

```mlld
profiles {
  full: {
    requires: { sh, network },
    description: "Full development access"
  },
  network: {
    requires: { network },
    description: "Network operations without shell"
  },
  readonly: {
    requires: { },
    description: "Read-only local operations"
  }
}

show @mx.profile
```

Without a restrictive policy active, this selects `full` — the first profile whose `requires` are all satisfied.

**Syntax:**

```
profiles {
  <name>: {
    requires: { <capability>, ... },
    description: "<optional>"
  },
  ...
}
```

Each profile has a `requires` clause that uses `needs` syntax — the same capability keywords (`sh`, `network`, `cmd`, etc.) used in `needs` declarations. The `description` field is optional documentation.

**Automatic profile selection:**

Profiles are evaluated against the active policy in declaration order. The first profile whose `requires` are all permitted is selected:

```mlld
var @denyShell = { deny: { sh: true } }
policy @p = union(@denyShell)

profiles {
  full: { requires: { sh } },
  readonly: { requires: { } }
}

show @mx.profile
```

Output: `readonly` — because `sh` is denied by policy, `full` fails its requirements check and `readonly` (which requires nothing) is selected.

If no profile's requirements are satisfied, the last declared profile is used as a fallback.

**Accessing the selected profile:**

The selected profile name is available as `@mx.profile`:

```mlld
when @mx.profile == "full" => show "using all features"
when @mx.profile == "readonly" => show "read-only fallback"
```

**Manual override with `with { profile }`:**

Override automatic selection by specifying a profile in an `env` block's `with` clause:

```mlld
var @cfg = {
  profiles: {
    full: { requires: { sh: true } },
    readonly: { requires: { } }
  }
}

var @denyShell = { deny: { sh: true } }
policy @p = union(@denyShell)

env @cfg with { profile: "full" } [
  show @mx.profile
]
```

Output: `full` — the explicit override bypasses automatic selection, even though policy denies `sh`. This is useful when an outer orchestrator knows it will provide the required capabilities.

Specifying an unknown profile name throws an error with available profiles in the error details.

**Profiles in environment configs:**

When profiles are defined in an environment configuration object (rather than as a standalone `profiles` directive), they participate in `env` block setup:

```mlld
var @cfg = {
  profiles: {
    full: { requires: { sh: true } },
    readonly: { requires: { } }
  }
}

env @cfg [
  show @mx.profile
]
```

The profile is selected when the `env` block starts and restored when the block exits.

**Relationship to policy:**

Profiles do not grant capabilities. A profile selected as `full` does not enable `sh` — it tells the module's own code which path to take. Policy remains the authority on what is actually permitted. Profiles express *intent about degradation*; policy expresses *what is allowed*.

**Relationship to `needs`:**

`needs` declares what a module requires and fails if unsatisfied. `profiles` declares what a module *can use* at various tiers and selects the best available tier. Use `needs` for hard requirements; use `profiles` when the module has meaningful fallback behavior.

**When to use profiles vs. plain policy checks:**

Use profiles when:
- A module has two or more distinct operating modes
- Degradation is predictable and should be declared upfront
- You want `@mx.profile` available for branching throughout the module

Use plain `when` checks on capabilities when:
- You only need a single feature toggle
- The degradation logic is localized to one spot

See `policy-composition` for how composed policies affect selection, `env-config` for profile-based MCP configuration, `needs-declaration` for hard capability requirements.
