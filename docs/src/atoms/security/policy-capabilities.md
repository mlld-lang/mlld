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
    allow: ["cmd:git:*", "cmd:npm:*", "fs:r:**", "fs:w:@root/tmp/**"],
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
| `fs:w:@root/tmp/**` | Write under tmp (implies read) |
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

**How allow and danger interact:**

`allow` and `danger` are two independent gates. `allow` is the general whitelist: it controls whether an operation is permitted at all. `danger` is a separate opt-in gate for sensitive operations that mlld considers inherently risky — reading SSH keys, force-pushing, running `sudo`, accessing the keychain, and similar. Both gates must pass for an operation to proceed.

mlld ships with a built-in default danger list (defined in `core/policy/danger.ts`) covering credential files, destructive commands, and security-bypass flags. When an operation matches the default danger list, policy blocks it *unless* the policy's `danger` array explicitly includes a matching pattern. This check runs independently of `allow` — an operation that matches `allow` but falls on the danger list is still blocked.

```mlld
var @policyConfig = {
  allow: ["cmd:git:*", "fs:r:**"],
  deny: ["sh"]
}
policy @p = union(@policyConfig)

>> allow matches cmd:git:* — but git push --force is on the
>> default danger list. Without danger: ["cmd:git:push:*:--force"],
>> this is blocked with "Dangerous capability requires allow.danger".
run cmd { git push origin main --force }
```

To unblock it, add the matching pattern to `danger`:

```mlld
var @policyConfig = {
  allow: ["cmd:git:*", "fs:r:**"],
  danger: ["cmd:git:push:*:--force"],
  deny: ["sh"]
}
policy @p = union(@policyConfig)
```

The same double-gate applies to filesystem access. `allow: ["fs:r:**"]` permits reading all files, but reading `~/.ssh/id_rsa` still requires `danger: ["fs:r:~/.ssh/*"]` because that path matches the default danger list.

**Danger list:** Operations matching `danger` require explicit opt-in. Without `danger: ["@keychain"]`, keychain access is blocked even if other rules allow it.

Keychain allow/deny patterns live under `policy.keychain` and match `service/account` paths (with `{projectname}` from `mlld-config.json`).

**Common mistakes:**

- `tools` in env config enforces runtime tool access (`Bash` for shell commands, tool names for MCP calls)
- `capabilities.deny` handles command-pattern policy rules (for example `cmd:git:push`)
- Keychain access requires both `danger: ["@keychain"]` in capabilities AND `projectname` in `mlld-config.json`
- `no-secret-exfil` doesn't block `show`/`log` — add label flow rules for `op:show` and `op:log` (see `policy-auth`)

See `policy-auth` for credential flow, `env-config` for environment restrictions.
