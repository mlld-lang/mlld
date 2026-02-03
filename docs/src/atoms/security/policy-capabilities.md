---
id: policy-capabilities
title: Policy Capabilities
brief: Restrict tools, filesystem, and network access
category: security
parent: security
tags: [policy, capabilities, allow, deny, danger, filesystem, network]
related: [security-policies, policy-auth, env-config]
related-code: [core/policy/capability-patterns.ts, interpreter/policy/filesystem-policy.ts]
updated: 2026-02-03
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

**Danger list:** Operations matching `danger` require explicit opt-in. Without `danger: ["@keychain"]`, keychain access is blocked even if other rules allow it.

See `policy-auth` for credential flow, `env-config` for environment restrictions.
