---
id: policy-capabilities
title: Policy Capabilities
brief: Restrict tools, filesystem, and network access
category: security
parent: security
tags: [policy, capabilities, allow, deny, danger, filesystem, network]
related: [security-policies, policy-auth, env-config, policy-composition, policy-label-flow]
related-code: [core/policy/capability-patterns.ts, interpreter/policy/filesystem-policy.ts]
updated: 2026-02-05
---

The `capabilities` object controls what operations can run.

```mlld
var @policyConfig = {
  capabilities: {
    allow: ["cmd:git:*", "cmd:npm:*", "fs:r:**", "fs:w:@base/tmp/**"],
    danger: ["@keychain", "fs:r:~/.ssh/*"],
    deny: ["sh"]
  }
}
policy @p = union(@policyConfig)

run cmd { git status }
```

**Tool restrictions:**

| Pattern | Matches |
|---------|---------|
| `cmd:git:*` | git with any subcommands |
| `cmd:npm:install:*` | npm install with any args |
| `sh` | Shell access |

Command allow/deny patterns evaluate against the interpolated command text, including `@var` substitutions.

**Filesystem patterns:**

| Pattern | Access |
|---------|--------|
| `fs:r:**` | Read any path |
| `fs:w:@base/tmp/**` | Write under tmp (implies read) |
| `fs:r:~/.config/*` | Read home config files |

**Flat syntax (shorthand):**

```mlld
var @policyConfig = {
  allow: ["cmd:echo:*", "fs:r:**"],
  deny: { sh: true, network: true }
}
policy @p = union(@policyConfig)
```

Both forms are equivalent. The nested form (`capabilities: { ... }`) is more explicit; the flat form places `allow`/`deny` at the top level as shorthand.

**Danger list:** Operations matching `danger` require explicit opt-in. Without `danger: ["@keychain"]`, keychain access is blocked even if other rules allow it.

Keychain allow/deny patterns live under `policy.keychain` and match `service/account` paths (with `{projectname}` from `mlld-config.json`).

**Common mistakes:**

- `tools` in env config only routes MCP tools — use `capabilities.deny` in policy to block commands
- Keychain access requires both `danger: ["@keychain"]` in capabilities AND `projectname` in `mlld-config.json`
- `no-secret-exfil` doesn't block `show`/`log` — add label flow rules for `op:show` and `op:log` (see `policy-auth`)

See `policy-auth` for credential flow, `env-config` for environment restrictions.
